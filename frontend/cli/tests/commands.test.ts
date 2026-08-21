import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { Command, CommandIO } from '../src/command';

const newIO = (user = 'alice') => {
  const lines: string[] = [];
  const ctx = {
    client: new WorktreeClient({ serverUrl: 'http://localhost:1', user }),
    out: (line: string | undefined) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: user,
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
      const aliceDir = path.join(home, '.worktree', 'localhost_3000', 'alice');
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
});
