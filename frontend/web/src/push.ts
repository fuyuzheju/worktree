import { ServerAPI } from '@worktree/client';

export type PushStatus = 'unsupported' | 'serverDisabled' | 'denied' | 'enabled' | 'disabled' | 'checking';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export class PushError extends Error {}

function toServerSub(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // The prod build registers /sw.js on load; dev does not, so register on demand.
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Subscribe this browser to the server's Web Push and record it server-side. */
export async function enablePush(serverUrl: string, token: string): Promise<void> {
  if (!pushSupported()) throw new PushError('unsupported');
  if ((await Notification.requestPermission()) !== 'granted') throw new PushError('denied');
  const api = new ServerAPI(serverUrl, token);
  const key = await api.vapidKey();
  if (!key.pushEnabled || key.publicKey === undefined) throw new PushError('serverDisabled');
  const currentKey = urlBase64ToUint8Array(key.publicKey);
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing !== null && hasKey(existing, currentKey)) {
    await api.pushSubscribe(toServerSub(existing));
    return;
  }
  // A leftover subscription bound to an old VAPID key is rejected by the push
  // service; drop it and subscribe fresh with the current key.
  if (existing !== null) await existing.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: currentKey,
  });
  await api.pushSubscribe(toServerSub(sub));
}

/** True when the subscription was created with `expected` as its applicationServerKey. */
function hasKey(sub: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const actual = sub.options?.applicationServerKey ?? null;
  if (actual === null) return false;
  const a = new Uint8Array(actual);
  if (a.length !== expected.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== expected[i]) return false;
  }
  return true;
}

/** Unsubscribe this browser from Web Push and drop the server-side row. */
export async function disablePush(serverUrl: string, token: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg === undefined) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub === null) return;
  const api = new ServerAPI(serverUrl, token);
  await api.pushUnsubscribe(sub.endpoint);
  await sub.unsubscribe();
}

/** Current notification state for the UI. */
export async function getPushStatus(serverUrl: string, token: string): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const api = new ServerAPI(serverUrl, token);
  const key = await api.vapidKey();
  if (!key.pushEnabled) return 'serverDisabled';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub !== null && sub !== undefined ? 'enabled' : 'disabled';
}

/** Convert a URL-safe base64 VAPID key to the Uint8Array pushManager expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
