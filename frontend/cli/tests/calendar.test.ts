import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { CommandIO } from '../src/command';

const newIO = () => {
  const lines: string[] = [];
  const ctx = {
    client: new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'local', local: true }),
    out: (line: string | undefined) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: 'local',
    filter: {},
    filterMode: 'hide' as const,
  };
  const io = createCommandIO(ctx);
  return { ctx, io, lines };
};

const run = async (io: CommandIO, line: string) =>
  createDispatcher(COMMANDS)(io, line.split(/\s+/)[0]!, line.split(/\s+/).slice(1));

describe('blk command', () => {
  it('blk add creates a block and reports its short id', async () => {
    const { io, ctx, lines } = newIO();
    await run(io, 'blk add standup 2026-09-01T09:00 2026-09-01T10:00');
    expect(ctx.client.getBlocks()).toHaveLength(1);
    expect(ctx.client.getBlocks()[0]?.name).toBe('standup');
    expect(lines).toEqual([expect.stringMatching(/^added block \[.{4}\] standup$/)]);
  });

  it('blk add links the node when a nodeRef is given', async () => {
    const { io, ctx } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00 alpha');
    const nodeId = ctx.client.getTree().children[0]?.id;
    expect(ctx.client.getBlocks()[0]?.nodeId).toBe(nodeId);
  });

  it('blk add rejects invalid times and start >= end', async () => {
    const { io, ctx, lines } = newIO();
    await run(io, 'blk add bad garbage 2026-09-01T10:00');
    expect(lines).toContain('invalid time: garbage (use ISO like 2026-09-01T10:00)');
    expect(ctx.client.getBlocks()).toHaveLength(0);
    await expect(run(io, 'blk add bad 2026-09-01T10:00 2026-09-01T09:00')).rejects.toThrow(
      /start must be before end/,
    );
  });

  it('blk ls lists every block with times and link status', async () => {
    const { io, ctx, lines } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add standup 2026-09-01T09:00 2026-09-01T10:00');
    await run(io, 'blk add solo 2026-09-02T09:00 2026-09-02T11:00 alpha');
    lines.length = 0;
    await run(io, 'blk ls');
    expect(lines).toEqual([
      expect.stringMatching(/standup \[.{4}\] 09:00–10:00 \(unlinked\)/),
      expect.stringMatching(/solo \[.{4}\] 09:00–11:00 \(node: \/alpha\)/),
    ]);
    expect(ctx.client.getBlocks()).toHaveLength(2);
  });

  it('blk edit patches fields, and node=null clears the link', async () => {
    const { io, ctx } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00');
    await run(io, 'blk edit mtg name=standup note=hello node=alpha');
    expect(ctx.client.getBlocks()[0]).toMatchObject({ name: 'standup', note: 'hello' });
    expect(ctx.client.getBlocks()[0]?.nodeId).toBe(ctx.client.getTree().children[0]?.id);
    await run(io, 'blk edit standup node=null');
    expect(ctx.client.getBlocks()[0]?.nodeId).toBeUndefined();
  });

  it('blk edit rejects empty patches and unknown fields', async () => {
    const { io, lines } = newIO();
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00');
    lines.length = 0;
    await run(io, 'blk edit mtg');
    expect(lines).toEqual(['empty patch']);
    await run(io, 'blk edit mtg color=blue');
    expect(lines).toContain('unknown field: color');
  });

  it('blk rm removes the block', async () => {
    const { io, ctx } = newIO();
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00');
    await run(io, 'blk rm mtg');
    expect(ctx.client.getBlocks()).toHaveLength(0);
  });

  it('blk cpl/uncpl toggle completion and propagate to the linked node', async () => {
    const { io, ctx } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00 alpha');
    await run(io, 'blk cpl mtg');
    expect(ctx.client.getBlocks()[0]?.status).toBe(true);
    expect(ctx.client.getTree().children[0]?.status).toBe(true);
    await run(io, 'blk uncpl mtg');
    expect(ctx.client.getBlocks()[0]?.status).toBe(false);
    expect(ctx.client.getTree().children[0]?.status).toBe(false);
  });

  it('blk refs resolve by unique name or unique id prefix', async () => {
    const { io, ctx } = newIO();
    await run(io, 'blk add standup 2026-09-01T09:00 2026-09-01T10:00');
    const id = ctx.client.getBlocks()[0]?.id ?? '';
    await run(io, `blk rm ${id.slice(0, 6)}`);
    expect(ctx.client.getBlocks()).toHaveLength(0);
  });
});

describe('link / unlink commands', () => {
  it('link attaches the node; unlink clears it', async () => {
    const { io, ctx } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add mtg 2026-09-01T09:00 2026-09-01T10:00');
    await run(io, 'link mtg alpha');
    const nodeId = ctx.client.getTree().children[0]?.id;
    expect(ctx.client.getBlocks()[0]?.nodeId).toBe(nodeId);
    await run(io, 'unlink mtg');
    expect(ctx.client.getBlocks()[0]?.nodeId).toBeUndefined();
  });

  it('rejects linking a node that already has a block', async () => {
    const { io } = newIO();
    await run(io, 'add alpha');
    await run(io, 'blk add one 2026-09-01T09:00 2026-09-01T10:00 alpha');
    await run(io, 'blk add two 2026-09-02T09:00 2026-09-02T10:00');
    await expect(run(io, 'link two alpha')).rejects.toThrow(/already linked to a block/);
  });
});

describe('cld command', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const seeded = async () => {
    const { io, ctx, lines } = newIO();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00'));
    await run(io, 'add alpha');
    await run(io, 'blk add standup 2026-09-01T09:00 2026-09-01T10:00');
    await run(io, 'blk add late 2026-09-01T23:00 2026-09-02T01:00');
    await run(io, 'blk add long 2026-09-01T13:00 2026-09-02T14:00 alpha');
    await run(io, 'blk add future 2026-09-03T10:00 2026-09-03T11:30');
    return { io, ctx, lines };
  };

  it('shows the next 7 days, today marked, with totals and multi-day spans', async () => {
    const { io, lines } = await seeded();
    lines.length = 0;
    await run(io, 'cld');
    const out = lines.join('\n');
    expect(out).toContain('2026-09-01 Tue *');
    expect(out).toContain('2026-09-02 Wed');
    expect(out).toContain('2026-09-07 Mon');
    expect(out).toContain('standup');
    expect(out).toContain('09:00–10:00');
    expect(out).toContain('(2 days)'); // long: 09-01 13:00 → 09-02 14:00
    expect(out).toContain('(node: /alpha)');
  });

  it('cld honors a custom day count', async () => {
    const { io, lines } = await seeded();
    lines.length = 0;
    await run(io, 'cld 2');
    const out = lines.join('\n');
    expect(out).toContain('2026-09-01 Tue *');
    expect(out).toContain('2026-09-02 Wed');
    expect(out).not.toContain('2026-09-03');
    expect(out).not.toContain('future');
  });

  it('cld rejects invalid day counts', async () => {
    const { io, lines } = await seeded();
    await run(io, 'cld 0');
    expect(lines).toContain('invalid days: 0 (use a positive integer)');
    await run(io, 'cld x');
    expect(lines).toContain('invalid days: x (use a positive integer)');
  });
});
