import { Router } from 'express';
import type { Response } from 'express';
import {
  DEFAULT_CAPTURE_PATH,
  captureName,
  displayPathOf,
  newId,
  normalizeCapturePath,
  planCapture,
} from '@worktree/core';
import type { CapturePlan } from '@worktree/core';
import { BrokenHistoryError, DuplicateOpError, ValidationError } from '../store';
import type { HistoryStore } from '../store';
import type { WsHub } from '../ws';

interface CaptureBody {
  id?: unknown;
  text?: unknown;
  path?: unknown;
}

/**
 * Thin capture endpoint for callers that cannot run the client kernel (iOS
 * Shortcuts, Tasker, curl, hotkey glue). It plans through core's planCapture —
 * the same function the client kernel uses — and appends the resulting
 * ordinary add ops via the normal submit machinery, so nothing about the
 * history model changes.
 *
 * `id` is optional: when given it is the captured node's id and the retry key
 * (a repeat with the same id is an idempotent no-op); when omitted the server
 * generates one, so the call is not retry-safe.
 */
export function captureRouter(store: HistoryStore, hub: WsHub): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const body: CaptureBody | undefined = req.body;
    const text = body?.text;
    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text must be a string' });
      return;
    }
    const id = body?.id === undefined ? newId() : body.id;
    if (typeof id !== 'string' || id === '') {
      res.status(400).json({ error: 'id must be a non-empty string' });
      return;
    }
    const path = body?.path === undefined ? DEFAULT_CAPTURE_PATH : body.path;
    if (typeof path !== 'string') {
      res.status(400).json({ error: 'path must be a string' });
      return;
    }
    let baseName: string;
    let segments: string[];
    try {
      baseName = captureName(text);
      segments = normalizeCapturePath(path);
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
      return;
    }
    const user: string = res.locals.user;

    // Idempotent retry: the entry is already stored — replanning could rename
    // it (a sibling appeared) or collide with itself.
    try {
      const existing = await store.getById(user, id);
      if (existing !== null) {
        if (existing.op.kind !== 'add') {
          res.status(409).json({ error: `entry ${id} already exists and is not a capture` });
          return;
        }
        const state = await store.getTreeForUser(user);
        res.json({
          ok: true,
          nodeId: id,
          displayPath: displayPathOf(state.tree, id) ?? `/${[...segments, baseName].join('/')}`,
        });
        return;
      }
    } catch (e) {
      if (sendBroken(res, e)) return;
      throw e;
    }

    for (let attempt = 0; ; attempt++) {
      let plan: CapturePlan;
      try {
        const state = await store.getTreeForUser(user);
        plan = planCapture(state, { id, text, path, timestamp: Date.now(), createId: newId });
      } catch (e) {
        if (sendBroken(res, e)) return;
        // planCapture's own throws are capture-shape validation (empty text,
        // '/' in the name, bad path): the request is at fault.
        res.status(400).json({ error: errMsg(e) });
        return;
      }
      try {
        const { added } = await store.appendBatch(user, plan.entries);
        for (const node of added) hub.broadcastTo(user, { type: 'op', node });
        res.json({ ok: true, nodeId: plan.nodeId, displayPath: plan.displayPath });
        return;
      } catch (e) {
        // The same capture raced itself and the other request landed first.
        if (e instanceof DuplicateOpError && e.id === id) {
          res.json({ ok: true, nodeId: id, displayPath: plan.displayPath });
          return;
        }
        // Another capture won the name between our plan and our append: re-plan
        // once against the fresh history so the loser converges to `X (2)`.
        if (e instanceof ValidationError && attempt === 0 && e.reason.includes('duplicate sibling name')) {
          continue;
        }
        if (sendBroken(res, e)) return;
        if (e instanceof ValidationError) {
          res.status(400).json({ error: e.reason });
          return;
        }
        throw e;
      }
    }
  });

  return router;
}

/** 409 when the user's history no longer replays; false when the error is something else. */
function sendBroken(res: Response, e: unknown): boolean {
  if (!(e instanceof BrokenHistoryError)) return false;
  res.status(409).json({ error: e.message, entry_id: e.entryId, reason: e.reason });
  return true;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
