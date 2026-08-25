import { ROOT_ID } from '@worktree/core';
import type { Node, NodeFilter } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { findNode, resolveRef } from './resolve';

/** How a non-empty filter renders: hide non-matching nodes, or highlight matches. */
export type FilterDisplayMode = 'hide' | 'highlight';

/** Mutable shell state shared with the REPL (cwd tracking, current client). */
export interface CommandContext {
  /** Swapped by `user switch`; everything reading io.client sees the new client. */
  client: WorktreeClient;
  out: (line?: string) => void;
  /** Working node; `ROOT_ID` means the root. `cd` mutates it. */
  cwdId: string;
  /** The active username (updated on `user switch`). */
  currentUser: string;
  /** Active display filter (session-only, not persisted). */
  filter: NodeFilter;
  /** How a non-empty filter renders. */
  filterMode: FilterDisplayMode;
}

/** Everything a command needs to run. Bound by createCommandIO once per session. */
export interface CommandIO {
  readonly out: (line?: string) => void;
  /** Live getter — survives client swaps on `user switch`. */
  readonly client: WorktreeClient;
  /** Mirrors the context's cwdId (getter/setter delegate to it). */
  cwdId: string;
  /** Mirrors the context's currentUser. */
  currentUser: string;
  /** Mirrors the context's filter (getter/setter delegate to it). */
  filter: NodeFilter;
  /** Mirrors the context's filterMode. */
  filterMode: FilterDisplayMode;
  /** Wired by the REPL after io creation (needs io itself, so it is attached later). */
  switchUser?: (name: string) => Promise<void>;
  /** Print `usage: <text>` (the command's own usage when omitted) and signal done. */
  usage(text?: string): 'ok';
  /** Resolve a ref against the cwd; prints the error and returns null when it fails. */
  refNode(ref: string | undefined): Node | null;
  /** The current working node; falls back to the root when the cwd was removed. */
  cwdNode(): Node;
}

export type CommandResult = 'exit' | 'ok';

/** Implement this to add a command; register it in commands.ts. */
export interface Command {
  /** Primary name. */
  name: string;
  /** Extra names, e.g. `quit` for `exit`. */
  aliases?: string[];
  /** Whether a successful run changes the rendered tree (one-shot mode re-prints it). */
  mutatesTree?: boolean;
  /** One-line description shown by `help`. */
  summary: string;
  /** Canonical usage text, shown by `help` and usage errors. */
  usage: string;
  run(io: CommandIO, args: string[]): Promise<CommandResult> | CommandResult;
}

export function createCommandIO(ctx: CommandContext): CommandIO {
  const cwdNode = (): Node => {
    const tree = ctx.client.getTree();
    const node = findNode(tree, ctx.cwdId);
    if (node) return node;
    ctx.cwdId = ROOT_ID;
    return tree;
  };
  return {
    get client(): WorktreeClient {
      return ctx.client;
    },
    out: ctx.out,
    get cwdId(): string {
      return ctx.cwdId;
    },
    set cwdId(value: string) {
      ctx.cwdId = value;
    },
    get currentUser(): string {
      return ctx.currentUser;
    },
    get filter(): NodeFilter {
      return ctx.filter;
    },
    set filter(value: NodeFilter) {
      ctx.filter = value;
    },
    get filterMode(): FilterDisplayMode {
      return ctx.filterMode;
    },
    set filterMode(value: FilterDisplayMode) {
      ctx.filterMode = value;
    },
    usage: (text: string): 'ok' => {
      ctx.out(`usage: ${text}`);
      return 'ok';
    },
    refNode: (ref: string | undefined): Node | null => {
      if (ref === undefined) return null;
      try {
        return resolveRef(ctx.client.getTree(), ref, cwdNode());
      } catch (e) {
        ctx.out(errMsg(e));
        return null;
      }
    },
    cwdNode,
  };
}

/** Find a command by name or alias (one-shot mode uses this to know what ran). */
export function findCommand(commands: Command[], name: string): Command | undefined {
  return commands.find((c) => c.name === name || (c.aliases ?? []).includes(name));
}

/** Look up a command by name (or alias) and run it. */
export function createDispatcher(commands: Command[]) {
  const byName = new Map<string, Command>();
  for (const command of commands) {
    byName.set(command.name, command);
    for (const alias of command.aliases ?? []) byName.set(alias, command);
  }
  return async (io: CommandIO, cmd: string, args: string[]): Promise<CommandResult> => {
    const command = byName.get(cmd);
    if (!command) {
      io.out(`unknown command: ${cmd} (type "help")`);
      return 'ok';
    }
    // Delegating wrapper (not a spread — that would snapshot the accessors).
    const bound: CommandIO = {
      get client() {
        return io.client;
      },
      out: io.out,
      get cwdId() {
        return io.cwdId;
      },
      set cwdId(value) {
        io.cwdId = value;
      },
      get currentUser() {
        return io.currentUser;
      },
      get filter() {
        return io.filter;
      },
      set filter(value) {
        io.filter = value;
      },
      get filterMode() {
        return io.filterMode;
      },
      set filterMode(value) {
        io.filterMode = value;
      },
      switchUser: io.switchUser,
      usage: (text) => io.usage(text ?? command.usage),
      refNode: (ref) => io.refNode(ref),
      cwdNode: () => io.cwdNode(),
    };
    return command.run(bound, args);
  };
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function parseTimestamp(io: CommandIO, s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  io.out(`invalid timestamp: ${s} (use epoch ms or ISO like 2026-08-21T10:00)`);
  return null;
}

/** Tell the user their op is queued when the kernel is offline. */
export async function afterCommand(io: CommandIO): Promise<void> {
  if (!io.client.isOnline() && !io.client.isLocal()) io.out('(offline — op queued, will sync on reconnect)');
}

export function printConflict(io: CommandIO): void {
  const conflict = io.client.getConflict();
  if (!conflict) return;
  io.out(`CONFLICT at ${conflict.baseId ?? '(empty history)'}`);
  io.out('  server branch:');
  for (const n of conflict.serverBranch) io.out(`    ${n.id} ${n.op.kind}`);
  io.out('  local branch (pending):');
  for (const p of conflict.localBranch) io.out(`    ${p.id} ${p.kind === 'add' ? p.op.kind : p.kind}`);
  io.out('resolve with: resolve server | resolve local');
}

let suppressUpdates = false;

export function isSuppressingUpdates(): boolean {
  return suppressUpdates;
}

/** Run a mutation without triggering the REPL's update rendering. */
export function mutate<T>(fn: () => T): T {
  suppressUpdates = true;
  try {
    return fn();
  } finally {
    suppressUpdates = false;
  }
}
