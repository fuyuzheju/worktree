import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { Command, CommandIO } from '../src/command';
import { DEFAULT_SERVER } from '../src/config';
import { userStateRoot } from '../src/storage';

const newIO = (user = 'alice') => {
  const lines: string[] = [];
  const ctx = {
    client: new WorktreeClient({ serverUrl: 'http://localhost:1', user }),
    out: (line: string | undefined) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: user,
    filter: {},
    filterMode: 'hide' as const,
  };
  const io = createCommandIO(ctx);
  return { ctx, io, lines };
};

const run = async (io: CommandIO, line: string) => createDispatcher(COMMANDS)(io, line.split(/\s+/)[0]!, line.split(/\s+/).slice(1));

describe('command dispatcher', () => {
  it('lists every registered command in help', async () => {
    const { io, lines } = newIO();
    expect(await run(io, 'help')).toBe('ok');
    const out = lines.join('\n');
    for (const command of COMMANDS) expect(out).toContain(command.name);
    expect(out).toContain('refs:');
  });

  it('reports unknown commands', async () => {
    const { io, lines } = newIO();
    expect(await run(io, 'nope')).toBe('ok');
    expect(lines).toEqual(['unknown command: nope (type "help")']);
  });

  it('resolves aliases (quit exits)', async () => {
    const { io } = newIO();
    expect(await run(io, 'quit')).toBe('exit');
  });

  it('cd and pwd share the mutable cwd', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'cd alpha');
    await run(io, 'pwd');
    expect(lines).toContain('/alpha');
    await run(io, 'cd');
    lines.length = 0;
    await run(io, 'pwd');
    expect(lines).toEqual(['/']);
  });

  it('usage errors print the command usage', async () => {
    const { io, lines } = newIO();
    await run(io, 'mv only-one-arg');
    expect(lines).toEqual(['usage: mv <ref> <parentRef> [weight]']);
  });

  it('add applies optimistically and reports the id', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    expect(lines[0]).toMatch(/^added "alpha" \[[0-9a-f]{4}\]$/);
  });

  it('undo drops the last edit and reports it', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'add beta');
    lines.length = 0;
    await run(io, 'undo');
    expect(lines).toEqual(['undone', '(offline — op queued, will sync on reconnect)']);
    expect(io.client.getTree().children.map((n) => n.name)).toEqual(['alpha']);
  });

  it('undo with nothing to undo reports the error', async () => {
    const { io, lines } = newIO();
    await run(io, 'undo');
    expect(lines).toEqual(['nothing to undo']);
  });

  it('a new command only needs to implement the interface and register', async () => {
    const greet: Command = {
      name: 'greet',
      usage: 'greet [name]',
      summary: 'say hello',
      run: (io2, args) => {
        io2.out(`hello, ${args[0] ?? 'world'}`);
        return 'ok';
      },
    };
    const dispatch = createDispatcher([...COMMANDS, greet]);
    const { io, lines } = newIO();
    expect(await dispatch(io, 'greet', ['worktree'])).toBe('ok');
    expect(lines).toEqual(['hello, worktree']);
    expect(await dispatch(io, 'greet', [])).toBe('ok');
    expect(lines).toEqual(['hello, worktree', 'hello, world']);
  });

  it('user current prints the active user', async () => {
    const { io, lines } = newIO('alice');
    await run(io, 'user');
    expect(lines).toEqual(['alice']);
    await run(io, 'user current');
    expect(lines).toEqual(['alice', 'alice']);
  });

  it('user list always contains local and marks the current user', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-home-'));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const aliceDir = path.join(userStateRoot(DEFAULT_SERVER), 'alice');
      fs.mkdirSync(aliceDir, { recursive: true });
      fs.writeFileSync(path.join(aliceDir, 'state.json'), '{}');
      const { io, lines } = newIO('alice');
      await run(io, 'user list');
      expect(lines).toContain('* alice');
      expect(lines.some((l) => l === '  local' || l === '* local')).toBe(true);
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it('user switch validates the name and delegates to io.switchUser', async () => {
    const { io, lines } = newIO();
    const switched: string[] = [];
    io.switchUser = async (name) => {
      switched.push(name);
    };
    await run(io, 'user switch bob');
    expect(switched).toEqual(['bob']);
    expect(lines).toEqual([]);

    await run(io, 'user switch a/b');
    expect(switched).toEqual(['bob']);
    expect(lines[0]).toMatch(/^invalid username/);
  });

  it('user switch reports when switching is unavailable', async () => {
    const { io, lines } = newIO();
    await run(io, 'user switch bob');
    expect(lines).toEqual(['user switching is unavailable here']);
  });

  it('user switch without a name prints the usage', async () => {
    const { io, lines } = newIO();
    await run(io, 'user switch');
    expect(lines).toEqual(['usage: user switch <name>']);
  });

  it('io.client follows a swapped client', async () => {
    const { ctx, io, lines } = newIO('alice');
    await run(io, 'add alpha');
    expect(ctx.client.getTree().children.map((n) => n.name)).toEqual(['alpha']);
    const prev = ctx.client;
    ctx.client = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'bob' });
    lines.length = 0;
    await run(io, 'tree');
    expect(lines.join('\n')).not.toContain('alpha');
    expect(io.client).not.toBe(prev);
  });

  it('edit sets note and deadline, null clears the deadline', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'edit alpha note=hello');
    expect(io.client.getTree().children[0]?.note).toBe('hello');
    await run(io, 'edit alpha deadline=1000');
    expect(io.client.getTree().children[0]?.deadline).toBe(1000);
    await run(io, 'edit alpha deadline=null');
    expect(io.client.getTree().children[0]?.deadline).toBeUndefined();
    await run(io, 'edit alpha note=');
    expect(io.client.getTree().children[0]?.note).toBe('');
    expect(lines.some((l) => l.startsWith('edited alpha'))).toBe(true);
  });

  it('edit sets name, weight and status', async () => {
    const { io } = newIO();
    await run(io, 'add alpha');
    await run(io, 'add beta');
    await run(io, 'edit alpha name=alpine');
    await run(io, 'edit alpine weight=9');
    await run(io, 'edit alpine status=true');
    const nodes = io.client.getTree().children;
    const alpha = nodes.find((n) => n.name === 'alpine')!;
    expect(alpha.weight).toBe(9);
    expect(alpha.status).toBe(true);
    // completed nodes sink: beta (uncompleted) now comes first
    expect(nodes.map((n) => n.name)).toEqual(['beta', 'alpine']);
  });

  it('edit applies several fields in one call', async () => {
    const { io } = newIO();
    await run(io, 'add alpha');
    await run(io, 'edit alpha name=alpine weight=3 status=false note=hi deadline=500');
    const node = io.client.getTree().children[0]!;
    expect(node.name).toBe('alpine');
    expect(node.weight).toBe(3);
    expect(node.status).toBe(false);
    expect(node.note).toBe('hi');
    expect(node.deadline).toBe(500);
  });

  it('edit reports unknown fields (system fields included), invalid values and usage errors', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    lines.length = 0;
    await run(io, 'edit alpha id=xyz');
    expect(lines).toEqual(['unknown field: id']);
    lines.length = 0;
    await run(io, 'edit alpha createdAt=1');
    expect(lines).toEqual(['unknown field: createdAt']);
    lines.length = 0;
    await run(io, 'edit alpha status=maybe');
    expect(lines).toEqual(['invalid status: maybe (use true or false)']);
    lines.length = 0;
    await run(io, 'edit alpha name=');
    expect(lines).toEqual(['node name must not be empty']);
    lines.length = 0;
    await run(io, 'edit alpha nokv');
    expect(lines).toEqual(['invalid key=value: nokv']);
    lines.length = 0;
    await run(io, 'edit alpha');
    expect(lines).toEqual(['usage: edit <ref> name=... weight=... status=... note=... deadline=...']);
  });

  it('filter hide mode shows only matches with their ancestor chain', async () => {
    const { io, lines } = newIO();
    await run(io, 'add parent');
    await run(io, 'add child parent');
    await run(io, 'add other');
    lines.length = 0;
    await run(io, 'edit child note=target');
    lines.length = 0;
    await run(io, 'filter keyword=target');
    const out = lines[lines.length - 1]!;
    expect(out).toContain('parent');
    expect(out).toContain('child');
    expect(out).not.toContain('other');
  });

  it('filter highlight mode marks matches with *', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'add beta');
    lines.length = 0;
    await run(io, 'filter mode=highlight name=alpha');
    const out = lines[lines.length - 1]!;
    expect(out).toMatch(/─+ \* alpha/);
    expect(out).toMatch(/─+ beta/);
  });

  it('filter clear resets and filter with no args prints the state', async () => {
    const { io, lines } = newIO();
    await run(io, 'filter keyword=x mode=highlight');
    lines.length = 0;
    await run(io, 'filter');
    expect(lines).toEqual([JSON.stringify({ keyword: 'x', mode: 'highlight' })]);
    lines.length = 0;
    await run(io, 'filter clear');
    expect(lines).toEqual(['filter cleared']);
    expect(io.filter).toEqual({});
    expect(io.filterMode).toBe('hide');
  });

  it('filter reports unknown fields and invalid modes', async () => {
    const { io, lines } = newIO();
    await run(io, 'filter bogus=1');
    expect(lines).toEqual(['unknown field: bogus']);
    lines.length = 0;
    await run(io, 'filter mode=weird');
    expect(lines[0]).toMatch(/^invalid mode/);
  });

  it('filter status selects completed or uncompleted nodes', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'add beta');
    await run(io, 'cpl beta');
    lines.length = 0;
    await run(io, 'filter status=completed');
    expect(lines[lines.length - 1]).toContain('beta');
    expect(lines[lines.length - 1]).not.toContain('alpha');
    lines.length = 0;
    await run(io, 'filter status=uncompleted');
    expect(lines[lines.length - 1]).toContain('alpha');
    expect(lines[lines.length - 1]).not.toContain('beta');
    lines.length = 0;
    await run(io, 'filter status=maybe');
    expect(lines[0]).toMatch(/^invalid status/);
  });

  it('ls respects the filter in hide mode', async () => {
    const { io, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'add beta');
    lines.length = 0;
    await run(io, 'filter name=beta');
    lines.length = 0;
    await run(io, 'ls');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('beta');
  });
});
