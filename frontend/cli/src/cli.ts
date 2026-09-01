import readline from 'node:readline';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { renderFiltered } from './render';
import { findNode, pathOf } from './resolve';
import { defaultStatePath, FileStorage, readToken } from './storage';
import { DEFAULT_SERVER, LOCAL_USER, loadCurrentUser, saveCurrentUser } from './config';
import { completeLine } from './completion';
import { COMMANDS } from './commands';
import { createCommandIO, createDispatcher, errMsg, findCommand, isSuppressingUpdates, printConflict } from './command';
import type { CommandContext, CommandIO, CommandResult } from './command';

const dispatch = createDispatcher(COMMANDS);

const AUTH_ONE_SHOT = new Set(['register', 'login', 'logout']);

/** Minimal IO for one-shot auth commands — they never touch the tree. */
function authStubIO(cmd: string): CommandIO {
  return {
    get client(): WorktreeClient {
      throw new Error('no client for auth commands');
    },
    out: (line?: string) => console.log(line ?? ''),
    get cwdId(): string {
      return ROOT_ID;
    },
    set cwdId(_value: string) {},
    get currentUser(): string {
      return loadCurrentUser();
    },
    set currentUser(_value: string) {},
    get filter() {
      return {};
    },
    set filter(_value) {},
    get filterMode(): 'hide' {
      return 'hide';
    },
    set filterMode(_value) {},
    switchUser: async (name: string): Promise<void> => {
      saveCurrentUser(name);
    },
    usage: (text?: string): 'ok' => {
      console.log(`usage: ${text ?? cmd}`);
      return 'ok';
    },
    refNode: () => null,
    cwdNode: () => {
      throw new Error('no client for auth commands');
    },
  };
}

function newClient(user: string): WorktreeClient {
  const local = user === LOCAL_USER;
  const token = local ? undefined : readToken(DEFAULT_SERVER, user)?.token;
  if (!local && token === undefined) {
    throw new Error(`"${user}" is not logged in on this device — run "worktree login ${user}" first`);
  }
  return new WorktreeClient({
    serverUrl: DEFAULT_SERVER,
    user,
    token,
    local,
    storage: new FileStorage(defaultStatePath(DEFAULT_SERVER, user)),
  });
}

function printAuthFailure(client: WorktreeClient, user: string): void {
  if (client.isAuthFailed()) {
    console.log(`error: login expired — run "worktree login ${user}" to log in again`);
  }
}

/** Drain pending stdout writes (pipes are async), then force-exit. */
function exitAfterFlush(code: number): void {
  process.stdout.write('', () => process.exit(code));
}

process.on('SIGINT', () => exitAfterFlush(130));

async function runCommand(io: CommandIO, line: string): Promise<CommandResult> {
  const trimmed = line.trim();
  if (!trimmed) return 'ok';
  const [cmd, ...args] = trimmed.split(/\s+/);
  try {
    return await dispatch(io, cmd, args);
  } catch (e) {
    io.out(`error: ${errMsg(e)}`);
    return 'ok';
  }
}

async function repl(): Promise<void> {
  const startUser = loadCurrentUser();
  let client: WorktreeClient;
  try {
    client = newClient(startUser);
  } catch (e) {
    console.error(`error: ${errMsg(e)}`);
    exitAfterFlush(1);
    return;
  }
  const ctx: CommandContext = {
    client,
    out: (line) => console.log(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: startUser,
    filter: {},
    filterMode: 'hide',
  };
  const io = createCommandIO(ctx);

  function onTreeChange(): void {
    if (isSuppressingUpdates()) return;
    if (!findNode(client.getTree(), io.cwdId)) {
      io.cwdId = ROOT_ID;
      console.log('* cwd removed — back to /');
    }
    // if (process.stdin.isTTY) {
    //   console.log('* updated *');
    //   console.log(renderTree(client.getTree()));
    // }
    if (client.getConflict()) printConflict(io);
  }
  let unsubscribe = client.subscribe(onTreeChange);

  io.switchUser = async (name: string): Promise<void> => {
    const prev = client;
    const prevUser = ctx.currentUser;
    prev.disconnect();
    unsubscribe();
    if (prev.getPendingCount() > 0) {
      console.log(`note: ${prev.getPendingCount()} op(s) of "${prevUser}" are still pending — kept in local storage`);
    }
    saveCurrentUser(name);
    client = newClient(name);
    ctx.client = client;
    ctx.currentUser = name;
    unsubscribe = client.subscribe(onTreeChange);
    // One attempt; on failure the socket's backoff loop keeps trying.
    if (!client.isLocal()) await client.reconnect();
    printAuthFailure(client, name);
    console.log(`user: ${name}${client.isLocal() ? ' (local — offline only)' : ''}`);
    console.log(renderFiltered(client.getTree(), io.filter, io.filterMode));
  };

  // One attempt; on failure the socket's backoff loop keeps trying.
  if (!client.isLocal()) await client.reconnect();
  printAuthFailure(client, ctx.currentUser);
  console.log(renderFiltered(client.getTree(), io.filter, io.filterMode));

  if (process.stdin.isTTY) {
    console.log(`server: ${DEFAULT_SERVER} — user: ${ctx.currentUser} — type "help" for commands`);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line: string) => completeLine(client.getTree(), io.cwdId, line),
    });
    // Drive the loop from the async iterator: it buffers lines that arrive
    // between commands (pasted input), while repeated question() calls
    // would drop them.
    const lines = rl[Symbol.asyncIterator]();
    for (;;) {
      process.stdout.write(`worktree:${pathOf(client.getTree(), io.cwdId)}> `);
      const next = await lines.next();
      if (next.done) break; // stdin closed
      if ((await runCommand(io, next.value)) === 'exit') break;
    }
    rl.close();
  } else {
    // Non-interactive: execute every stdin line in order, then flush and exit.
    for (const line of (await readStdin()).split('\n')) {
      if ((await runCommand(io, line)) === 'exit') break;
    }
  }

  client.disconnect();
  exitAfterFlush(0);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await repl();
    return;
  }
  const [cmd, ...rest] = args;
  // Auth commands run before any client exists (there is no token yet).
  if (AUTH_ONE_SHOT.has(cmd)) {
    await dispatch(authStubIO(cmd), cmd, rest);
    exitAfterFlush(Number(process.exitCode ?? 0));
    return;
  }
  // One-shot mode: run a single command and exit (for scripts and quick tests).
  const user = loadCurrentUser();
  let client: WorktreeClient;
  try {
    client = newClient(user);
  } catch (e) {
    console.error(`error: ${errMsg(e)}`);
    exitAfterFlush(1);
    return;
  }
  const ctx: CommandContext = {
    client,
    out: (line) => console.log(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: user,
    filter: {},
    filterMode: 'hide',
  };
  const io = createCommandIO(ctx);
  // One-shot: the session ends right after, so switching only persists the preference.
  io.switchUser = async (name: string): Promise<void> => {
    saveCurrentUser(name);
    ctx.currentUser = name;
    console.log(`user: ${name}`);
  };
  if (!client.isLocal()) {
    // One attempt; on failure the socket's backoff loop keeps trying.
    await client.reconnect();
    if (client.isAuthFailed()) {
      console.error(`error: login expired — run "worktree login ${user}" to log in again`);
      process.exitCode = 1;
    }
  }
  const command = findCommand(COMMANDS, cmd);
  let ran = false;
  try {
    await dispatch(io, cmd, rest);
    ran = true;
  } catch (e) {
    console.error(`error: ${errMsg(e)}`);
    process.exitCode = 1;
  }
  if (ran && command?.mutatesTree) {
    console.log(renderFiltered(client.getTree(), io.filter, io.filterMode));
  }
  client.disconnect();
  if (client.getConflict()) printConflict(io);
  exitAfterFlush(Number(process.exitCode ?? 0));
}

main().catch((e) => {
  console.error(errMsg(e));
  process.exit(1);
});
