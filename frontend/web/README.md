# web

Browser frontend for WORKTREE — a pure view over `@worktree/client`:
all state, syncing and op construction live in the kernel.

- `client.getTree()` + `client.subscribe(...)` for rendering
- `client.addNode/removeNode/...` semantic methods for mutations
- `client.sync()` / `client.resolveConflict(...)` for sync and conflicts

## Run

```sh
npm run dev:server   # terminal A — the backend on :3000
npm run dev:web      # terminal B — vite dev server, open the printed URL
```

The web app talks directly to `http://localhost:3000` (CORS enabled);
the server URL and user can be changed on the Settings tab.
