import http from 'node:http';
import type { RequestListener } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { onStateChange } from './state';
import { HistoryStore } from './store';
import { WsHub } from './ws';
import { prisma } from './db';

async function main(): Promise<void> {
  const store = new HistoryStore();
  await store.load();

  // The hub needs the http server, the app needs the hub: wire them lazily.
  let handler: RequestListener = (_req, res) => {
    res.writeHead(404).end();
  };
  const server = http.createServer((req, res) => handler(req, res));
  const hub = new WsHub(server);
  const app = createApp({ store, hub });
  handler = app;

  onStateChange((user, state) => {
    hub.broadcastTo(user, { type: 'state', state });
    if (state === 'offline') hub.closeUser(user);
  });

  server.listen(config.port, () => {
    console.log(`worktree server listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — shutting down`);
    hub.closeAll(); // clients reconnect when the server returns
    server.close();
    server.closeAllConnections();
    void (async () => {
      await store.drain(); // let in-flight submits finish
      await prisma.$disconnect();
      process.exit(0);
    })().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
