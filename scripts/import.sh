#!/usr/bin/env bash

set -euo pipefail

API_URL="http://localhost:3000/api/add"
AUTH_TOKEN=${AUTH_KEY:-"auth-keyword"}
SUBMITTED_BY="migrate-kv"

# Ensure jq is installed
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed."
  exit 1
fi

jq -r '.[].url' links.json | while read -r url; do
  echo "Sending: $url"

  curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg url "$url" \
      --arg submittedBy "$SUBMITTED_BY" \
      '{link: {url: $url, submittedBy: $submittedBy}}')"

  echo
done
