# LinkStash API

This document describes the API endpoint that the ash application sends link data to.

### POST /api/add

Adds a new link to the collection.

Voting behavior:
- If the URL is new, the link is created with `count = 1`.
- If the URL already exists, it is treated as a vote attempt.
- Repeated vote attempts from the same submitter/room fingerprint within the cooldown window are ignored to prevent accidental or spammy rapid upvotes.
- Cooldown is configurable with `VOTE_COOLDOWN_MS` (defaults to 6 hours).

#### Headers

- `Authorization: Bearer <token>` - Required authentication token
- `Content-Type: application/json` - Content type

#### Request Body

```json
{
  "link": {
    "url": "https://example.com",
    "submittedBy": "@user:matrix.org"
  },
  "room": {
    "id": "!roomid:matrix.org",
    "comment": "room name"
  }
}
```

#### Fields

- `link.url` (string, required): The URL of the link
- `link.submittedBy` (string, optional): Matrix user ID of the person who submitted the link (accepted on POST but not exposed in public GET responses)
- `room.id` (string, optional): Matrix room ID (accepted on POST but not exposed in public GET responses)
- `room.comment` (string, optional): Room comment/name (accepted on POST and included in public GET responses as `roomComment`)

#### Example curl command

```bash
curl -X POST "https://linkstash.hsp-ec.xyz/api/add" \
  -H "Authorization: Bearer mentor-here" \
  -H "Content-Type: application/json" \
  -d '{
    "link": {
      "url": "https://example.com",
      "submittedBy": "@user:matrix.org"
    },
    "room": {
      "id": "!roomid:matrix.org",
      "comment": "room name"
    }
  }'
```

#### Configuration

The ash application sends this data based on configuration flags in `config.json`:

- `sendUser`: Include the `submittedBy` field
- `sendTopic`: Include the `room` object

Both flags are optional and can be set per room.

### GET /api/links

Retrieves all links in the collection, ordered by timestamp (newest first).

#### Query Parameters

- `url` (optional): Filter by specific URL to get a single link
- `mode` (optional): Ranking mode for list responses. Values: `latest` (default), `top`, `rising`

#### Response

Returns a JSON array of link objects, or a single link object if `url` parameter is provided.

Ranking modes:
- `latest`: newest first, tie-broken by vote count
- `top`: highest vote count first, tie-broken by recency
- `rising`: boosts links with growing votes while applying time decay to surface fresher suggestions

#### Example curl commands

```bash
# Get all links
curl "https://linkstash.hsp-ec.xyz/api/links"

# Get specific link by URL
curl "https://linkstash.hsp-ec.xyz/api/links?url=https://example.com"
```

### GET /api/summary

Retrieves a summary of links for a date range.

#### Query Parameters

- `from` (optional): Start date in `YYYY-MM-DD` format
- `to` (optional): End date in `YYYY-MM-DD` format
- `room` (optional): Room name/comment filter (case-insensitive)

Notes:
- If `from`/`to` are omitted, the API defaults to the latest 7-day window with links.
- `day` is still accepted for backwards compatibility and is treated as `from=day&to=day`.

#### Response

Returns a JSON object with:
- `from`: Start day used for the summary (string or null)
- `to`: End day used for the summary (string or null)
- `room`: Active room filter or `null`
- `rooms`: Array of available room buckets for the selected date range, with counts
- `total`: Number of links in `summary`
- `summary`: Array of links posted in that range (same format as `/api/links`)

#### Example curl commands

```bash
# Get summary for the default latest 7-day range
curl "https://linkstash.hsp-ec.xyz/api/summary"

# Get summary for a specific date range
curl "https://linkstash.hsp-ec.xyz/api/summary?from=2023-12-20&to=2023-12-25"

# Get summary for a range filtered to one room
curl "https://linkstash.hsp-ec.xyz/api/summary?from=2023-12-20&to=2023-12-25&room=room%20name"
```
