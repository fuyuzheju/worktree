import { ROOT_ID } from '@worktree/core';
import { formatNode, renderTree, shortId } from './render';
import { pathOf } from './resolve';
import { STATE_PATH } from './config';
import { afterCommand, errMsg, mutate, parseTimestamp, printConflict } from './command';
import type { Command, CommandIO, CommandResult } from './command';

/** Parse a weight argument; prints the error and returns undefined when invalid. */
function parseWeight(io: CommandIO, raw: string): number | undefined {
  const weight = Number(raw);
  if (Number.isNaN(weight)) {
    io.out(`invalid weight: ${raw}`);
    return undefined;
  }
  return weight;
}

const treeCommand: Command = {
  name: 'tree',
  summary: 'print the tree (defaults to cwd; "tree /" for the whole tree)',
  usage: 'tree [ref]',
  run: (io, args) => {
    const node = args[0] !== undefined ? io.refNode(args[0]) : io.cwdNode();
    if (node) io.out(renderTree(node));
    return 'ok';
  },
};

const lsCommand: Command = {
  name: 'ls',
  summary: 'list the children of a node (defaults to cwd)',
  usage: 'ls [ref]',
  run: (io, args) => {
    const node = args[0] !== undefined ? io.refNode(args[0]) : io.cwdNode();
    if (!node) return 'ok';
    for (const child of node.children) io.out(formatNode(child));
    return 'ok';
  },
};

const cdCommand: Command = {
  name: 'cd',
  summary: 'change the working node (no arg: back to /)',
  usage: 'cd [ref]',
  run: (io, args) => {
    if (args[0] === undefined) {
      io.cwdId = ROOT_ID;
      return 'ok';
    }
    const node = io.refNode(args[0]);
    if (node) io.cwdId = node.id;
    return 'ok';
  },
};

const pwdCommand: Command = {
  name: 'pwd',
  summary: 'print the absolute path of the working node',
  usage: 'pwd',
  run: (io) => {
    io.out(pathOf(io.client.getTree(), io.cwdId));
    return 'ok';
  },
};

const addCommand: Command = {
  name: 'add',
  summary: 'add a node (parent defaults to the cwd)',
  usage: 'add <name> [parentRef] [weight]',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 1) return io.usage();
    const name = args[0]!;
    let parent = io.cwdNode();
    if (args[1] !== undefined) {
      const resolved = io.refNode(args[1]);
      if (!resolved) return 'ok';
      parent = resolved;
    }
    let weight: number | undefined;
    if (args[2] !== undefined) {
      weight = parseWeight(io, args[2]);
      if (weight === undefined) return 'ok';
    }
    const id = mutate(() => io.client.addNode(parent.id, name, weight));
    io.out(`added "${name}" [${shortId(id)}]`);
    await afterCommand(io);
    return 'ok';
  },
};

const rmCommand: Command = {
  name: 'rm',
  summary: 'remove a node (-r required when it has children)',
  usage: 'rm [-r] <ref>',
  run: async (io, args): Promise<CommandResult> => {
    let recursive = false;
    let ref: string | undefined;
    for (const a of args) {
      if (a === '-r' || a === '--recursive') recursive = true;
      else ref = a;
    }
    if (ref === undefined) return io.usage();
    const node = io.refNode(ref);
    if (!node) return 'ok';
    if (node.children.length > 0 && !recursive) {
      io.out(`"${node.name}" has ${node.children.length} child node(s) — use rm -r to remove the whole subtree`);
      return 'ok';
    }
    mutate(() => io.client.removeNode(node.id));
    io.out(`removed ${node.name}`);
    await afterCommand(io);
    return 'ok';
  },
};

const renameCommand: Command = {
  name: 'rename',
  summary: 'rename a node',
  usage: 'rename <ref> <name>',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 2) return io.usage();
    const node = io.refNode(args[0]);
    if (!node) return 'ok';
    mutate(() => io.client.renameNode(node.id, args[1]!));
    io.out(`renamed to "${args[1]}"`);
    await afterCommand(io);
    return 'ok';
  },
};

const mvCommand: Command = {
  name: 'mv',
  summary: 'move a node (keeps its weight without w)',
  usage: 'mv <ref> <parentRef> [weight]',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 2) return io.usage();
    const node = io.refNode(args[0]);
    const parent = io.refNode(args[1]);
    if (!node || !parent) return 'ok';
    let weight: number | undefined;
    if (args[2] !== undefined) {
      weight = parseWeight(io, args[2]);
      if (weight === undefined) return 'ok';
    }
    mutate(() => io.client.moveNode(node.id, parent.id, weight));
    io.out(`moved ${node.name} under ${parent.id === ROOT_ID ? '/' : parent.name}`);
    await afterCommand(io);
    return 'ok';
  },
};

const cpCommand: Command = {
  name: 'cp',
  summary: 'shallow-copy a node (auto-renames on name collision)',
  usage: 'cp <ref> <parentRef> [weight]',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 2) return io.usage();
    const node = io.refNode(args[0]);
    const parent = io.refNode(args[1]);
    if (!node || !parent) return 'ok';
    let weight: number | undefined;
    if (args[2] !== undefined) {
      weight = parseWeight(io, args[2]);
      if (weight === undefined) return 'ok';
    }
    const id = mutate(() => io.client.copyNode(node.id, parent.id, weight));
    io.out(`copied "${node.name}" [${shortId(id)}]`);
    await afterCommand(io);
    return 'ok';
  },
};

const cplCommand: Command = {
  name: 'cpl',
  summary: 'complete a node',
  usage: 'cpl <ref>',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 1) return io.usage();
    const node = io.refNode(args[0]);
    if (!node) return 'ok';
    mutate(() => io.client.setCompleted(node.id, true));
    io.out(`${node.name} completed`);
    await afterCommand(io);
    return 'ok';
  },
};

const uncplCommand: Command = {
  name: 'uncpl',
  summary: 'uncomplete a node',
  usage: 'uncpl <ref>',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 1) return io.usage();
    const node = io.refNode(args[0]);
    if (!node) return 'ok';
    mutate(() => io.client.setCompleted(node.id, false));
    io.out(`${node.name} uncompleted`);
    await afterCommand(io);
    return 'ok';
  },
};

const reminderCommand: Command = {
  name: 'reminder',
  summary: 'manage reminders (add / rm / edit)',
  usage: 'reminder add|rm|edit ...',
  run: async (io, args): Promise<CommandResult> => {
    const sub = args[0];
    if (sub === 'add') {
      if (args.length < 4) return io.usage('reminder add <nodeRef> <name> <deadline> [repeatMs]');
      const node = io.refNode(args[1]);
      if (!node) return 'ok';
      const deadline = parseTimestamp(io, args[3]!);
      if (deadline === null) return 'ok';
      let repeat: number | undefined;
      if (args[4] !== undefined) {
        const r = Number(args[4]);
        if (Number.isNaN(r)) {
          io.out(`invalid repeat: ${args[4]}`);
          return 'ok';
        }
        repeat = r;
      }
      const rmdId = mutate(() => io.client.addReminder(node.id, args[2]!, deadline, repeat));
      io.out(`added reminder [${shortId(rmdId)}]`);
      await afterCommand(io);
      return 'ok';
    }
    if (sub === 'rm') {
      if (args.length < 2) return io.usage('reminder rm <rmdId>');
      mutate(() => io.client.removeReminder(args[1]!));
      io.out('reminder removed');
      await afterCommand(io);
      return 'ok';
    }
    if (sub === 'edit') {
      if (args.length < 3) return io.usage('reminder edit <rmdId> name=X deadline=Y repeat=null active=false');
      const patch: { name?: string; deadline?: number; repeat?: number | null; active?: boolean } = {};
      for (const kv of args.slice(2)) {
        const eq = kv.indexOf('=');
        if (eq <= 0) {
          io.out(`invalid key=value: ${kv}`);
          return 'ok';
        }
        const key = kv.slice(0, eq);
        const value = kv.slice(eq + 1);
        if (key === 'name') patch.name = value;
        else if (key === 'deadline') {
          const t = parseTimestamp(io, value);
          if (t === null) return 'ok';
          patch.deadline = t;
        } else if (key === 'repeat') {
          const r = value === 'null' ? null : Number(value);
          if (r !== null && Number.isNaN(r)) {
            io.out(`invalid repeat: ${value}`);
            return 'ok';
          }
          patch.repeat = r;
        } else if (key === 'active') patch.active = value === 'true';
        else {
          io.out(`unknown field: ${key}`);
          return 'ok';
        }
      }
      mutate(() => io.client.editReminder(args[1]!, patch));
      io.out('reminder updated');
      await afterCommand(io);
      return 'ok';
    }
    return io.usage('reminder add|rm|edit ...');
  },
};

const syncCommand: Command = {
  name: 'sync',
  summary: 'manual flush + catch-up (runs automatically while online)',
  usage: 'sync',
  run: async (io): Promise<CommandResult> => {
    try {
      const result = await io.client.sync();
      io.out(
        result === 'conflict'
          ? 'conflict — resolve with: resolve server|local'
          : result === 'offline'
            ? 'server offline — ops stay queued'
            : 'ok',
      );
      if (result === 'conflict') printConflict(io);
    } catch (e) {
      io.out(`sync failed: ${errMsg(e)}`);
    }
    io.out(renderTree(io.client.getTree()));
    return 'ok';
  },
};

const statsCommand: Command = {
  name: 'stats',
  summary: 'server statistics',
  usage: 'stats',
  run: async (io): Promise<CommandResult> => {
    try {
      const s = await io.client.getStats();
      io.out(`ops=${s.opCount} nodes=${s.nodeCount} reminders=${s.reminderCount} server=${s.state}`);
    } catch (e) {
      io.out(`stats failed: ${errMsg(e)}`);
    }
    return 'ok';
  },
};

const statusCommand: Command = {
  name: 'status',
  summary: 'online state, pending count, conflict',
  usage: 'status',
  run: (io) => {
    const conflict = io.client.getConflict();
    io.out(
      `online=${io.client.isOnline()} pending=${io.client.getPendingCount()} conflict=${conflict ? `yes (base ${conflict.baseId ?? 'empty'})` : 'no'}`,
    );
    io.out(`storage: ${STATE_PATH}`);
    return 'ok';
  },
};

const resolveCommand: Command = {
  name: 'resolve',
  summary: 'resolve a sync conflict',
  usage: 'resolve server|local',
  run: async (io, args): Promise<CommandResult> => {
    const choice = args[0];
    if (choice !== 'server' && choice !== 'local') return io.usage();
    try {
      await io.client.resolveConflict(choice);
      io.out(choice === 'local' ? 'rewrote the server history' : 'adopted the server history');
    } catch (e) {
      io.out(`resolve failed: ${errMsg(e)}`);
    }
    io.out(renderTree(io.client.getTree()));
    return 'ok';
  },
};

const helpCommand: Command = {
  name: 'help',
  summary: 'show this help',
  usage: 'help',
  run: (io) => {
    io.out('commands:');
    for (const command of COMMANDS) {
      io.out(`  ${command.usage.padEnd(32)} ${command.summary}`);
    }
    io.out('');
    io.out('refs: linux-style paths — /a/b absolute, a/b relative to cwd, "." ".." — plus');
    io.out('full id, unique id prefix (4+ chars shown in tree), unique name, or root.');
    return 'ok';
  },
};

const exitCommand: Command = {
  name: 'exit',
  aliases: ['quit'],
  summary: 'leave the shell (Ctrl+D works too)',
  usage: 'exit',
  run: () => 'exit',
};

export const COMMANDS: Command[] = [
  treeCommand,
  lsCommand,
  cdCommand,
  pwdCommand,
  addCommand,
  rmCommand,
  renameCommand,
  mvCommand,
  cpCommand,
  cplCommand,
  uncplCommand,
  reminderCommand,
  syncCommand,
  statsCommand,
  statusCommand,
  resolveCommand,
  helpCommand,
  exitCommand,
];
