import readline from 'node:readline';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { renderFiltered } from './render';
import { findNode, pathOf } from './resolve';
import { defaultStatePath, FileStorage } from './storage';
import { DEFAULT_SERVER, LOCAL_USER, loadCurrentUser, saveCurrentUser } from './config';
import { completeLine } from './completion';
import { COMMANDS } from './commands';
import { createCommandIO, createDispatcher, errMsg, isSuppressingUpdates, printConflict } from './command';
import type { CommandContext, CommandIO, CommandResult } from './command';

const dispatch = createDispatcher(COMMANDS);

function newClient(user: string): WorktreeClient {
  return new WorktreeClient({
    serverUrl: DEFAULT_SERVER,
    user,
    local: user === LOCAL_USER,
    storage: new FileStorage(defaultStatePath(DEFAULT_SERVER, user)),
  });
}

const EXIT_FLUSH_BUDGET_MS = 2000;

/**
 * Best-effort final flush with a time budget. Every edit is already persisted
 * synchronously, so a bounded flush loses nothing durable — it only decides
 * whether the server saw the ops before we leave.
 */
async function shutdown(client: WorktreeClient): Promise<void> {
  await Promise.race([
    client.sync().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, EXIT_FLUSH_BUDGET_MS)),
  ]);
  client.disconnect();
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
    return await dispatch(io, cmd!, args);
  } catch (e) {
    io.out(`error: ${errMsg(e)}`);
    return 'ok';
  }
}

async function repl(): Promise<void> {
  let client = newClient(loadCurrentUser());
  const ctx: CommandContext = {
    client,
    out: (line) => console.log(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: loadCurrentUser(),
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
    await shutdown(prev);
    unsubscribe();
    if (prev.getPendingCount() > 0) {
      console.log(`note: ${prev.getPendingCount()} op(s) of "${prevUser}" are still pending — kept in local storage`);
    }
    saveCurrentUser(name);
    client = newClient(name);
    ctx.client = client;
    ctx.currentUser = name;
    unsubscribe = client.subscribe(onTreeChange);
    client.connect();
    if (!client.isLocal()) {
      try {
        await client.sync();
      } catch {
        // server may be down; the socket keeps retrying
      }
    }
    console.log(`user: ${name}${client.isLocal() ? ' (local — offline only)' : ''}`);
    console.log(renderFiltered(client.getTree(), io.filter, io.filterMode));
  };

  client.connect();
  if (!client.isLocal()) {
    try {
      await client.sync();
    } catch {
      // server may be down; the socket keeps retrying
    }
  }
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

  await shutdown(client);
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
  // One-shot mode: run a single command and exit (for scripts and quick tests).
  const user = loadCurrentUser();
  const client = newClient(user);
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
  client.connect();
  if (!client.isLocal()) {
    try {
      await client.sync();
    } catch {
      // offline is fine for queued edits
    }
    // Give the websocket a moment to open so online status (and the auto-flush) is accurate.
    for (let i = 0; i < 20 && !client.isOnline(); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const [cmd, ...rest] = args;
  try {
    await dispatch(io, cmd!, rest);
  } catch (e) {
    console.error(`error: ${errMsg(e)}`);
    process.exitCode = 1;
  }
  await shutdown(client);
  if (client.getConflict()) printConflict(io);
  exitAfterFlush(Number(process.exitCode ?? 0));
}

main().catch((e) => {
  console.error(errMsg(e));
  process.exit(1);
});
