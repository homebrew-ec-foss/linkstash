# LinkStash API

This document describes the API endpoint that the ash application sends link data to.

### POST /api/add

Adds a new link to the collection.

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

#### Response

Returns a JSON array of link objects, or a single link object if `url` parameter is provided.

#### Example curl commands

```bash
# Get all links
curl "https://linkstash.hsp-ec.xyz/api/links"

# Get specific link by URL
curl "https://linkstash.hsp-ec.xyz/api/links?url=https://example.com"
```

### GET /api/summary

Retrieves a summary of links for a specific day.

#### Query Parameters

- `day` (optional): Date in `YYYY-MM-DD` format. If not provided, defaults to the most recent date that has links.

#### Response

Returns a JSON object with:
- `day`: The date used for the summary (string)
- `summary`: Array of links posted on that day (same format as `/api/links`)

#### Example curl commands

```bash
# Get summary for the latest day with links
curl "https://linkstash.hsp-ec.xyz/api/summary"

# Get summary for a specific day
curl "https://linkstash.hsp-ec.xyz/api/summary?day=2023-12-25"
```
