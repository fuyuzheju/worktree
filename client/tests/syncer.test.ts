import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import type { HistoryNode, HistoryOperation, HistoryPage, Node, TreeOperation } from '@worktree/core';
import { ApiError } from '../src/api';
import type { SyncAPI } from '../src/syncer';
import { Syncer } from '../src/syncer';
import { ClientStore } from '../src/store';

const addOp = (id: string, parentId = ROOT_ID): TreeOperation => ({
  kind: 'add',
  parentId,
  id,
  name: id,
  weight: 1,
});
const node = (id: string, op: TreeOperation = addOp(id)): HistoryNode => ({ id, op });

function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function countNodes(root: Node): number {
  let n = 0;
  for (const child of root.children) n += 1 + countNodes(child);
  return n;
}

/** In-memory fake of the server API, honoring the documented server rules. */
class FakeAPI implements SyncAPI {
  serverHistory: HistoryNode[] = [];
  submitCalls: HistoryOperation[][] = [];
  rewriteCalls: Array<{ base: string | null; history: HistoryNode[] }> = [];
  failSubmitWith: ApiError | null = null;
  failRewriteWith: ApiError | null = null;
  rewriteFailures409 = 0;

  async submit(ops: HistoryOperation[]): Promise<void> {
    this.submitCalls.push(ops);
    if (this.failSubmitWith) throw this.failSubmitWith;
    for (const o of ops) {
      if (o.kind === 'remove') {
        if (this.serverHistory.at(-1)?.id === o.id) this.serverHistory.pop();
        continue;
      }
      if (this.serverHistory.some((n) => n.id === o.id)) continue;
      this.serverHistory.push({ id: o.id, op: o.op });
    }
  }

  async history(after: string | null): Promise<HistoryPage> {
    if (after === null) return { cursorFound: true, nodes: [...this.serverHistory] };
    const idx = this.serverHistory.findIndex((n) => n.id === after);
    if (idx === -1) return { cursorFound: false, nodes: [...this.serverHistory] };
    return { cursorFound: true, nodes: this.serverHistory.slice(idx + 1) };
  }

  async rewrite(base: string | null, history: HistoryNode[]): Promise<void> {
    this.rewriteCalls.push({ base, history });
    if (this.failRewriteWith) throw this.failRewriteWith;
    if (this.rewriteFailures409 > 0) {
      this.rewriteFailures409--;
      // another client advanced the history between our read and the rewrite
      this.serverHistory.push(node(`other${this.rewriteFailures409}`));
      throw new ApiError(409, 'stale base');
    }
    this.serverHistory = [...history];
  }
}

describe('Syncer', () => {
  it('catches up from an empty local history', async () => {
    const store = new ClientStore();
    const api = new FakeAPI();
    api.serverHistory = [node('s1')];
    const syncer = new Syncer(store, api);
    expect(await syncer.sync()).toBe('ok');
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1']);
    expect(findNode(store.getTree(), 's1')).toBeDefined();
  });

  it('flushes pending ops and catches up, staying idempotent', async () => {
    const store = new ClientStore();
    const api = new FakeAPI();
    api.serverHistory = [node('s1')];
    const syncer = new Syncer(store, api);
    store.applyLocal(addOp('a'));
    const pendingId = store.getPending()[0]!.id;
    expect(await syncer.sync()).toBe('ok');
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', pendingId]);
    expect(countNodes(store.getTree())).toBe(2);
    // The catch-up redelivered our own op; a second sync must not duplicate it.
    expect(await syncer.sync()).toBe('ok');
    expect(store.getConfirmed()).toHaveLength(2);
  });

  it('returns conflict on 400 and keeps the pending queue', async () => {
    const store = new ClientStore();
    const api = new FakeAPI();
    api.failSubmitWith = new ApiError(400, '{"conflict_id":"x","reason":"boom"}');
    const syncer = new Syncer(store, api);
    store.applyLocal(addOp('a'));
    expect(await syncer.sync()).toBe('conflict');
    const conflict = syncer.getConflict();
    expect(conflict?.baseId).toBeNull();
    expect(conflict?.base).toEqual([]);
    expect(conflict?.localBranch).toHaveLength(1);
    expect(store.getPending()).toHaveLength(1);
  });

  it('returns offline on 503 and keeps the pending queue', async () => {
    const store = new ClientStore();
    const api = new FakeAPI();
    api.failSubmitWith = new ApiError(503, 'server offline');
    const syncer = new Syncer(store, api);
    store.applyLocal(addOp('a'));
    expect(await syncer.sync()).toBe('offline');
    expect(syncer.getConflict()).toBeNull();
    expect(store.getPending()).toHaveLength(1);
  });

  it('catch-up appends the delta instead of replacing history (regression)', async () => {
    const store = new ClientStore();
    store.applyLocal(addOp('a'));
    store.applyLocal(addOp('b'));
    store.confirmAllPending();
    const local = store.getConfirmed();
    const api = new FakeAPI();
    api.serverHistory = [...local, node('s9')];
    const syncer = new Syncer(store, api);
    await syncer.catchUp();
    // The two local entries must survive the catch-up.
    expect(store.getConfirmed().map((n) => n.id)).toEqual([local[0]!.id, local[1]!.id, 's9']);
  });

  it('catch-up replaces history when the cursor is gone (server rewrite)', async () => {
    const store = new ClientStore();
    store.applyLocal(addOp('a'));
    store.confirmAllPending();
    const api = new FakeAPI();
    api.serverHistory = [node('fresh1'), node('fresh2')];
    const syncer = new Syncer(store, api);
    await syncer.catchUp();
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['fresh1', 'fresh2']);
    expect(findNode(store.getTree(), 'a')).toBeUndefined();
  });

  it('resolveConflict(server) drops pending and catches up', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyLocal(addOp('a'));
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('server');
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2']);
    expect(syncer.getConflict()).toBeNull();
  });

  it('resolveConflict(local) merges server history + pending and sends the base', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyLocal(addOp('a'));
    const pendingId = store.getPending()[0]!.id;
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('local');
    expect(api.rewriteCalls).toEqual([
      { base: 's2', history: [node('s1'), node('s2'), node(pendingId, addOp('a'))] },
    ]);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2', pendingId]);
    expect(store.getPending()).toHaveLength(0);
    expect(syncer.getConflict()).toBeNull();
  });

  it('resolveConflict(local, chosenOps) rewrites with an explicit selection', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyLocal(addOp('a'));
    store.applyLocal(addOp('b'));
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('local', [store.getPending()[0]!]);
    expect(api.rewriteCalls[0]!.base).toBe('s2');
    expect(api.rewriteCalls[0]!.history).toHaveLength(3);
    expect(store.getConfirmed()).toHaveLength(3);
  });

  it('conflict branches diverge at the pre-catch-up head', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyLocal(addOp('a'));
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    api.failSubmitWith = new ApiError(400, '{"conflict_id":"x","reason":"boom"}');
    const syncer = new Syncer(store, api);
    expect(await syncer.sync()).toBe('conflict');
    const conflict = syncer.getConflict();
    // The catch-up applied s2 into confirmed, but the branches must diverge
    // at the pre-catch-up head so the server branch is non-empty.
    expect(conflict?.baseId).toBe('s1');
    expect(conflict?.base).toEqual([node('s1')]);
    expect(conflict?.serverBranch).toEqual([node('s2')]);
    expect(conflict?.localBranch).toHaveLength(1);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2']);
  });

  it('resolveConflict(local) retries once on 409 with a re-merged base', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyLocal(addOp('a'));
    const pendingId = store.getPending()[0]!.id;
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    api.rewriteFailures409 = 1;
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('local');
    expect(api.rewriteCalls).toHaveLength(2);
    expect(api.rewriteCalls[0]!.base).toBe('s2');
    // Second attempt merged over the history that advanced in between.
    expect(api.rewriteCalls[1]!.base).toBe('other0');
    expect(api.rewriteCalls[1]!.history.map((n) => n.id)).toEqual(['s1', 's2', 'other0', pendingId]);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2', 'other0', pendingId]);
    expect(store.getPending()).toHaveLength(0);
  });

  it('resolveConflict(local) after a conflict keeps the local version (server branch discarded)', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1'), node('s2')]);
    store.applyLocal(addOp('a'));
    const pendingId = store.getPending()[0]!.id;
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2'), node('s3')];
    api.failSubmitWith = new ApiError(400, '{"conflict_id":"x","reason":"boom"}');
    const syncer = new Syncer(store, api);
    expect(await syncer.sync()).toBe('conflict');
    api.failSubmitWith = null;
    await syncer.resolveConflict('local');
    // The rewrite starts from the agreed base [s1, s2]; s3 is discarded.
    expect(api.rewriteCalls[0]).toEqual({
      base: 's3',
      history: [node('s1'), node('s2'), node(pendingId, addOp('a'))],
    });
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2', pendingId]);
    expect(store.getPending()).toHaveLength(0);
  });

  it('resolveConflict(local) applies a pending undo to the agreed base', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1'), node('s2')]);
    store.applyUndo(); // targets s2
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2'), node('s3')];
    api.failSubmitWith = new ApiError(400, '{"conflict_id":"x","reason":"boom"}');
    const syncer = new Syncer(store, api);
    expect(await syncer.sync()).toBe('conflict');
    api.failSubmitWith = null;
    await syncer.resolveConflict('local');
    expect(api.rewriteCalls[0]).toEqual({ base: 's3', history: [node('s1')] });
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1']);
    expect(store.getPending()).toHaveLength(0);
  });

  it('resolveConflict(local) propagates a rewrite 400 and keeps the conflict', async () => {
    const store = new ClientStore();
    store.applyLocal(addOp('a'));
    const api = new FakeAPI();
    api.failSubmitWith = new ApiError(400, '{"conflict_id":"x","reason":"boom"}');
    const syncer = new Syncer(store, api);
    expect(await syncer.sync()).toBe('conflict');
    api.failSubmitWith = null;
    api.failRewriteWith = new ApiError(400, 'history does not replay cleanly');
    await expect(syncer.resolveConflict('local')).rejects.toBeInstanceOf(ApiError);
    expect(syncer.getConflict()).not.toBeNull();
    expect(store.getPending()).toHaveLength(1);
  });

  it('sync flushes a pending undo and rolls the confirmed head back', async () => {
    const store = new ClientStore();
    store.applyLocal(addOp('s1'));
    store.confirmAllPending();
    const headId = store.getConfirmed().at(-1)!.id;
    const api = new FakeAPI();
    api.serverHistory = [...store.getConfirmed()];
    const syncer = new Syncer(store, api);
    store.applyUndo();
    expect(await syncer.sync()).toBe('ok');
    expect(api.submitCalls).toEqual([[{ kind: 'remove', id: headId }]]);
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed()).toHaveLength(0);
    expect(countNodes(store.getTree())).toBe(0);
  });

  it('resolveConflict(local) drops a stale undo (the server head advanced)', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyUndo();
    const api = new FakeAPI();
    api.serverHistory = [node('s1'), node('s2')];
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('local');
    // The undo targets s1 which is no longer the server tail (s2 arrived):
    // it is dropped from the merged history.
    expect(api.rewriteCalls).toEqual([{ base: 's2', history: [node('s1'), node('s2')] }]);
    expect(store.getConfirmed().map((n) => n.id)).toEqual(['s1', 's2']);
    expect(store.getPending()).toHaveLength(0);
  });

  it('resolveConflict(local) applies a pending undo that targets the merged tail', async () => {
    const store = new ClientStore();
    store.setConfirmed([node('s1')]);
    store.applyUndo();
    store.applyLocal(addOp('a'));
    const pendingAddId = store.getPending().find((p) => p.kind === 'add')!.id;
    const api = new FakeAPI();
    api.serverHistory = [node('s1')];
    const syncer = new Syncer(store, api);
    await syncer.resolveConflict('local');
    // Here the undo still targets the server tail: the rewrite removes s1.
    expect(api.rewriteCalls[0]!.base).toBe('s1');
    expect(api.rewriteCalls[0]!.history.map((n) => n.id)).toEqual([pendingAddId]);
    expect(store.getConfirmed().map((n) => n.id)).toEqual([pendingAddId]);
    expect(store.getPending()).toHaveLength(0);
  });
});
