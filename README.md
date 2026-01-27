# linkstash 🔗

**linkstash** is a small homepage for stashing and sharing links using [lava](https://github.com/polarhive/lava) and [ash](https://github.com/polarhive/ash).

---

Flow:
1. `ash` detects a link in the WhatsApp Group Chat <-bridged-> [matrix] and forwards it to `linkstash` (via the Worker API).
2. `linkstash` stores the raw URL in KV and, optionally, asks `lava` to fetch and parse the page to generate Markdown and metadata (title, description).
3. The homepage (served by the Worker) lists saved links and their parsed summaries.

Example commands:
- To run locally:

```bash
wrangler dev
```

- To add a secret for auth:

```bash
wrangler secret put AUTH_KEY
```

---