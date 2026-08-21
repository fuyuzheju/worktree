import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { Command, CommandIO } from '../src/command';

const newIO = () => {
  const lines: string[] = [];
  const io = createCommandIO({
    client: new WorktreeClient({ serverUrl: 'http://localhost:1' }),
    out: (line) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
  });
  return { io, lines };
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
});
