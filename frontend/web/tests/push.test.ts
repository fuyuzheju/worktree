import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush, getPushStatus, pushSupported, urlBase64ToUint8Array } from '../src/push';

const PUBLIC_KEY = 'BElL0j5kY8hNn1aA8p2gQ4cR6sT7uV9wX3yZ5bD7fH1jK2lM3nO4pQ5rS6tU7vW8xY9z';
const ENDPOINT = 'https://push.example.com/endpoint-abc';
const P256DH = 'p256dh-value';
const AUTH = 'auth-value';

let fetchMock: ReturnType<typeof vi.fn>;

function makeSubscription(opts?: { applicationServerKey?: ArrayBuffer | Uint8Array | null }) {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }),
    unsubscribe: vi.fn(async () => true),
    options: { applicationServerKey: opts?.applicationServerKey ?? null },
  };
}

function makeRegistration(opts?: { existing?: unknown; created?: unknown }) {
  const existing = opts?.existing === undefined ? null : opts.existing;
  return {
    pushManager: {
      subscribe: vi.fn(async () => opts?.created ?? makeSubscription()),
      getSubscription: vi.fn(async () => existing),
    },
  };
}

function installPushGlobals(opts: {
  permission?: NotificationPermission;
  registration?: unknown;
  getRegistration?: () => Promise<unknown>;
  pushManagerInWindow?: boolean;
}) {
  const registration = opts.registration ?? makeRegistration();
  if (opts.pushManagerInWindow === false) {
    delete (window as unknown as Record<string, unknown>).PushManager;
  } else {
    Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: opts.getRegistration ?? vi.fn(async () => registration),
    },
    configurable: true,
  });
  Object.defineProperty(window, 'Notification', {
    value: {
      permission: opts.permission ?? 'default',
      requestPermission: vi.fn(async () => opts.permission ?? 'granted'),
    },
    configurable: true,
  });
}

function installFetchMock(body: unknown) {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  global.fetch = fetchMock as unknown as typeof fetch;
}

describe('push module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('urlBase64ToUint8Array', () => {
    it('decodes URL-safe base64', () => {
      const out = urlBase64ToUint8Array('AB_-');
      expect([...out]).toEqual([0, 31, 254]);
    });
  });

  describe('pushSupported', () => {
    it('is false when PushManager is missing', () => {
      installPushGlobals({ pushManagerInWindow: false });
      expect(pushSupported()).toBe(false);
    });

    it('is true when the browser APIs exist', () => {
      installPushGlobals({});
      expect(pushSupported()).toBe(true);
    });
  });

  describe('enablePush', () => {
    it('subscribes and records the subscription server-side', async () => {
      const sub = makeSubscription();
      const reg = makeRegistration({ existing: null, created: sub });
      installPushGlobals({ registration: reg });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });

      await enablePush('http://localhost:9997', 'token-1');

      expect(Notification.requestPermission).toHaveBeenCalledOnce();
      expect(reg.pushManager.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });
      // GET /api/push/vapid-key, then POST /api/push/subscribe
      const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
      expect(JSON.parse(String(init.body))).toEqual({
        endpoint: ENDPOINT,
        keys: { p256dh: P256DH, auth: AUTH },
      });
    });

    it('throws when permission is denied', async () => {
      installPushGlobals({ permission: 'denied' });
      await expect(enablePush('http://localhost:9997', 'token-1')).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when the server has push disabled', async () => {
      installPushGlobals({});
      installFetchMock({ pushEnabled: false });
      await expect(enablePush('http://localhost:9997', 'token-1')).rejects.toThrow();
      expect(Notification.requestPermission).toHaveBeenCalledOnce();
    });

    it('reuses an existing subscription when its VAPID key matches the server', async () => {
      const sub = makeSubscription({ applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) });
      const reg = makeRegistration({ existing: sub });
      installPushGlobals({ registration: reg });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });

      await enablePush('http://localhost:9997', 'token-1');
      expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
      expect(sub.unsubscribe).not.toHaveBeenCalled();
      // vapid-key GET + subscribe POST
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('drops an existing subscription bound to a different VAPID key and subscribes fresh', async () => {
      const stale = makeSubscription({ applicationServerKey: new Uint8Array([1, 2, 3]) });
      const fresh = makeSubscription({ applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) });
      const reg = makeRegistration({ existing: stale, created: fresh });
      installPushGlobals({ registration: reg });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });

      await enablePush('http://localhost:9997', 'token-1');

      expect(stale.unsubscribe).toHaveBeenCalledOnce();
      expect(reg.pushManager.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });
    });

    it('resubscribes when the existing subscription has no applicationServerKey', async () => {
      const stale = makeSubscription({ applicationServerKey: null });
      const reg = makeRegistration({ existing: stale });
      installPushGlobals({ registration: reg });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });

      await enablePush('http://localhost:9997', 'token-1');

      expect(stale.unsubscribe).toHaveBeenCalledOnce();
      expect(reg.pushManager.subscribe).toHaveBeenCalledOnce();
    });
  });

  describe('disablePush', () => {
    it('unsubscribes and drops the server-side row', async () => {
      const sub = makeSubscription();
      const reg = makeRegistration({ existing: sub });
      installPushGlobals({ registration: reg });
      fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
      global.fetch = fetchMock as unknown as typeof fetch;

      await disablePush('http://localhost:9997', 'token-1');

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(String(init.body))).toEqual({ endpoint: ENDPOINT });
      expect(sub.unsubscribe).toHaveBeenCalledOnce();
    });

    it('is a no-op when no service worker registration exists', async () => {
      installPushGlobals({ getRegistration: async () => undefined });
      fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      await disablePush('http://localhost:9997', 'token-1');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getPushStatus', () => {
    it('reports unsupported when PushManager is missing', async () => {
      installPushGlobals({ pushManagerInWindow: false });
      expect(await getPushStatus('http://localhost:9997', 'token-1')).toBe('unsupported');
    });

    it('reports denied when permission is denied', async () => {
      installPushGlobals({ permission: 'denied' });
      expect(await getPushStatus('http://localhost:9997', 'token-1')).toBe('denied');
    });

    it('reports serverDisabled when the server has no VAPID keys', async () => {
      installPushGlobals({});
      installFetchMock({ pushEnabled: false });
      expect(await getPushStatus('http://localhost:9997', 'token-1')).toBe('serverDisabled');
    });

    it('reports enabled when a subscription exists', async () => {
      installPushGlobals({ registration: makeRegistration({ existing: makeSubscription() }) });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });
      expect(await getPushStatus('http://localhost:9997', 'token-1')).toBe('enabled');
    });

    it('reports disabled when no subscription exists', async () => {
      installPushGlobals({ registration: makeRegistration() });
      installFetchMock({ pushEnabled: true, publicKey: PUBLIC_KEY });
      expect(await getPushStatus('http://localhost:9997', 'token-1')).toBe('disabled');
    });
  });
});
