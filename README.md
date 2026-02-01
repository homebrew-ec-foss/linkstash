# [linkstash.hsp-ec.xyz](https://linkstash.hsp-ec.xyz)

**linkstash** is a small experiment for collecting and sharing interesting links and short notes you find during the week.

> Usses [lava](https://github.com/polarhive/lava) and [ash](https://github.com/polarhive/ash).

## How it works

1. `ash` detects links posted to a WhatsApp group (bridged to Matrix) and forwards them to the Vercel API.
2. `linkstash` calls `lava` and stores the markdown + rich frontmatter in Turso
3. The Vercel app lists saved links and renders the parsed Markdown in a Hacker News–style feed.

## Quick start

```bash
bun install
cp .env.example .env
bunx vercel dev
```

## Environment Variables

- `AUTH_KEY`: Your authentication key
- `TURSO_DATABASE_URL`: Your Turso database URL
- `TURSO_AUTH_TOKEN`: Your Turso auth token


## API Endpoints

- `POST /api/add` - Add a new link
- `GET /api/links` - Get all links
- `GET /api/health` - Health check
- `GET /api/content/[key]` - Get content by key

## Admin

- `/admin` — simple admin UI to delete links (protected by `AUTH_KEY`). This page lets you enter your `AUTH_KEY` and delete individual links. Deletions call the server (`DELETE /api/admin/link`) and are gated by the same `AUTH_KEY` used for adding links.

## API examples

Below are quick curl examples for local development (assumes `bunx vercel dev` on `http://localhost:3000`) and that `AUTH_KEY` is set in your environment.

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

### Get metadata by URL (GET)

You can query link metadata by providing the `url` query parameter (the service will normalize the URL before matching):

```bash
curl "http://localhost:3000/api/links?url=https%3A%2F%2Fexample.com%2Farticle"
```

- Returns the matching link record (JSON) or a `404` if not present.
