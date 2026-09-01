import type { Node, Reminder, Tree } from '@worktree/core';
import { Prisma } from '@prisma/client';
import webpush from 'web-push';
import { config, pushEnabled } from './config';
import { prisma } from './db';
import type { HistoryStore } from './store';

/** How long after an occurrence passes it may still fire (ms). */
export const FIRE_WINDOW_MS = 60_000;

/** A reminder occurrence that is due within the fire window. */
export interface DueReminder {
  userId: number;
  nodeId: string;
  nodeName: string;
  rmdId: string;
  name?: string;
  occurrence: number;
}

/**
 * Pure: walk a tree and collect reminders whose latest occurrence is due
 * within `[now - windowMs, now)`. Earlier occurrences are skipped forever
 * (missed reminders are never backfilled). Inactive reminders and reminders
 * on completed nodes never fire.
 */
export function computeDue(tree: Tree, userId: number, now: number, windowMs = FIRE_WINDOW_MS): DueReminder[] {
  const due: DueReminder[] = [];
  const walk = (node: Node): void => {
    if (node.status !== true) {
      for (const r of node.reminders) {
        const occurrence = latestOccurrence(r, now);
        if (occurrence !== null && now - occurrence < windowMs) {
          due.push({ userId, nodeId: node.id, nodeName: node.name, rmdId: r.id, name: r.name, occurrence });
        }
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(tree.getRoot());
  return due;
}

/** Latest occurrence T = deadline + k*repeat with T <= now; null if none. */
function latestOccurrence(r: Reminder, now: number): number | null {
  if (!r.active) return null;
  if (now < r.deadline) return null;
  if (r.repeat === undefined || r.repeat <= 0) return r.deadline;
  const k = Math.floor((now - r.deadline) / r.repeat);
  return r.deadline + k * r.repeat;
}

export interface PushPayload {
  title?: string;
  body: string;
  tag: string;
  icon: string;
  url: string;
}

export function payloadFor(d: DueReminder): PushPayload {
  return {
    title: d.name,
    body: d.nodeName,
    tag: 'worktree-reminder',
    icon: '/icons/icon-192.png',
    url: `/?node=${d.nodeId}`,
  };
}

type Send = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: PushPayload) => Promise<void>;

/**
 * One sweep: claim each due occurrence (insert a dedupe row first), then
 * deliver to every subscription of that user. A claim is only removed on
 * transient send failure so the next sweep retries within the window;
 * dead subscriptions (404/410) are deleted without retrying the occurrence.
 */
export async function sweepOnce(store: HistoryStore, now: number, send: Send = sendNotification): Promise<void> {
  const due = store.allUserTrees().flatMap(({ userId, tree }) => computeDue(tree, userId, now));
  for (const d of due) {
    let claimed = false;
    try {
      await prisma.reminderFire.create({ data: { userId: d.userId, rmdId: d.rmdId, occurrence: BigInt(d.occurrence) } });
      claimed = true;
      console.log(
        `[push] due: user=${d.userId} rmd=${d.rmdId} "${d.name ?? ''}" node="${d.nodeName}" ` +
          `occurrence=${d.occurrence} (${Math.round(now - d.occurrence)}ms after due)`,
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      console.log(`[push] already fired (dedup), skipping: user=${d.userId} rmd=${d.rmdId} occurrence=${d.occurrence}`);
    }
    if (!claimed) continue;
    const subs = await prisma.pushSubscription.findMany({ where: { userId: d.userId } });
    if (subs.length === 0) {
      console.log(`[push] no subscriptions for user=${d.userId}, occurrence dropped`);
      continue;
    }
    console.log(`[push] delivering to ${subs.length} subscription(s)`);
    for (const sub of subs) {
      try {
        await send(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadFor(d),
        );
      } catch (err) {
        if (isGoneError(err)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          console.error('push send failed, will retry next sweep:', err);
          await prisma.reminderFire.deleteMany({
            where: { userId: d.userId, rmdId: d.rmdId, occurrence: BigInt(d.occurrence) },
          });
          break;
        }
      }
    }
  }
}

export async function sendNotification(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
): Promise<void> {
  const res = await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    JSON.stringify(payload),
    { TTL: 60 },
  );
  console.log(`[push] push service responded: status=${res.statusCode} host=${new URL(sub.endpoint).host}`);
}

export function isGoneError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    [404, 410].includes((err as { statusCode: number }).statusCode)
  );
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function startReminderSweeper(opts: {
  store: HistoryStore;
  intervalMs?: number;
  send?: Send;
  now?: () => number;
}): () => void {
  const intervalMs = opts.intervalMs ?? config.reminderSweepMs;
  if (intervalMs >= FIRE_WINDOW_MS) {
    throw new Error(
      `sweep interval (${intervalMs}ms, REMINDER_SWEEP_MS) must be smaller than the fire window (${FIRE_WINDOW_MS}ms), ` +
        'otherwise occurrences can fall between ticks and never fire',
    );
  }
  const now = opts.now ?? (() => Date.now());
  const send = opts.send ?? sendNotification;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    sweepOnce(opts.store, now(), send)
      .catch((err) => console.error('reminder sweep failed:', err))
      .finally(() => {
        running = false;
      });
  };
  if (pushEnabled) {
    webpush.setVapidDetails(config.vapidSubject ?? '', config.vapidPublicKey ?? '', config.vapidPrivateKey ?? '');
  }
  console.log(`[push] sweeper started: interval=${intervalMs}ms pushEnabled=${pushEnabled}`);
  timer = setInterval(tick, intervalMs);
  return () => {
    if (timer !== undefined) clearInterval(timer);
  };
}
