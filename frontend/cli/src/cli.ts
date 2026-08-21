import readline from 'node:readline';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { renderTree } from './render';
import { findNode, pathOf } from './resolve';
import { FileStorage } from './storage';
import { DEFAULT_SERVER, STATE_PATH } from './config';
import { completeLine } from './completion';
import { COMMANDS } from './commands';
import { createCommandIO, createDispatcher, errMsg, isSuppressingUpdates, printConflict } from './command';
import type { CommandIO, CommandResult } from './command';

const dispatch = createDispatcher(COMMANDS);

function newClient(): WorktreeClient {
  return new WorktreeClient({ serverUrl: DEFAULT_SERVER, storage: new FileStorage(STATE_PATH) });
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
  const client = newClient();
  const io = createCommandIO({ client, out: (line) => console.log(line ?? ''), cwdId: ROOT_ID });

  client.subscribe(() => {
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
  });
  client.connect();
  try {
    await client.sync();
  } catch {
    // server may be down; the socket keeps retrying
  }
  console.log(renderTree(client.getTree()));

  if (process.stdin.isTTY) {
    console.log(`server: ${DEFAULT_SERVER} — type "help" for commands`);
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
  const client = newClient();
  const io = createCommandIO({ client, out: (line) => console.log(line ?? ''), cwdId: ROOT_ID });
  client.connect();
  try {
    await client.sync();
  } catch {
    // offline is fine for queued edits
  }
  // Give the websocket a moment to open so online status (and the auto-flush) is accurate.
  for (let i = 0; i < 20 && !client.isOnline(); i++) {
    await new Promise((r) => setTimeout(r, 100));
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
