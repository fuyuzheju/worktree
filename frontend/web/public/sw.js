/* App-shell cache, network-first. Bump CACHE when the shell's caching policy
   changes; old caches are deleted on activate. /api/* is never touched — sync
   data freshness is managed by the client kernel's own localStorage state. */
const CACHE = 'worktree-shell-v1';
const MAX_ENTRIES = 100;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        const keys = await cache.keys();
        if (keys.length >= MAX_ENTRIES) {
          const stale = keys.slice(0, keys.length - MAX_ENTRIES + 1);
          await Promise.all(stale.map((key) => cache.delete(key)));
        }
        await cache.put(request, response.clone());
      } catch (e) {
        console.error('failed to update shell cache:', e);
      }
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = (await cache.match('/')) || (await cache.match('/index.html'));
      if (shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(networkFirst(request));
});
