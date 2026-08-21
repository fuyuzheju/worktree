import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerSocket } from '../src/socket';
import type { SocketHandlers } from '../src/socket';
import { WorktreeClient } from '../src/client';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    // closed — the real ws fires onclose asynchronously; tests drive serverClose() instead
  }

  serverClose(): void {
    this.onclose?.();
  }
}

const handlers = (): SocketHandlers => ({
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onOp: vi.fn(),
  onRemoved: vi.fn(),
  onHistoryReplaced: vi.fn(),
  onState: vi.fn(),
});

vi.stubGlobal('WebSocket', FakeWebSocket);

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServerSocket', () => {
  it('reconnects with exponential backoff after an unexpected close', () => {
    const socket = new ServerSocket('ws://localhost:1', handlers());
    socket.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!.serverClose();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.serverClose();
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    FakeWebSocket.instances[2]!.serverClose();
    vi.advanceTimersByTime(4000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('close() cancels a pending reconnect so nothing keeps the process alive', () => {
    const socket = new ServerSocket('ws://localhost:1', handlers());
    socket.connect();
    FakeWebSocket.instances[0]!.serverClose();
    socket.close();
    vi.advanceTimersByTime(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1); // no further attempts
  });

  it('delivers server messages to the handlers', () => {
    const h = handlers();
    const socket = new ServerSocket('ws://localhost:1', h);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.onmessage!({ data: JSON.stringify({ type: 'op', node: { id: 'h1', op: { kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 } } }) });
    expect(h.onOp).toHaveBeenCalledWith({ id: 'h1', op: { kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 } });
    ws.onmessage!({ data: JSON.stringify({ type: 'state', state: 'offline' }) });
    expect(h.onState).toHaveBeenCalledWith('offline');
  });

  it('the client appends the user param to the derived WS URL', () => {
    const client = new WorktreeClient({ serverUrl: 'http://localhost:3000', user: 'alice' });
    client.connect();
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://localhost:3000/websocket?user=alice');
    client.disconnect();
  });

  it('the client merges the user param into a custom wsUrl', () => {
    const client = new WorktreeClient({
      serverUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:9999/socket?foo=1',
      user: 'alice',
    });
    client.connect();
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://localhost:9999/socket?foo=1&user=alice');
    client.disconnect();
  });

  it('a local client never opens a socket', () => {
    const client = new WorktreeClient({ serverUrl: 'http://localhost:3000', user: 'local', local: true });
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
