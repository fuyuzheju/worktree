# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Standards

1. **No type assertions** — Do not use `as`, `as any`, `as type`, or non-null assertion (`!`). Use proper type narrowing, Zod validation, or type guards instead. If you believe a type assertion is strictly necessary, explain why and get explicit confirmation before writing it.
2. **English in codebase** — All code, comments, commit messages, and any file contents in this repository must be written in English. Chinese is reserved for conversational communication with the user only.
3. **Comments only when necessary** — Skip comments for obvious or self-documenting code. Only add comments in places where the logic is genuinely complex, uses a non-obvious algorithm, could be misinterpreted, contains a workaround/patch, or is error-prone. When a comment is needed, make it thorough and clear — explain the *why*, not the *what*.

## Commands

npm workspaces monorepo: `core`, `server`, `client`, `frontend/cli`, `frontend/web` (packages `@worktree/*`).

```sh
npm install                # workspace deps + prisma generate (server postinstall)
npm run typecheck          # tsc --noEmit in every workspace
npm run test               # vitest run in every workspace
npm run build              # web (tsc + vite build), cli (esbuild bundle)
npm run dev:server         # tsx watch, server on port 9997 (PORT env)
npm run dev:web            # vite dev server
npm run cli -- <cmd>       # run the CLI (tsx src/cli.ts)
```

Single test / watch (from any workspace dir, e.g. `core/`):
`npx vitest run tests/tree.test.ts` or `npx vitest` for watch mode.

Prisma (server): `DATABASE_URL=file:./dev.db npm run prisma:migrate` (or `prisma:push`) after schema changes. DB is gitignored.

Server config is env-driven (`server/src/config.ts`): `PORT`, `DATABASE_URL`, `REGISTRATION_MODE` (only `open` today; `invite` reserved), `REMINDER_SWEEP_MS`, VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — push is disabled until set).

## Architecture

Dependency direction: `core` ← `server`/`client` ← `cli`/`web`. `core` is pure logic with zero I/O (no fs, network, or platform APIs) — everything derives from replaying an op history, which keeps clients and server convergent.

- **core** — data types, protocol, and pure functions: tree/calendar state derivation (replay), validation, filtering, pending queue, id generation. `docs/` are the contract for what it implements.
- **server** — Express (REST) + `ws` (WebSocket) + Prisma (SQLite) + web-push. `HistoryStore` holds per-user histories in memory (loaded from DB at boot); each user's validate→append runs under a per-user serialization lock. `WsHub` broadcasts appended ops; per-user state `working|offline` (offline during a history rewrite: 503, WS closed). A 30s sweeper fires due reminders via browser push.
- **client** — platform-agnostic sync engine: `Syncer` (catch-up + submit + conflict branch), `ClientStore` (history + pending queue persisted via a `ClientStorage` interface), `ServerAPI`/`socket`. Both CLI and web plug in their own storage.
- **frontend/web** — React 19 + Vite PWA. Pages: Auth, Tree, Calendar, Conflict, Settings, Stats. Handles web-push subscription (`push.ts`) and conflict resolution UI (local vs server branch).
- **frontend/cli** — command-parsing CLI over the client engine; config/auth stored under `~/.worktree/`.

## Sync model (read `docs/sync.md` + `docs/data_structure.md` — they are the source of truth)

- Every user has their own history: an ordered list of ops, each identified by a client-generated UUID. No serial numbers, no hash chains.
- Clients sync via cursor catch-up (`GET /api/history?after=<cursor>`; `cursorFound:false` means the history was rewritten — re-catch-up fully). Ops are idempotent server-side: same UUID skipped; unknown UUID rejected only if it conflicts with an existing one.
- Offline edits go to a `PendingQueue` and are flushed on (re)connect. Render = replay(confirmed history) + pending ops. Undo is the only op on the log itself: drops a pending add locally, otherwise enqueues a `remove` of the head.
- Conflicts (400) branch at the last agreed entry; the user picks server branch (drop pending) or own branch (`/api/rewrite`). 503 = user offline (retry, never branch); 401 = auth failed (stop syncing, prompt login). Never confuse these three.
- Replay must be deterministic: derived state (e.g. block↔node completion propagation) is computed inside a single apply and never appends history ops. Legacy ops replay to fixed defaults (note `''`, `createdAt` 0, no deadline).
- Undo removes only the head entry; validation checks (parent exists, sibling names unique, no cycles on move, block start<end, one block per node) run against the tree as it stands after the batch's preceding ops.

## Auth & users

- Users are created only via `POST /api/register` (open registration, scrypt-hashed passwords). REST uses `Authorization: Bearer <token>`; WS uses `?token=` (browsers can't set WS headers). Server stores only SHA-256 token hashes; tokens are per-device and revocable.
- `local` is a reserved client-side-only username: never talks to the server, ops append straight into the local history. Offline-only, device-local todos.
- Keep identity out of op payloads — auth lives in the server's request layer (`server/src/auth.ts`, `userMiddleware`), never in core.

## Testing

Vitest in every workspace; tests live in `tests/` next to their package. Server tests use supertest against an in-memory store. Core's replay determinism and filter logic are the most heavily tested pieces — when changing validation or derivation, update those.
