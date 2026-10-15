import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { CommandIO } from '../src/command';

vi.mock('../src/input', () => ({
  readClipboard: vi.fn(() => 'from clipboard'),
  readPipedStdin: vi.fn(async () => 'from stdin\nwith a note'),
}));

import { readClipboard, readPipedStdin } from '../src/input';

const newIO = () => {
  const lines: string[] = [];
  const ctx = {
    client: new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token' }),
    out: (line: string | undefined) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: 'alice',
    filter: {},
    filterMode: 'hide' as const,
  };
  const io = createCommandIO(ctx);
  return { ctx, io, lines };
};

const run = (io: CommandIO, line: string): Promise<string> => {
  const parts = line.split(/\s+/);
  return createDispatcher(COMMANDS)(io, parts[0] ?? '', parts.slice(1));
};

const findNode = (node: Node, id: string): Node | undefined => {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
};

const nodeOf = (io: CommandIO, id: string): Node => {
  const node = findNode(io.client.getTree(), id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node;
};

const setTTY = (value: boolean | undefined): void => {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
};

afterEach(() => {
  setTTY(undefined);
  vi.clearAllMocks();
  vi.mocked(readClipboard).mockReturnValue('from clipboard');
  vi.mocked(readPipedStdin).mockResolvedValue('from stdin\nwith a note');
});

describe('capture command', () => {
  it('joins the remaining args as the capture text', async () => {
    const { io, lines } = newIO();
    expect(await run(io, 'capture buy milk')).toBe('ok');
    expect(lines[0]).toMatch(/^captured \/tmp\/buy milk \[.+]$/);
    const tmp = io.client.getTree().children[0];
    expect(tmp.name).toBe('tmp');
    expect(tmp.children[0]?.name).toBe('buy milk');
  });

  it('captures the clipboard with -c', async () => {
    const { io, lines } = newIO();
    await run(io, 'capture -c');
    expect(readClipboard).toHaveBeenCalled();
    expect(lines[0]).toContain('captured /tmp/from clipboard');
  });

  it('rejects -c combined with text', async () => {
    const { io, lines } = newIO();
    await run(io, 'capture -c extra');
    expect(lines).toEqual(['capture -c reads the clipboard and takes no text']);
    expect(io.client.getPendingCount()).toBe(0);
  });

  it('reads piped stdin when the command runs without text', async () => {
    setTTY(undefined);
    const { io, lines } = newIO();
    await run(io, 'capture');
    expect(readPipedStdin).toHaveBeenCalled();
    expect(lines[0]).toContain('captured /tmp/from stdin');
    const node = nodeOf(io, io.client.getTree().children[0].children[0].id);
    expect(node.note).toBe('with a note');
  });

  it('prints the usage on a TTY without text', async () => {
    setTTY(true);
    const { io, lines } = newIO();
    await run(io, 'capture');
    expect(lines[0]).toContain('usage: capture');
    expect(readPipedStdin).not.toHaveBeenCalled();
  });

  it('surfaces capture errors without queueing anything', async () => {
    const { io, lines } = newIO();
    await run(io, 'capture a/b');
    expect(lines[0]).toContain('capture name must not contain "/"');
    expect(io.client.getPendingCount()).toBe(0);
  });

  it('lands the node under the configured quickAddPath', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-home-'));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const { io, lines } = newIO();
      await run(io, 'config quickAddPath=/inbox');
      await run(io, 'capture a thought');
      expect(lines.at(-1)).toBe('(offline — op queued, will sync on reconnect)');
      expect(lines.some((l) => l.includes('captured /inbox/a thought'))).toBe(true);
      expect(io.client.getTree().children[0]?.name).toBe('inbox');
    } finally {
      process.env.HOME = prevHome;
    }
  });
});
