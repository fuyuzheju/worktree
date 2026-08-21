import type { HistoryNode, HistoryOperation, HistoryPage, Stats, SubmitRequest, RewriteRequest } from '@worktree/core';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin HTTP transport for the server's REST endpoints. */
export class ServerAPI {
  constructor(
    private baseUrl: string,
    private user: string,
  ) {}

  async submit(ops: HistoryOperation[]): Promise<void> {
    await this.request('/submit', { method: 'POST', body: { htrop: ops } satisfies SubmitRequest });
  }

  /** GET /history?after=<cursor> — chain after the cursor, plus whether the cursor was found. */
  async history(after: string | null): Promise<HistoryPage> {
    const query = after === null ? '' : `?after=${encodeURIComponent(after)}`;
    return this.request(`/history${query}`);
  }

  async stats(): Promise<Stats> {
    return this.request('/stats');
  }

  async rewrite(base: string | null, history: HistoryNode[]): Promise<void> {
    await this.request('/rewrite', { method: 'POST', body: { base, history } satisfies RewriteRequest });
  }

  private async request<T>(path: string, init?: { method?: string; body?: object }): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: init?.method ?? 'GET',
      headers: {
        'X-User': this.user,
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as T;
  }
}
