# web (reserved)

Placeholder for the future web frontend.

The web UI must be a pure view over `@worktree/client` — no data logic:
all state, syncing and op construction live in the kernel. When built,
add it as a workspace (`frontend/web`) and mirror the CLI's usage pattern:

- `client.getTree()` + `client.subscribe(...)` for rendering
- `client.addNode/removeNode/...` semantic methods for mutations
- `client.sync()` / `client.resolveConflict(...)` for sync and conflicts
