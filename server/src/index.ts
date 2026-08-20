import http from 'node:http';
import type { RequestListener } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { onStateChange } from './state';
import { HistoryStore } from './store';
import { WsHub } from './ws';

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

  onStateChange((state) => {
    hub.broadcast({ type: 'state', state });
    if (state === 'offline') hub.closeAll();
  });

  server.listen(config.port, () => {
    console.log(`worktree server listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
