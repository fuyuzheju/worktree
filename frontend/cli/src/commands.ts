import { ROOT_ID, USER_RE, matchesFilter } from '@worktree/core';
import { formatNode, renderFiltered, renderTree, shortId } from './render';
import { pathOf } from './resolve';
import { DEFAULT_SERVER } from './config';
import { defaultStatePath, deleteToken, readToken, writeToken } from './storage';
import { listUsers } from './users';
import { AuthError, defaultLabel, loginOnServer, promptPassword, registerOnServer, revokeOnServer } from './auth';
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
  aliases: ['t'],
  summary: 'print the tree (defaults to cwd; "tree /" for the whole tree)',
  usage: 'tree [ref]',
  run: (io, args) => {
    const node = args[0] !== undefined ? io.refNode(args[0]) : io.cwdNode();
    if (node) io.out(renderFiltered(node, io.filter, io.filterMode));
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
    for (const child of node.children) {
      if (io.filterMode === 'hide') {
        if (matchesFilter(child, io.filter)) io.out(formatNode(child));
      } else {
        io.out(`${matchesFilter(child, io.filter) ? '* ' : ''}${formatNode(child)}`);
      }
    }
    return 'ok';
  },
};

const filterCommand: Command = {
  name: 'filter',
  summary: 'set/clear the display filter (name= note= keyword= status= overdue= has-deadline= deadline-before= created-after= created-before= mode=)',
  usage: 'filter [clear] [key=value ...]',
  run: (io, args): CommandResult => {
    if (args[0] === 'clear') {
      io.filter = {};
      io.filterMode = 'hide';
      io.out('filter cleared');
      return 'ok';
    }
    if (args.length === 0) {
      io.out(JSON.stringify({ ...io.filter, mode: io.filterMode }));
      return 'ok';
    }
    for (const kv of args) {
      const eq = kv.indexOf('=');
      if (eq <= 0) {
        io.out(`invalid key=value: ${kv}`);
        return 'ok';
      }
      const key = kv.slice(0, eq);
      const value = kv.slice(eq + 1);
      if (key === 'name') io.filter = { ...io.filter, nameContains: value };
      else if (key === 'note') io.filter = { ...io.filter, noteContains: value };
      else if (key === 'keyword') io.filter = { ...io.filter, keyword: value };
      else if (key === 'status') {
        if (value !== 'true' && value !== 'false' && value !== 'completed' && value !== 'uncompleted') {
          io.out(`invalid status: ${value} (use true/completed or false/uncompleted)`);
          return 'ok';
        }
        io.filter = { ...io.filter, status: value === 'true' || value === 'completed' };
      } else if (key === 'overdue') io.filter = { ...io.filter, overdue: value === 'true' };
      else if (key === 'has-deadline') io.filter = { ...io.filter, hasDeadline: value === 'true' };
      else if (key === 'deadline-before' || key === 'created-after' || key === 'created-before') {
        const t = parseTimestamp(io, value);
        if (t === null) return 'ok';
        if (key === 'deadline-before') io.filter = { ...io.filter, deadlineBefore: t };
        else if (key === 'created-after') io.filter = { ...io.filter, createdAfter: t };
        else io.filter = { ...io.filter, createdBefore: t };
      } else if (key === 'mode') {
        if (value !== 'hide' && value !== 'highlight') {
          io.out(`invalid mode: ${value} (use hide or highlight)`);
          return 'ok';
        }
        io.filterMode = value;
      } else {
        io.out(`unknown field: ${key}`);
        return 'ok';
      }
    }
    io.out(renderFiltered(io.client.getTree(), io.filter, io.filterMode));
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
  mutatesTree: true,
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
  mutatesTree: true,
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

const undoCommand: Command = {
  name: 'undo',
  mutatesTree: true,
  summary: 'undo the last operation',
  usage: 'undo',
  run: async (io): Promise<CommandResult> => {
    try {
      mutate(() => io.client.undo());
    } catch (e) {
      io.out(errMsg(e));
      return 'ok';
    }
    io.out('undone');
    await afterCommand(io);
    return 'ok';
  },
};

const renameCommand: Command = {
  name: 'rename',
  mutatesTree: true,
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

const editCommand: Command = {
  name: 'edit',
  mutatesTree: true,
  summary: 'edit node fields: name= weight= status=true|false note= deadline= (deadline=null clears)',
  usage: 'edit <ref> name=... weight=... status=... note=... deadline=...',
  run: async (io, args): Promise<CommandResult> => {
    if (args.length < 2) return io.usage();
    const node = io.refNode(args[0]);
    if (!node) return 'ok';
    let name: string | undefined;
    let weight: number | undefined;
    let status: boolean | undefined;
    let note: string | undefined;
    let deadline: number | null | undefined;
    for (const kv of args.slice(1)) {
      const eq = kv.indexOf('=');
      if (eq <= 0) {
        io.out(`invalid key=value: ${kv}`);
        return 'ok';
      }
      const key = kv.slice(0, eq);
      const value = kv.slice(eq + 1);
      if (key === 'name') {
        if (value === '') {
          io.out('node name must not be empty');
          return 'ok';
        }
        name = value;
      } else if (key === 'weight') {
        const w = parseWeight(io, value);
        if (w === undefined) return 'ok';
        weight = w;
      } else if (key === 'status') {
        if (value !== 'true' && value !== 'false') {
          io.out(`invalid status: ${value} (use true or false)`);
          return 'ok';
        }
        status = value === 'true';
      } else if (key === 'note') note = value;
      else if (key === 'deadline') {
        if (value === 'null' || value === '') deadline = null;
        else {
          const t = parseTimestamp(io, value);
          if (t === null) return 'ok';
          deadline = t;
        }
      } else {
        io.out(`unknown field: ${key}`);
        return 'ok';
      }
    }
    if (name !== undefined) mutate(() => io.client.renameNode(node.id, name));
    if (weight !== undefined) mutate(() => io.client.setWeight(node.id, weight));
    if (status !== undefined) mutate(() => io.client.setCompleted(node.id, status));
    if (note !== undefined) mutate(() => io.client.setNote(node.id, note));
    if (deadline !== undefined) mutate(() => io.client.setDeadline(node.id, deadline));
    io.out(`edited ${node.name}`);
    await afterCommand(io);
    return 'ok';
  },
};

const mvCommand: Command = {
  name: 'mv',
  mutatesTree: true,
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
  mutatesTree: true,
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
  mutatesTree: true,
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
  mutatesTree: true,
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
  mutatesTree: true,
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
    io.out(renderFiltered(io.client.getTree(), io.filter, io.filterMode));
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
    io.out(`user: ${io.currentUser}`);
    io.out(`storage: ${defaultStatePath(DEFAULT_SERVER, io.currentUser)}`);
    return 'ok';
  },
};

const userCommand: Command = {
  name: 'user',
  summary: 'show or switch users ("local" is offline-only)',
  usage: 'user [current|list|switch <name>]',
  run: async (io, args): Promise<CommandResult> => {
    const sub = args[0];
    if (sub === undefined || sub === 'current') {
      io.out(io.currentUser);
      return 'ok';
    }
    if (sub === 'list') {
      for (const u of listUsers(DEFAULT_SERVER)) {
        io.out(`${u === io.currentUser ? '* ' : '  '}${u}`);
      }
      return 'ok';
    }
    if (sub === 'switch') {
      const name = args[1];
      if (name === undefined) return io.usage('user switch <name>');
      if (!USER_RE.test(name)) {
        io.out(`invalid username: ${name} (allowed: ${USER_RE.source})`);
        return 'ok';
      }
      if (!io.switchUser) {
        io.out('user switching is unavailable here');
        return 'ok';
      }
      try {
        await io.switchUser(name);
      } catch (e) {
        io.out(`switch failed: ${errMsg(e)}`);
      }
      return 'ok';
    }
    return io.usage();
  },
};

const registerCommand: Command = {
  name: 'register',
  summary: 'create a server account and log in on this device',
  usage: 'register <user> [--label <name>]',
  run: async (io, args): Promise<CommandResult> => {
    const user = args[0];
    if (user === undefined || !USER_RE.test(user)) return io.usage('register <user>');
    if (user === 'local') {
      io.out('"local" is the reserved offline-only user and needs no registration');
      return 'ok';
    }
    const labelIdx = args.indexOf('--label');
    const label = labelIdx !== -1 ? args[labelIdx + 1] : undefined;
    if (labelIdx !== -1 && label === undefined) return io.usage('register <user> [--label <name>]');
    try {
      const password = await promptPassword('password: ');
      if (password.length < 8) {
        io.out('password must be at least 8 characters');
        return 'ok';
      }
      const confirm = await promptPassword('confirm password: ');
      if (confirm !== password) {
        io.out('passwords do not match');
        return 'ok';
      }
      const stored = await registerOnServer(DEFAULT_SERVER, user, password);
      writeToken(DEFAULT_SERVER, user, stored);
      await io.switchUser?.(user);
      io.out(`registered and logged in as ${user}`);
    } catch (e) {
      io.out(`register failed: ${errMsg(e)}`);
    }
    return 'ok';
  },
};

const loginCommand: Command = {
  name: 'login',
  summary: 'log this device in as an existing server user',
  usage: 'login <user> [--label <name>]',
  run: async (io, args): Promise<CommandResult> => {
    const user = args[0];
    if (user === undefined || !USER_RE.test(user)) return io.usage('login <user>');
    if (user === 'local') {
      io.out('"local" is offline-only and needs no login');
      return 'ok';
    }
    const labelIdx = args.indexOf('--label');
    const label = labelIdx !== -1 ? args[labelIdx + 1] : undefined;
    if (labelIdx !== -1 && label === undefined) return io.usage('login <user> [--label <name>]');
    try {
      const password = await promptPassword('password: ');
      const stored = await loginOnServer(DEFAULT_SERVER, user, password, label ?? defaultLabel());
      writeToken(DEFAULT_SERVER, user, stored);
      await io.switchUser?.(user);
      io.out(`logged in as ${user}`);
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) {
        io.out('invalid username or password');
      } else {
        io.out(`login failed: ${errMsg(e)}`);
      }
    }
    return 'ok';
  },
};

const logoutCommand: Command = {
  name: 'logout',
  summary: 'revoke this device\'s token and log out (local user has no token)',
  usage: 'logout [user]',
  run: async (io, args): Promise<CommandResult> => {
    const user = args[0] ?? io.currentUser;
    if (user === 'local') {
      io.out('"local" is offline-only and never logged in');
      return 'ok';
    }
    if (!USER_RE.test(user)) return io.usage('logout [user]');
    const stored = readToken(DEFAULT_SERVER, user);
    if (!stored) {
      io.out(`not logged in as ${user} on this device`);
      return 'ok';
    }
    try {
      await revokeOnServer(DEFAULT_SERVER, stored.token);
    } catch {
      io.out('warning: server unreachable — the token may still be active server-side');
    }
    deleteToken(DEFAULT_SERVER, user);
    io.out(`logged out of ${user}`);
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
    io.out(renderFiltered(io.client.getTree(), io.filter, io.filterMode));
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
  filterCommand,
  cdCommand,
  pwdCommand,
  addCommand,
  rmCommand,
  undoCommand,
  renameCommand,
  editCommand,
  mvCommand,
  cpCommand,
  cplCommand,
  uncplCommand,
  reminderCommand,
  syncCommand,
  statsCommand,
  statusCommand,
  userCommand,
  registerCommand,
  loginCommand,
  logoutCommand,
  resolveCommand,
  helpCommand,
  exitCommand,
];
