---
title: Automation and agents
description: Script the DecTog API with your API key (signed requests, bulk links, exports, temporary links in CI, QR codes) and point AI agents at SKILL.md and llms.txt.
sidebar:
  order: 3
---

Everything the Flutter SDK does with links, a script can do too. This page shows working shell examples against the hosted API at `https://app.dectog.com` and lists the files that AI agents read.

## What you need

- Your API key from Settings. It starts with `dtg_` and is followed by 32 hex characters. One key serves every app and every link of the account. Regenerating it invalidates the old key immediately. See [Settings](/dashboard/settings/).
- Every `/api/v1` call except `GET /api/v1/resolve/{username}/{slug}` needs `Authorization: Bearer <key>` and a request signature.
- `curl` 7.76 or newer (for `--fail-with-body`), `openssl` and `jq`.

Keep the key in an environment variable such as `DECTOG_API_KEY`. Send it only to `https://app.dectog.com` or your own deployment.

:::note[Self-hosting]
Set `DECTOG_API` to your `PUBLIC_BASE_URL`. In path mode links look like `<PUBLIC_BASE_URL>/r/{username}/{slug}`. `SKILL.md` and `llms.txt` are served from your `WEB_URL`.
:::

## Signing requests

The signature scheme is the one the SDK uses:

- `x-dectog-timestamp`: whole Unix seconds, within 1800 seconds of the server clock.
- `x-dectog-signature`: `v1=<hex>` where `hex = HMAC-SHA256(key = your API key, message = "<timestamp>.<sha256hex(raw body)>")`.
- `GET` and `HEAD` sign the empty string. For other methods the body you send must be byte-for-byte the string you hashed.

This helper does it in bash. It was checked against the server's verification code.

```bash title="dectog.sh"
# Usage: source dectog.sh; dectog_call METHOD PATH [JSON_BODY]
# Prints the response body. Exits non-zero on HTTP 4xx/5xx (the body is still printed).
: "${DECTOG_API_KEY:?set DECTOG_API_KEY to your dtg_ key}"
DECTOG_API="${DECTOG_API:-https://app.dectog.com}"

dectog_call() {
  local method=$1 path=$2 body=${3:-}
  local ts body_hash sig
  ts=$(date +%s)
  body_hash=$(printf '%s' "$body" | openssl dgst -sha256 | sed 's/^.* //')
  sig=$(printf '%s' "$ts.$body_hash" | openssl dgst -sha256 -hmac "$DECTOG_API_KEY" | sed 's/^.* //')
  curl -sS --fail-with-body -X "$method" "$DECTOG_API$path" \
    -H "Authorization: Bearer $DECTOG_API_KEY" \
    -H "x-dectog-timestamp: $ts" \
    -H "x-dectog-signature: v1=$sig" \
    -H 'Content-Type: application/json' \
    ${body:+--data-binary "$body"}
}
```

A failed key or signature check returns 401 with one of these `error.code` values:

| `code` | Cause |
|---|---|
| `missing_api_key` | No Bearer key |
| `invalid_api_key` | Unknown Bearer key |
| `signature_required` | One of the two headers is missing |
| `stale_timestamp` | The timestamp is not an integer or is more than 1800 seconds off |
| `invalid_signature` | The HMAC does not match the body that arrived |

Every error body is `{"error": {"code", "message", "request_id"}}`; branch on `code`, and quote `request_id` (also in the `x-request-id` header) when asking for help.

The full scheme and the rate limits are on [API overview](/api/overview/).

## Create, read, update, delete

```bash
source ./dectog.sh

# Create a permanent link. 201 with every field of the link.
dectog_call POST /api/v1/links \
  '{"slug":"spring-sale","target":"https://shop.example.com/sale","metadata":{"screen":"sale"}}'

# Read one link, or the whole list (newest first).
dectog_call GET /api/v1/links/spring-sale | jq .url
dectog_call GET /api/v1/links | jq length

# Update. An absent key keeps its value; "" or null clears it.
dectog_call PUT /api/v1/links/spring-sale \
  '{"ios_deep_link_path":"sale/2","android_deep_link_path":"sale/2","campaign":"spring"}'

# Delete. 200 {"success":true}; the link's clicks, attributed installs, events and opens go with it.
dectog_call DELETE /api/v1/links/spring-sale
```

What to expect:

- A taken slug returns 409 `{"error":{"code":"conflict","message":"Slug already exists","slug":"spring-sale"}}`. Slugs are shared between permanent and temporary links.
- `DELETE` on an unknown slug returns 404 `{"error":{"code":"not_found","message":"Link not found"}}`.
- `metadata` comes back to the app as `custom_params` on attributed installs.
- Leave `target` out for app-only links; they inherit the app's `fallback_url`.

Field rules are on [Links API](/api/links/).

## Bulk links from a CSV

```bash title="bulk-links.sh"
#!/usr/bin/env bash
# links.csv: slug,target,screen (no header)
set -uo pipefail
source "$(dirname "$0")/dectog.sh"

while IFS=, read -r slug target screen; do
  body=$(jq -nc --arg s "$slug" --arg t "$target" --arg sc "$screen" \
    '{slug:$s, target:$t, metadata:{screen:$sc, campaign:"spring"}}')
  for attempt in 1 2 3; do
    if out=$(dectog_call POST /api/v1/links "$body" 2>/dev/null); then
      echo "created  $slug -> $(jq -r .url <<<"$out")"; break
    fi
    case "$(jq -r .error.code <<<"$out" 2>/dev/null)" in
      conflict)     echo "exists   $slug (PUT /api/v1/links/$slug to change it)"; break;;
      rate_limited) echo "rate limited, waiting for the next window"; sleep 60;;
      *)            echo "error    $slug: $out" >&2; exit 1;;
    esac
  done
done < links.csv
```

The limiter uses fixed one-minute windows, so a 60-second sleep always lands in the next window. `Retry-After` on the 429 response carries the exact number of seconds.

## Export links and click counts

`click_count` is the lifetime total for the link, the same number the Links page shows.

```bash
echo 'slug,clicks,url,target,created' > links.csv
cursor=""
while :; do
  page=$(dectog_call GET "/api/v1/links?limit=200${cursor:+&cursor=$cursor}")
  jq -r '.data[] | [.slug, .click_count, .url, .target, .created_at] | @csv' <<<"$page" >> links.csv
  cursor=$(jq -r '.next_cursor // empty' <<<"$page")
  [ -n "$cursor" ] || break
done
```

There is no list endpoint for temporary links on `/api/v1`; read them one at a time with `GET /api/v1/temp-links/{slug}`. Installs, opens, leads and revenue per link are on the dashboard only. The dashboard's own API uses a cookie session and is not meant for scripts; see [Admin API](/api/admin-api/).

## A temporary link for every CI build

Temporary links expire on their own and are purged a day after expiry, so a pipeline needs no cleanup. `ttlSeconds` is clamped to 60 seconds to 30 days; 0 becomes 900.

```yaml title=".github/workflows/build.yml (excerpt)"
- name: Publish a link to this build
  env:
    DECTOG_API_KEY: ${{ secrets.DECTOG_API_KEY }}
  run: |
    source ./scripts/dectog.sh
    url=$(dectog_call POST /api/v1/temp-links \
      "$(jq -nc --arg t "$ARTIFACT_URL" '{target:$t, ttlSeconds:86400}')" | jq -r .url)
    echo "Build ${GITHUB_SHA::7}: $url" >> "$GITHUB_STEP_SUMMARY"
```

Temporary links use the default app's routing and fallback, have no click counter and no deep-link paths. After expiry the link serves a 410 page while `resolve` still answers 200 with `is_expired: true`, until the daily purge. See [Temporary links](/links/temporary-links/).

## QR codes

DecTog draws a QR code on the branded page that desktop visitors see when neither the link nor its app has a fallback URL. The code encodes the canonical link URL without any query string. Opening that page from a script records a click unless the user agent matches the bot list, so do not use it to generate images.

For files, encode the link's `url` with any QR library; the server does nothing more than that:

```bash
url=$(dectog_call GET /api/v1/links/spring-sale | jq -r .url)
qrencode -o spring-sale.png "$url"
```

Append `utm_*` or `dec_*` parameters to the encoded URL if you want them on the scan. See [Social previews and QR](/links/social-previews-and-qr/).

## Public resolve

Anyone can read what a link points at. No key, no signature, no rate limit:

```bash
curl -sS https://app.dectog.com/api/v1/resolve/acme/spring-sale | jq
```

Every key is always present. Temporary links return `click_count`, `metadata` and the deep-link paths as `null`; permanent links return `expires_at` and `ttl_seconds` as `null`.

## Rate limits for scripts

| Limit | Scope | Notes |
|---|---|---|
| 3000 per minute | The account | Shared with every app build that uses the key |
| 600 per minute | The account plus your IP | Applies to every call without a `device_id`, so every link call from a script |
| 60 per minute | A `device_id` | SDK calls only |

A 429 returns `{"error":{"code":"rate_limited","message":"Rate limit exceeded"}}` with `Retry-After` set to the seconds left in the current minute window, at least 1. If the limiter's database is unavailable the request goes through. See [API overview](/api/overview/).

## Resources for AI agents

| File | What it is |
|---|---|
| `https://dectog.com/SKILL.md` | The agent guide: concepts, API, SDK, webhook and self-hosting in one file, with a `version` in its frontmatter. Also served at `https://app.dectog.com/SKILL.md`. |
| `https://dectog.com/llms.txt` | A short index of agent-readable references. Also at `https://app.dectog.com/llms.txt`. |
| `https://docs.dectog.com/llms.txt` | An index of every page on this site with its description, generated at build time |
| `https://docs.dectog.com/llms-full.txt` | Every page of this site in one Markdown file |

Agents that keep a local copy can fetch them directly:

```bash
mkdir -p ~/.dectog/skills
curl -sS https://dectog.com/SKILL.md > ~/.dectog/skills/SKILL.md
curl -sS https://docs.dectog.com/llms-full.txt > ~/.dectog/skills/docs.md
```

### The "Set up with your agent" button

The Overview page of the dashboard has a "Set up with your agent" button. It copies this prompt to the clipboard:

```text
Read https://dectog.com/SKILL.md and help me get started with DecTog
```

The label changes to "Prompt copied — paste it into your agent" for two seconds. If the browser blocks clipboard access, a `window.prompt` dialog titled "Copy this prompt into your agent:" shows the text instead. The button's tooltip shows the prompt as well. Paste it into Claude Code, Cursor or any other coding agent.

### "Copy for AI" on the Apps page

The Universal Links file and App Links file tooltips on the Apps page have a "⧉ Copy for AI" button. Each copies a setup prompt already filled with your link domain, your username, the app's bundle ID and Team ID (iOS) or package and SHA-256 fingerprints (Android), the URL of the served well-known file, and the exact steps: the Associated Domains entry, the `autoVerify` intent filter without wildcards, and the reinstall that both platforms need. The iOS prompt also states that a 302 to a custom scheme can never open an iOS app. See [Apps](/dashboard/apps/).

One correction to make before you paste the iOS prompt: it suggests the wildcard entry `applinks:*.dectog.com`. Use the explicit host `applinks:{username}.dectog.com` instead. For a wildcard entry iOS fetches the AASA from the parent domain, and `https://dectog.com/.well-known/apple-app-site-association` answers 400. See [Troubleshooting](/guides/troubleshooting/).

## Rules worth giving an agent

- Ask for the username first. It is the link subdomain and appears in every entitlement, manifest and URL.
- List before you guess: `GET /api/v1/links`. Slugs are case-sensitive and shared with temporary links.
- Treat 409 as "pick another slug or update the existing link". Do not retry the same slug.
- Create returns 201 and delete returns 200 with a body. Scripts that expect 204 misreport.
- Ask before deleting a link or regenerating the key. Both break things already in the wild: shared URLs and shipped app builds.
- Use `/api/v1` with the key. The dashboard's `/api/admin` routes need a browser session.
