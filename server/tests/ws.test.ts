import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { prismaMock, resetDb } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import { registerUser } from '../src/auth';
import { setState } from '../src/state';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';

let server: http.Server;
let port: number;

async function startServer(): Promise<number> {
  server = http.createServer();
  new WsHub(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

/** Resolves with the close code (0 = opened and closed by us afterwards). */
function connect(token: string): Promise<{ ws: WebSocket; opened: boolean }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/api/websocket?token=${token}`);
    let settled = false;
    ws.on('open', () => {
      settled = true;
      resolve({ ws, opened: true });
    });
    ws.on('error', () => {
      // a rejected upgrade surfaces as an error followed by close
    });
    ws.on('close', () => {
      if (!settled) {
        settled = true;
        resolve({ ws, opened: false });
      }
    });
  });
}

beforeEach(async () => {
  resetDb();
  port = await startServer();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('WebSocket upgrade auth', () => {
  it('accepts a valid ?token=', async () => {
    const auth = await registerUser('alice', PW);
    const { ws, opened } = await connect(auth.token);
    expect(opened).toBe(true);
    ws.close();
  });

  it('rejects a bogus token', async () => {
    const { opened } = await connect('bogus-token-value');
    expect(opened).toBe(false);
  });

  it('rejects a missing token', async () => {
    const { opened } = await connect('');
    expect(opened).toBe(false);
  });

  it('503s an offline user with a valid token', async () => {
    const auth = await registerUser('alice', PW);
    setState('alice', 'offline');
    try {
      const { opened } = await connect(auth.token);
      expect(opened).toBe(false);
    } finally {
      setState('alice', 'working');
    }
  });
});
