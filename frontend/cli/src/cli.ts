import readline from 'node:readline/promises';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { formatNode, renderTree, shortId } from './render';
import { findNode, pathOf, resolveRef } from './resolve';
import { FileStorage, defaultStatePath } from './storage';

const DEFAULT_SERVER = process.env.WORKTREE_SERVER ?? 'http://localhost:3000';
const WORKTREE_USER = process.env.WORKTREE_USER ?? 'default';
const STATE_PATH = defaultStatePath(DEFAULT_SERVER, WORKTREE_USER);

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

interface Ctx {
  client: WorktreeClient;
  out: (line?: string) => void;
  /** Working node; `ROOT_ID` means the root. */
  cwdId: string;
}

let suppressUpdates = false;

const HELP = [
  'commands:',
  '  tree [ref]                     print the tree (defaults to cwd; "tree /" for the whole tree)',
  '  ls [ref]                       list the children of a node (defaults to cwd)',
  '  cd [ref] | pwd                 change / print the working node (no arg: back to /)',
  '  add <name> [parentRef] [w]     add a node (parent defaults to the cwd)',
  '  rm [-r] <ref>                  remove a node (-r required when it has children)',
  '  rename <ref> <name>            rename a node',
  '  mv <ref> <parentRef> [w]       move a node (keeps its weight without w)',
  '  cp <ref> <parentRef> [w]       shallow-copy a node (auto-renames on name collision)',
  '  cpl <ref> / uncpl <ref>        complete / uncomplete a node',
  '  reminder add <nodeRef> <name> <deadline> [repeatMs]',
  '  reminder rm <rmdId>            remove a reminder',
  '  reminder edit <rmdId> k=v ...  keys: name, deadline, repeat (repeat=null clears), active',
  '  sync                           manual flush + catch-up (runs automatically while online)',
  '  stats                          server statistics',
  '  status                         online state, pending count, conflict',
  '  resolve server|local           resolve a sync conflict',
  '  help | exit',
  '',
  'refs: linux-style paths — /a/b absolute, a/b relative to cwd, "." ".." — plus',
  'full id, unique id prefix (4+ chars shown in tree), unique name, or root.',
].join('\n');

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseTimestamp(ctx: Ctx, s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  ctx.out(`invalid timestamp: ${s} (use epoch ms or ISO like 2026-08-21T10:00)`);
  return null;
}

async function afterCommand(ctx: Ctx): Promise<void> {
  // The kernel flushes pending ops automatically while online; this just
  // tells the user what happened to their op.
  if (!ctx.client.isOnline()) ctx.out('(offline — op queued, will sync on reconnect)');
}

function printConflict(ctx: Ctx): void {
  const conflict = ctx.client.getConflict();
  if (!conflict) return;
  ctx.out(`CONFLICT at ${conflict.baseId ?? '(empty history)'}`);
  ctx.out('  server branch:');
  for (const n of conflict.serverBranch) ctx.out(`    ${n.id} ${n.op.kind}`);
  ctx.out('  local branch (pending):');
  for (const p of conflict.localBranch) ctx.out(`    ${p.id} ${p.kind === 'add' ? p.op.kind : p.kind}`);
  ctx.out('resolve with: resolve server | resolve local');
}

function mutate<T>(fn: () => T): T {
  suppressUpdates = true;
  try {
    return fn();
  } finally {
    suppressUpdates = false;
  }
}

/** The current working node; falls back to the root when the cwd was removed. */
function cwdNode(ctx: Ctx): Node {
  const tree = ctx.client.getTree();
  const node = findNode(tree, ctx.cwdId);
  if (node) return node;
  ctx.cwdId = ROOT_ID;
  return tree;
}

async function execArgs(ctx: Ctx, cmd: string, args: string[]): Promise<'exit' | 'ok'> {
  const c = ctx.client;
  const out = ctx.out;
  const usage = (text: string): 'ok' => {
    out(`usage: ${text}`);
    return 'ok';
  };
  const refNode = (ref: string | undefined) => {
    if (ref === undefined) return null;
    try {
      return resolveRef(c.getTree(), ref, cwdNode(ctx));
    } catch (e) {
      out(errMsg(e));
      return null;
    }
  };

  switch (cmd) {
    case 'help':
      out(HELP);
      return 'ok';
    case 'exit':
    case 'quit':
      return 'exit';
    case 'tree': {
      const node = args[0] !== undefined ? refNode(args[0]) : cwdNode(ctx);
      if (node) out(renderTree(node));
      return 'ok';
    }
    case 'ls': {
      const node = args[0] !== undefined ? refNode(args[0]) : cwdNode(ctx);
      if (!node) return 'ok';
      for (const child of node.children) out(formatNode(child));
      return 'ok';
    }
    case 'cd': {
      if (args[0] === undefined) {
        ctx.cwdId = ROOT_ID;
        return 'ok';
      }
      const node = refNode(args[0]);
      if (node) ctx.cwdId = node.id;
      return 'ok';
    }
    case 'pwd': {
      out(pathOf(c.getTree(), ctx.cwdId));
      return 'ok';
    }
    case 'add': {
      if (args.length < 1) return usage('add <name> [parentRef] [weight]');
      const name = args[0]!;
      let parent = cwdNode(ctx);
      if (args[1] !== undefined) {
        const resolved = refNode(args[1]);
        if (!resolved) return 'ok';
        parent = resolved;
      }
      let weight: number | undefined;
      if (args[2] !== undefined) {
        weight = Number(args[2]);
        if (Number.isNaN(weight)) {
          out(`invalid weight: ${args[2]}`);
          return 'ok';
        }
      }
      const id = mutate(() => c.addNode(parent.id, name, weight));
      out(`added "${name}" [${shortId(id)}]`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'rm': {
      let recursive = false;
      let ref: string | undefined;
      for (const a of args) {
        if (a === '-r' || a === '--recursive') recursive = true;
        else ref = a;
      }
      if (ref === undefined) return usage('rm [-r] <ref>');
      const node = refNode(ref);
      if (!node) return 'ok';
      if (node.children.length > 0 && !recursive) {
        out(`"${node.name}" has ${node.children.length} child node(s) — use rm -r to remove the whole subtree`);
        return 'ok';
      }
      mutate(() => c.removeNode(node.id));
      out(`removed ${node.name}`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'rename': {
      if (args.length < 2) return usage('rename <ref> <name>');
      const node = refNode(args[0]);
      if (!node) return 'ok';
      mutate(() => c.renameNode(node.id, args[1]!));
      out(`renamed to "${args[1]}"`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'mv': {
      if (args.length < 2) return usage('mv <ref> <parentRef> [weight]');
      const node = refNode(args[0]);
      const parent = refNode(args[1]);
      if (!node || !parent) return 'ok';
      let weight: number | undefined;
      if (args[2] !== undefined) {
        weight = Number(args[2]);
        if (Number.isNaN(weight)) {
          out(`invalid weight: ${args[2]}`);
          return 'ok';
        }
      }
      mutate(() => c.moveNode(node.id, parent.id, weight));
      out(`moved ${node.name} under ${parent.id === ROOT_ID ? '/' : parent.name}`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'cp': {
      if (args.length < 2) return usage('cp <ref> <parentRef> [weight]');
      const node = refNode(args[0]);
      const parent = refNode(args[1]);
      if (!node || !parent) return 'ok';
      let weight: number | undefined;
      if (args[2] !== undefined) {
        weight = Number(args[2]);
        if (Number.isNaN(weight)) {
          out(`invalid weight: ${args[2]}`);
          return 'ok';
        }
      }
      const id = mutate(() => c.copyNode(node.id, parent.id, weight));
      out(`copied "${node.name}" [${shortId(id)}]`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'cpl':
    case 'uncpl': {
      if (args.length < 1) return usage(`${cmd} <ref>`);
      const node = refNode(args[0]);
      if (!node) return 'ok';
      mutate(() => c.setCompleted(node.id, cmd === 'cpl'));
      out(`${node.name} ${cmd === 'cpl' ? 'completed' : 'uncompleted'}`);
      await afterCommand(ctx);
      return 'ok';
    }
    case 'reminder': {
      const sub = args[0];
      if (sub === 'add') {
        if (args.length < 4) return usage('reminder add <nodeRef> <name> <deadline> [repeatMs]');
        const node = refNode(args[1]);
        if (!node) return 'ok';
        const deadline = parseTimestamp(ctx, args[3]!);
        if (deadline === null) return 'ok';
        let repeat: number | undefined;
        if (args[4] !== undefined) {
          repeat = Number(args[4]);
          if (Number.isNaN(repeat)) {
            out(`invalid repeat: ${args[4]}`);
            return 'ok';
          }
        }
        const rmdId = mutate(() => c.addReminder(node.id, args[2]!, deadline, repeat));
        out(`added reminder [${shortId(rmdId)}]`);
        await afterCommand(ctx);
        return 'ok';
      }
      if (sub === 'rm') {
        if (args.length < 2) return usage('reminder rm <rmdId>');
        mutate(() => c.removeReminder(args[1]!));
        out('reminder removed');
        await afterCommand(ctx);
        return 'ok';
      }
      if (sub === 'edit') {
        if (args.length < 3) return usage('reminder edit <rmdId> name=X deadline=Y repeat=null active=false');
        const patch: { name?: string; deadline?: number; repeat?: number | null; active?: boolean } = {};
        for (const kv of args.slice(2)) {
          const eq = kv.indexOf('=');
          if (eq <= 0) {
            out(`invalid key=value: ${kv}`);
            return 'ok';
          }
          const key = kv.slice(0, eq);
          const value = kv.slice(eq + 1);
          if (key === 'name') patch.name = value;
          else if (key === 'deadline') {
            const t = parseTimestamp(ctx, value);
            if (t === null) return 'ok';
            patch.deadline = t;
          } else if (key === 'repeat') {
            const r = value === 'null' ? null : Number(value);
            if (r !== null && Number.isNaN(r)) {
              out(`invalid repeat: ${value}`);
              return 'ok';
            }
            patch.repeat = r;
          } else if (key === 'active') patch.active = value === 'true';
          else {
            out(`unknown field: ${key}`);
            return 'ok';
          }
        }
        mutate(() => c.editReminder(args[1]!, patch));
        out('reminder updated');
        await afterCommand(ctx);
        return 'ok';
      }
      return usage('reminder add|rm|edit ...');
    }
    case 'sync': {
      try {
        const result = await c.sync();
        out(result === 'conflict' ? 'conflict — resolve with: resolve server|local' : result === 'offline' ? 'server offline — ops stay queued' : 'ok');
        if (result === 'conflict') printConflict(ctx);
      } catch (e) {
        out(`sync failed: ${errMsg(e)}`);
      }
      out(renderTree(c.getTree()));
      return 'ok';
    }
    case 'stats': {
      try {
        const s = await c.getStats();
        out(`ops=${s.opCount} nodes=${s.nodeCount} reminders=${s.reminderCount} server=${s.state}`);
      } catch (e) {
        out(`stats failed: ${errMsg(e)}`);
      }
      return 'ok';
    }
    case 'status': {
      const conflict = c.getConflict();
      out(
        `online=${c.isOnline()} pending=${c.getPendingCount()} conflict=${conflict ? `yes (base ${conflict.baseId ?? 'empty'})` : 'no'}`,
      );
      out(`storage: ${STATE_PATH}`);
      return 'ok';
    }
    case 'resolve': {
      const choice = args[0];
      if (choice !== 'server' && choice !== 'local') return usage('resolve server|local');
      try {
        await c.resolveConflict(choice);
        out(choice === 'local' ? 'rewrote the server history' : 'adopted the server history');
      } catch (e) {
        out(`resolve failed: ${errMsg(e)}`);
      }
      out(renderTree(c.getTree()));
      return 'ok';
    }
    default:
      out(`unknown command: ${cmd} (type "help")`);
      return 'ok';
  }
}

async function runCommand(ctx: Ctx, line: string): Promise<'exit' | 'ok'> {
  const trimmed = line.trim();
  if (!trimmed) return 'ok';
  const [cmd, ...args] = trimmed.split(/\s+/);
  try {
    return await execArgs(ctx, cmd!, args);
  } catch (e) {
    ctx.out(`error: ${errMsg(e)}`);
    return 'ok';
  }
}

async function repl(): Promise<void> {
  const client = newClient();
  const ctx: Ctx = { client, out: (line) => console.log(line ?? ''), cwdId: ROOT_ID };

  client.subscribe(() => {
    if (suppressUpdates) return;
    if (!findNode(client.getTree(), ctx.cwdId)) {
      ctx.cwdId = ROOT_ID;
      console.log('* cwd removed — back to /');
    }
    // if (process.stdin.isTTY) {
    //   console.log('* updated *');
    //   console.log(renderTree(client.getTree()));
    // }
    if (client.getConflict()) printConflict(ctx);
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
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      let line: string;
      try {
        line = await rl.question(`worktree:${pathOf(client.getTree(), ctx.cwdId)}> `);
      } catch {
        break; // stdin closed
      }
      if ((await runCommand(ctx, line)) === 'exit') break;
    }
    rl.close();
  } else {
    // Non-interactive: execute every stdin line in order, then flush and exit.
    for (const line of (await readStdin()).split('\n')) {
      if ((await runCommand(ctx, line)) === 'exit') break;
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
  const ctx: Ctx = { client, out: (line) => console.log(line ?? ''), cwdId: ROOT_ID };
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
    await execArgs(ctx, cmd!, rest);
  } catch (e) {
    console.error(`error: ${errMsg(e)}`);
    process.exitCode = 1;
  }
  await shutdown(client);
  if (client.getConflict()) printConflict(ctx);
  exitAfterFlush(Number(process.exitCode ?? 0));
}

main().catch((e) => {
  console.error(errMsg(e));
  process.exit(1);
});
