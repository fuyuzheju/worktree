import type { HistoryNode, HistoryOperation, HistoryPage, Stats, SubmitRequest, RewriteRequest } from '@worktree/core';

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

/** Thin HTTP transport for the server's REST endpoints. */
export class ServerAPI {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async submit(ops: HistoryOperation[]): Promise<void> {
    await this.request('/api/submit', { method: 'POST', body: { htrop: ops } satisfies SubmitRequest });
  }

  /** GET /api/history?after=<cursor> — chain after the cursor, plus whether the cursor was found. */
  async history(after: string | null): Promise<HistoryPage> {
    const query = after === null ? '' : `?after=${encodeURIComponent(after)}`;
    return this.request(`/api/history${query}`);
  }

  async stats(): Promise<Stats> {
    return this.request('/api/stats');
  }

  async rewrite(base: string | null, history: HistoryNode[]): Promise<void> {
    await this.request('/api/rewrite', { method: 'POST', body: { base, history } satisfies RewriteRequest });
  }

  async vapidKey(): Promise<VapidKeyResponse> {
    return this.request('/api/push/vapid-key');
  }

  async pushSubscribe(sub: PushSubscriptionInfo): Promise<void> {
    await this.request('/api/push/subscribe', { method: 'POST', body: sub });
  }

  async pushUnsubscribe(endpoint: string): Promise<void> {
    await this.request('/api/push/subscribe', { method: 'DELETE', body: { endpoint } });
  }

  private async request<T>(path: string, init?: { method?: string; body?: object }): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as T;
  }
}
