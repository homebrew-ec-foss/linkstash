# AGENTS.md

Guidance for AI coding agents working in this repo.

## Project overview

**linkstash** is a small experiment for collecting and sharing interesting links and short notes.
Links posted to a WhatsApp group (bridged to Matrix) are detected by `ash`, forwarded to this
service's API, converted to Markdown via [defuddle.md](https://defuddle.md), and stored in Turso.
The web app renders the saved links in a Hacker News-style feed plus a reader/summary mode.

- Stack: Next.js 16 (App Router), React 19, TypeScript (strict), `@libsql/client` (Turso),
  PostHog analytics, deployed to Cloudflare Workers via `@opennextjs/cloudflare`.
- Package manager: **bun** (`bun.lock`). Do not commit a `package-lock.json` or `yarn.lock`.
- Auth: shared `AUTH_KEY` (Bearer token) gates write/admin endpoints.

## Commands

```bash
bun install                    # install dependencies
bunx vercel dev                # local dev (http://localhost:3000)
bun run dev                    # next dev
bun run build                  # next build
bun run type-check             # tsc --noEmit (run after any change)
bun run db:init                # initialize the Turso DB schema
bun run preview                # opennextjs-cloudflare build + preview
bun run deploy                 # opennextjs-cloudflare build + deploy (requires wrangler auth)
bun run cf-typegen             # regenerate cloudflare-env.d.ts from wrangler.jsonc
```

## Environment variables

Copy `.env.example` to `.env` for local dev. Never commit real secrets.

- `AUTH_KEY` – auth token for `POST /api/add` and `DELETE /api/admin/link`.
- `TURSO_DATABASE_URL` – Turso database URL.
- `TURSO_AUTH_TOKEN` – Turso auth token.
- `LAVA_URL` – optional; overrides the default parser (`https://defuddle.md/`).
- `NEXT_PUBLIC_POSTHOG_KEY` – PostHog client key (used in `instrumentation.client.ts`).

## Architecture & conventions

### DB layer

- All DB access goes through `scripts/db.ts` (`initDb`, `addLink`, `getLinks`, etc.).
- The client is a lazy proxy (`scripts/db.ts:33-50`) typed as `Client`; DB rows are
  snake_case (`submitted_by`, `room_id`), while API responses are camelCase.
- Schema/DDL runs on every request via `initDb()` (`CREATE TABLE/INDEX IF NOT EXISTS`) —
  keep it idempotent; do not add heavy migrations there.
- Link dedup is based on `link_index.normalized_url`; use the normalize helper, never raw URLs.
- `sanitizeLink()` (in `scripts/db.ts` and `app/api/summary/route.ts`) strips sensitive meta
  fields before returning rows. Always apply it to anything returned to clients.

### API routes (App Router)

- One route per file under `app/api/<name>/route.ts`.
- Public GET endpoints: `/api/links`, `/api/feed`, `/api/content/[key]`, `/api/related/[key]`, `/api/summary`, `/api/proxy`.
- Write endpoints (`/api/add`, `/api/admin/link`) must verify the `Authorization: Bearer <AUTH_KEY>` header.
- Public responses must NOT leak `submittedBy`, `roomId`, or `voteState` (see privacy note below).

### Response shapes

- List endpoints return `{ items, total, offset, limit, hasMore }`.
- Single lookups return a bare object or a `404` JSON error.
- RSS feed returns XML (2.0), newest first.

### Client state

- `LinksClient` drives the feed; list/load-more lives in `app/hooks/usePaginatedLinks.ts`.
- Local caching uses keys from `getLinksCacheKey()` in `app/utils/storage.ts` (e.g. `links_cache_latest`).
- Content rendering uses `react-markdown` + `remark-gfm` + `rehype-sanitize` — always sanitize.

## Known pitfalls (do not reintroduce)

- `/api/links` and `/api/feed` must sanitize responses; `meta` contains `submittedBy`, `roomId`,
  and `voteState.recentVoters` (sha256 fingerprints of voters).
- `/api/proxy` is an SSRF-sensitive open proxy — keep private-network blocking and re-validate redirects.
- Auth comparison should fail closed when `AUTH_KEY` is unset and use constant-time compare.
- Validate `limit`/`offset` query params as numbers before interpolating into SQL.
- The reader's queue position feature expects `/api/links` to return an array (it returns an object) —
  fix with the actual shape if touching that page.
- `initDb()` and embedding computation are expensive; do not add more per-request heavy work.
- Search/command palette: never fetch `?limit=10000` on every keystroke without debouncing.

## What's missing (open opportunities)

- No tests, no lint config (only `tsc --noEmit`), no CI. Add them if time permits.
- Dead code that can be removed: `app/hooks/useLinks.ts`, `app/hooks/useReader.ts`,
  `app/components/ReaderModal.tsx`, `app/components/ThemeToggle.tsx`, `RankModeSelector` in
  `app/components/Header.tsx`.
