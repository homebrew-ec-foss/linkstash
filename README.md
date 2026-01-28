# [linkstash.hsp-ec.xyz](https://linkstash.hsp-ec.xyz)

**linkstash** is a small experiment for collecting and sharing interesting links and short notes you find during the week. Here's a lightweight pipeline for forwarding, storing link content using Cloudflare Workers and KV.

> using [lava](https://github.com/polarhive/lava) and [ash](https://github.com/polarhive/ash).

## How it works

1. `ash` detects links posted to a WhatsApp group (bridged to Matrix) and forwards them to the Worker API.
2. `linkstash` calls `lava` and stores the markdown + rich frontmatter
3. The Worker homepage lists saved links and renders the parsed Markdown in a Hacker News–style feed.

## Quick start

```bash
wrangler dev
```

## Secrets

```bash
wrangler secret put AUTH_KEY
```