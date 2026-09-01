import type { HistoryNode, HistoryOperation, HistoryPage, Stats, SubmitRequest, RewriteRequest } from '@worktree/core';
import { isHistoryPage, isRecord, isStats } from '@worktree/core';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Browser push subscription as the server stores it. */
export interface PushSubscriptionInfo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeyResponse {
  pushEnabled: boolean;
  publicKey?: string;
}

function isOkResponse(v: unknown): v is { ok: boolean } {
  return isRecord(v) && v.ok === true;
}

function isVapidKeyResponse(v: unknown): v is VapidKeyResponse {
  return (
    isRecord(v) &&
    typeof v.pushEnabled === 'boolean' &&
    (v.publicKey === undefined || typeof v.publicKey === 'string')
  );
}

/** Turn a guard into a validator that throws on a malformed response body. */
function parseOrThrow<T>(guard: (v: unknown) => v is T): (v: unknown) => T {
  return (v: unknown): T => {
    if (!guard(v)) throw new ApiError(0, 'malformed response');
    return v;
  };
}

/** Thin HTTP transport for the server's REST endpoints. */
export class ServerAPI {
  constructor(
    private baseUrl: string,
    private token: string | undefined,
  ) {}

  async submit(ops: HistoryOperation[]): Promise<void> {
    await this.request('/api/submit', parseOrThrow(isOkResponse), { method: 'POST', body: { htrop: ops } satisfies SubmitRequest });
  }

  /** GET /api/history?after=<cursor> — chain after the cursor, plus whether the cursor was found. */
  async history(after: string | null): Promise<HistoryPage> {
    const query = after === null ? '' : `?after=${encodeURIComponent(after)}`;
    return this.request(`/api/history${query}`, parseOrThrow(isHistoryPage));
  }

  async stats(): Promise<Stats> {
    return this.request('/api/stats', parseOrThrow(isStats));
  }

  async rewrite(base: string | null, history: HistoryNode[]): Promise<void> {
    await this.request('/api/rewrite', parseOrThrow(isOkResponse), { method: 'POST', body: { base, history } satisfies RewriteRequest });
  }

  async vapidKey(): Promise<VapidKeyResponse> {
    return this.request('/api/push/vapid-key', parseOrThrow(isVapidKeyResponse));
  }

  async pushSubscribe(sub: PushSubscriptionInfo): Promise<void> {
    await this.request('/api/push/subscribe', parseOrThrow(isOkResponse), { method: 'POST', body: sub });
  }

  async pushUnsubscribe(endpoint: string): Promise<void> {
    await this.request('/api/push/subscribe', parseOrThrow(isOkResponse), { method: 'DELETE', body: { endpoint } });
  }

  private async request<T>(
    path: string,
    validate: (v: unknown) => T,
    init?: { method?: string; body?: object },
  ): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: init?.method ?? 'GET',
      headers: {
        ...(this.token === undefined ? {} : { Authorization: `Bearer ${this.token}` }),
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return validate(await res.json());
  }
}
