# [linkstash.hsp-ec.xyz](https://linkstash.hsp-ec.xyz)

**linkstash** is a small experiment for collecting and sharing interesting links and short notes you find during the week.

> Previously we used a self‑hosted parser (`lava`), but the service now leverages the public
> [defuddle.md](https://defuddle.md) converter.  Append any URL as a path component
> (e.g. `curl https://defuddle.md/stephango.com`) and you'll get back Markdown with
> YAML frontmatter.

## How it works

1. `ash` detects links posted to a WhatsApp group (bridged to Matrix) and forwards them to the Cloudflare Worker API.
2. `linkstash` calls the Markdown parser (`defuddle.md` by default) and stores the markdown +
   rich frontmatter in Turso
3. The app lists saved links and renders the parsed Markdown in a Hacker News–style feed.

## Stack

- **SvelteKit** (App Router, runes) + **Vite**, TypeScript (strict)
- Deployed to **Cloudflare Workers** via `@sveltejs/adapter-cloudflare`
- `@libsql/client` (Turso), PostHog analytics
- Package manager: **bun** (`bun.lock`). Do not commit a `package-lock.json` or `yarn.lock`.

## Quick start

```bash
bun install
cp .env.example .env
bun run dev                 # vite dev server (http://localhost:3000)
```

To preview the production Worker build locally:

```bash
cp .env.example .dev.vars  # wrangler reads secrets from .dev.vars (gitignored)
bun run build              # vite build -> .cloudflare/worker.js + .cloudflare/static
bunx wrangler dev          # run the built Worker on http://localhost:8787
```

## Commands

```bash
bun run dev            # vite dev
bun run build          # vite build (adapter-cloudflare)
bun run check          # svelte-check (type-check + lint warnings)
bun run preview        # build + wrangler dev
bun run deploy         # build + wrangler deploy (requires wrangler auth)
bun run db:init        # initialize the Turso DB schema
bun run cf-typegen     # regenerate cloudflare-env.d.ts from wrangler.jsonc
```

## Environment Variables

- `AUTH_KEY`: Your authentication key
- `TURSO_DATABASE_URL`: Your Turso database URL
- `TURSO_AUTH_TOKEN`: Your Turso auth token
- `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST`: PostHog analytics (client + server)
- `VOTE_COOLDOWN_MS`: Cooldown between upvotes from the same submitter/room (default 6h)
- `LAVA_URL`: Optional; overrides the default parser (`https://defuddle.md/`) for testing or backwards compatibility.

> `PUBLIC_`-prefixed vars are exposed to the client; `AUTH_KEY`, Turso and parser
> vars are server-only and read via `$env/dynamic/private`.

## API Endpoints

- `POST /api/add` - Add a new link
- `GET /api/links` - Get all links (paginated, supports `mode`/`offset`/`limit`/`url`)
- `GET /api/feed` - RSS feed of all links
- `GET /api/summary` - Summary of links for a date range
- `GET /api/content/[key]` - Get content by key
- `GET /api/related/[key]` - Semantically related links
- `GET /api/proxy` - SSRF-guarded URL proxy
- `DELETE /api/admin/link` - Delete a link (admin)

See [api.md](./api.md) for details.

## Admin

- `/admin` — simple admin UI to delete links (protected by `AUTH_KEY`). This page lets you enter your `AUTH_KEY` and delete individual links. Deletions call the server (`DELETE /api/admin/link`) and are gated by the same `AUTH_KEY` used for adding links.

## API examples

Below are quick curl examples for local development (assumes `bun run dev` or
`bunx wrangler dev`) and that `AUTH_KEY` is set in your environment.

### Add a link (POST)

```bash
curl -X POST "http://localhost:3000/api/add" \
  -H "Authorization: Bearer $AUTH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"link": {"url": "https://example.com/article", "submittedBy": "bot"}}'
```

- Success returns `{ "ok": true }`.
- Possible responses: `401 Unauthorized` (bad/absent auth), `400 Bad Request` (missing link), `500` on server errors.

### Get content by key (GET)

```bash
curl "http://localhost:3000/api/content/<key>"
```

- Returns the saved `content` (plain text / markdown) for the given link `id`.
- If not found you'll get a JSON `404` response: `{ "error": "Not found" }`.

> Note: `/api/links` is a lightweight index and returns the link `meta` fields directly (spread into the response). It does **not** include the full `content`. Sensitive fields such as submitter identifiers (`submittedBy`) and room identifiers (`roomId`) are stripped from API responses, but room comments (`roomComment`) are preserved and included in responses. Use `/api/content/<key>` to fetch the stored markdown or content for a link.

### RSS feed (GET)

```bash
curl "http://localhost:3000/api/feed"
```

- Returns an RSS 2.0 XML feed of the latest links, ordered by timestamp (newest first).
- The feed includes the link title, URL, domain, vote count, room comment, submitter attribution, tags, and an excerpt.
- Supports `mode` (`latest`, `top`) and `limit` query parameters, matching `/api/links` behavior.
- Defaults to the 50 most recent links (max 200).

### Get metadata by URL (GET)

You can query link metadata by providing the `url` query parameter (the service will normalize the URL before matching):

```bash
curl "http://localhost:3000/api/links?url=https%3A%2F%2Fexample.com%2Farticle"
```

- Returns the matching link record (JSON) or a `404` if not present.
