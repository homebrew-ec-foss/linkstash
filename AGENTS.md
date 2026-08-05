# AGENTS.md

Guidance for AI coding agents working in this repo.

## Project overview

**linkstash** is a small experiment for collecting and sharing interesting links and short notes.
Links posted to a WhatsApp group (bridged to Matrix) are detected by `ash`, forwarded to this
service's API, converted to Markdown via [defuddle.md](https://defuddle.md), and stored in Turso.
The web app renders the saved links in a Hacker News-style feed plus a reader/summary mode.

- Stack: **SvelteKit** (runes), Svelte 5, TypeScript (strict), `@libsql/client` (Turso),
  PostHog analytics, deployed to **Cloudflare Workers** via `@sveltejs/adapter-cloudflare`.
- Package manager: **bun** (`bun.lock`). Do not commit a `package-lock.json` or `yarn.lock`.
- Auth: shared `AUTH_KEY` (Bearer token) gates write/admin endpoints.
- This is a SvelteKit port of the former Next.js app; server code lives in
  `src/routes/api/*/ +server.ts` and `src/lib/server/*`.

## Commands

```bash
bun install                    # install dependencies
bun run dev                    # vite dev (http://localhost:3000)
bun run check                  # svelte-check (tsc + a11y warnings) — run after any change
bun run build                  # vite build (adapter-cloudflare -> .cloudflare/)
bun run preview                # build + wrangler dev
bun run deploy                 # build + wrangler deploy (requires wrangler auth)
bun run db:init                # initialize the Turso DB schema
bun run cf-typegen             # regenerate cloudflare-env.d.ts from wrangler.jsonc
```

Local `wrangler dev` reads secrets from `.dev.vars` (gitignored); copy `.dev.vars.example`.
`bunx svelte-kit sync` regenerates `.svelte-kit/types` after adding/renaming routes.

## Environment variables

Copy `.env.example` to `.env` for local dev (`vite dev`), and `.dev.vars.example` to
`.dev.vars` for `wrangler dev`. Never commit real secrets.

- `AUTH_KEY` – auth token for `POST /api/add` and `DELETE /api/admin/link`.
- `TURSO_DATABASE_URL` – Turso database URL.
- `TURSO_AUTH_TOKEN` – Turso auth token.
- `LAVA_URL` – optional; overrides the default parser (`https://defuddle.md/`).
- `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` – PostHog (client `src/lib/posthog-client.ts`
  and server `src/lib/server/posthog.ts`). `PUBLIC_`-prefixed vars must be read via
  `$env/dynamic/public` — they are NOT in `$env/dynamic/private`.
- `VOTE_COOLDOWN_MS` – optional; upvote cooldown in ms (default 6h).

## Architecture & conventions

### DB layer

- All DB access goes through `src/lib/server/db.ts` (`getClient`, `initDb`, `getLinks`,
  `getPaginatedLinks`, `addLink`, `getLinkByUrl`, `deleteLinkById`, etc.). Only import these
  from server contexts (`+server.ts`, `+page.server.ts`, `+layout.server.ts`, scripts).
- The client is a lazy proxy typed as `Client`; DB rows are snake_case (`submitted_by`,
  `room_id`), while API responses are camelCase (see `rowToLink`).
- Schema/DDL runs on every request via `initDb()` (`CREATE TABLE/INDEX IF NOT EXISTS`) —
  keep it idempotent; do not add heavy migrations there.
- Link dedup is based on `link_index.normalized_url`; use the normalize helper, never raw URLs.
- `sanitizeLink()` strips sensitive meta fields before returning rows. Always apply it to
  anything returned to clients.
- `getPaginatedLinks()` (db.ts) is the single source of truth for feed pages — the
  `/api/links` route and the SSR `+page.server.ts` load both use it so SSR HTML matches the API.
- The embeddings vector index is best-effort (`ensureVectorIndex`); the related API falls back
  to a scan. Turso may throw `vector index(insert): failed to insert shadow row` — pre-existing
  environment issue, not a port bug.

### SSR + client state

- `src/routes/+page.server.ts` server-renders the first 50 links; `LinksClient` seeds the
  store with that `initialPage` so there's no "Loading links…" flash, then hydrates.
- `createPaginatedLinks()` (`src/lib/stores/links.svelte.ts`) drives the feed. It returns
  **getters** — consumers must access `store.links` / `store.isLoading`, never destructure
  (destructuring a getter captures the initial primitive value and breaks reactivity).
- Local caching uses keys from `getLinksCacheKey()` in `src/lib/utils/storage.ts`.
- Content rendering (`src/lib/markdown.ts`) uses `marked` + `sanitize-html` for SSR-safe
  output — always sanitize. `js-yaml` v5 has NO default export; import `{ load }`.

### API routes (SvelteKit)

- One route per file under `src/routes/api/<name>/+server.ts`, exporting `GET`/`POST`/`DELETE`.
- Public GET endpoints: `/api/links`, `/api/feed`, `/api/content/[key]`, `/api/related/[key]`,
  `/api/summary`, `/api/proxy`.
- Write endpoints (`/api/add`, `/api/admin/link`) must verify the
  `Authorization: Bearer <AUTH_KEY>` header.
- Public responses must NOT leak `submittedBy`, `roomId`, or `voteState.recentVoters`
  (sha256 fingerprints of voters).

### Response shapes

- List endpoints return `{ items, total, offset, limit, hasMore }`.
- Single lookups return a bare object or a `404` JSON error.
- RSS feed returns XML (2.0), newest first.

## Known pitfalls (do not reintroduce)

- `/api/links` and `/api/feed` must sanitize responses; `meta` contains `submittedBy`, `roomId`,
  and `voteState.recentVoters`.
- `/api/proxy` is an SSRF-sensitive open proxy — keep private-network blocking and re-validate redirects.
- Auth comparison should fail closed when `AUTH_KEY` is unset and use constant-time compare.
- Validate `limit`/`offset` query params as numbers before interpolating into SQL.
- Do not destructure the links store's getter properties in components — access them on the
  returned object so reactivity is preserved.
- `sw.js` (in `static/`) must never intercept `/api/*` (it only offline-caches `/api/content/*`
  and the app shell) and its `respondWith` promises must never reject.
- `initDb()` and embedding computation are expensive; do not add more per-request heavy work.
- Search/command palette: never fetch `?limit=10000` on every keystroke without debouncing.
- `.cloudflare/` and `.svelte-kit/` are build output (gitignored). `_headers` lives at the
  project root (required by adapter-cloudflare), not in `static/`.

## What's missing (open opportunities)

- No tests, no lint config (only `svelte-check`), no CI. Add them if time permits.
- The `rising` rank mode loads the full dataset in-memory (`/api/links`); could be optimized.
- `/api/related` vector-index path may fail on some Turso DBs (shadow-row insert bug); endpoint degrades gracefully to scan fallback. Run `bun run db:reindex` to repair the vector index if needed.
