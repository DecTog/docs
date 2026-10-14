---
title: API overview
description: Base URLs, Bearer keys, request signing, rate limits, CORS, the error shape and conventions of the DecTog REST API, with a complete signed curl example.
sidebar:
  order: 1
---

The REST API under `/api/v1` is what the Flutter SDK talks to, and what you use from scripts and backends to manage links or read attribution. An account has two kinds of key: the account key for servers and scripts, and SDK keys for the apps you ship. This page covers what every route has in common; the routes themselves are on the following pages.

## Base URLs

| Deployment | API base | Link URLs |
|---|---|---|
| Hosted | `https://app.dectog.com` | `https://<username>.dectog.com/<slug>` |
| Self-hosted | your `PUBLIC_BASE_URL` | subdomain or path mode, per your configuration |

:::note[Self-hosted deployments]
Every example in this section uses the hosted base. A self-hosted deployment uses its own `PUBLIC_BASE_URL` (for example `http://localhost:8787` during development) and, in path mode, link URLs of the form `<PUBLIC_BASE_URL>/r/<username>/<slug>`. See [Configuration reference](/self-hosting/configuration-reference/).
:::

## Routes at a glance

| Route | Auth | Page |
|---|---|---|
| `POST`, `GET`, `PUT`, `DELETE /api/v1/links[/:slug]` | key + signature | [Links](/api/links/) |
| `POST`, `GET`, `PUT`, `DELETE /api/v1/temp-links[/:slug]` | key + signature | [Links](/api/links/) |
| `GET /api/v1/resolve/:username/:slug` | none | [Links](/api/links/) |
| `POST /api/v1/clicks` | key + signature | [Clicks and installs](/api/clicks-and-installs/) |
| `POST /api/v1/app-installs`, `POST /api/v1/app-installs/:id/claim` | key + signature | [Clicks and installs](/api/clicks-and-installs/) |
| `POST /api/v1/events`, `GET /api/v1/attribution`, `POST /api/v1/device-ping`, `POST /api/v1/app-opens` | key + signature | [Events and attribution](/api/events-and-attribution/) |
| `GET /api/v1/clicks`, `GET /api/v1/app-installs`, `GET /api/v1/app-opens`, `GET /api/v1/events` | account key + signature | [Export raw data](/api/export/) |
| `GET /api/v1/web-config`, `POST /api/v1/web-events` | site key, from an allowed origin | [Web pixel](/sdk/web/) |
| Webhooks (outbound) | HMAC signature | [Webhooks](/api/webhooks/) |
| `/api/admin/*`, `/api/auth/*` | session cookie | [Admin API](/api/admin-api/) |
| `/.well-known/*`, `/robots.txt`, `/sitemap.xml`, `/healthz`, `/readyz` | none | [Well-known files, SEO and routing](/api/well-known-seo-and-routing/) |

## Authentication

Every `/api/v1` route except `resolve` requires a key as a Bearer token:

```http
Authorization: Bearer dtg_pub_0123456789abcdef0123456789abcdef
```

There are two kinds of key, both shown in [Dashboard: Settings](/dashboard/settings/):

| Key | Looks like | Use it in | Scopes |
|---|---|---|---|
| **SDK key** | `dtg_pub_` and 32 hex characters | The apps you ship. Anyone can extract it from a build. | `sdk` (installs, claims, clicks, events, opens, the attribution pull), `temp_links`, `links:read`; plus `links:write` only for a key created with that option |
| **Site key** | `dtg_site_` and 32 hex characters | Your web pages, with [`dectog.js`](/sdk/web/). Public. | Only the two web routes, from the origins it lists |
| **Account key** | `dtg_` and 32 hex characters | Your servers and scripts. Never in an app. | Everything, including creating, changing and deleting links, and the only key that can [export raw rows](/api/export/) |

| Scope | Routes |
|---|---|
| `sdk` | `POST /api/v1/app-installs` and its claim, `POST /api/v1/clicks`, `POST /api/v1/events`, `GET /api/v1/attribution`, `POST /api/v1/device-ping`, `POST /api/v1/app-opens` |
| `temp_links` | every `/api/v1/temp-links` route |
| `links:read` | `GET /api/v1/links` and `GET /api/v1/links/:slug` |
| `links:write` | `POST`, `PUT` and `DELETE` on `/api/v1/links` |

- A new account gets its account key and one SDK key, "App key". Create more SDK keys (one per app or per build channel) and revoke them in Settings; an account holds up to 20 active SDK keys.
- The server stores only each key's SHA-256 and looks the account up by that hash. A missing or malformed key answers `401` with code `missing_api_key`, an unknown key `invalid_api_key`, a revoked SDK key `revoked_api_key`, before anything else is checked. A key without the route's scope answers `403` with code `insufficient_scope` and the `required_scope`.
- Revoking an SDK key stops every build that ships it at once; release a build with a new key first. Regenerating the account key affects only servers and scripts.
- Keep both keys out of source control where you can, and only ever send them to your DecTog base URL.

## Request signing

Every authenticated `/api/v1` request must also carry a signature that binds the API key, a timestamp and the exact request body. The Flutter SDK does this for you; any other client has to do it by hand.

| Header | Value |
|---|---|
| `x-dectog-timestamp` | The current Unix time in **whole seconds**, as a decimal string. Fractions or non-numeric values are rejected. |
| `x-dectog-signature` | `v1=` followed by the lowercase hex HMAC described below. The comparison is exact: uppercase hex, whitespace or a missing `v1=` prefix fail. |

What is signed:

```text
signature = HMAC-SHA256( key = the API key, message = "<timestamp>.<sha256hex(raw body)>" )
```

- The body is hashed exactly as the bytes you send. For `GET` and `HEAD` the body is always the empty string, whatever the request carries. For `DELETE` without a body it is also the empty string.
- The timestamp must be within 1,800 seconds (30 minutes) of the server clock, in either direction. The signature binds the timestamp to the body, so inside that window a captured request can only be repeated as it was, never altered. Creates answer 409 on a repeat and installs replay their stored verdict; clicks and events are recorded again, so do not retry those blindly.
- The checks run in this order and stop at the first failure: Bearer key, then signature, then the account rate limit, then the device or IP rate limit, then the route handler.

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `missing_api_key` | `Missing API key` | No Bearer key, or not in the `Bearer <key>` form. |
| 401 | `invalid_api_key` | `Invalid API key` | The key is not one the server knows. |
| 401 | `revoked_api_key` | `This API key was revoked` | An SDK key revoked in Settings. |
| 403 | `insufficient_scope` | `This key does not have the <scope> scope` | An SDK key used on a route outside its scopes; the error carries `required_scope`. |
| 401 | `signature_required` | `SDK request signature required (upgrade flutter_dectog)` | Either signature header is missing. |
| 401 | `stale_timestamp` | `SDK request timestamp is stale or invalid` | The timestamp is not an integer or is more than 1,800 s from server time. |
| 401 | `invalid_signature` | `Invalid SDK request signature` | The HMAC does not match (wrong key, wrong message, re-encoded body, uppercase hex). |

### Worked example

With the key `dtg_0123456789abcdef0123456789abcdef`, the timestamp `1760263200` and this exact body (no trailing newline):

```text
{"slug":"spring-sale","target":"https://shop.example.com/sale"}
```

| Step | Value |
|---|---|
| `sha256hex(body)` | `7468e8047a020694d8d57a0624e98ff1d867571f7b4c343053d9f4a99d193478` |
| message | `1760263200.7468e8047a020694d8d57a0624e98ff1d867571f7b4c343053d9f4a99d193478` |
| `x-dectog-signature` | `v1=a3d6b8723a69d7101b01d2842d9a9bb38ec752b011c4865015890433c9f449c7` |

For a `GET` with the same key and timestamp the body hash is the SHA-256 of the empty string, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and the header is `v1=6fbbe17e676c07b8f74aa49c22de054da6f0aa5997501f453399428508e6d328`. Use these values to check a port of the signing code.

### Signing with curl

The helper below computes the signature with `openssl` and works in bash and zsh. It is the `dectog` command used in the examples on the other API pages.

```bash title="A signed curl helper"
export DECTOG_API_KEY=dtg_0123456789abcdef0123456789abcdef
export DECTOG_API=https://app.dectog.com

# dectog <METHOD> <path> [JSON body]
dectog() {
  local method=$1 route=$2 body=${3:-}
  local ts body_hash sig
  local -a data=()
  ts=$(date +%s)
  body_hash=$(printf '%s' "$body" | openssl dgst -sha256 | sed 's/^.* //')
  sig=$(printf '%s' "$ts.$body_hash" | openssl dgst -sha256 -hmac "$DECTOG_API_KEY" | sed 's/^.* //')
  [ -n "$body" ] && data=(--data-binary "$body")
  curl -sS --fail-with-body -X "$method" "$DECTOG_API$route" \
    -H "Authorization: Bearer $DECTOG_API_KEY" \
    -H 'Content-Type: application/json' \
    -H "x-dectog-timestamp: $ts" \
    -H "x-dectog-signature: v1=$sig" \
    "${data[@]}"
}
```

```bash title="Create, list and delete a link"
dectog POST /api/v1/links '{"slug":"spring-sale","target":"https://shop.example.com/sale","metadata":{"screen":"sale"}}'
# {"id":"6f1c2a0e-…","slug":"spring-sale","target":"https://shop.example.com/sale","url":"https://acme.dectog.com/spring-sale",…}

dectog GET /api/v1/links | jq -r '.data[] | "\(.slug)\t\(.click_count)\t\(.url)"'

dectog DELETE /api/v1/links/spring-sale
# {"success":true}
```

`--data-binary` sends the body byte for byte, which is what the hash covers. `-d @file` would strip newlines and break the signature; so does any proxy or library that re-serializes JSON.

The same computation in Node:

```js
import { createHash, createHmac } from "node:crypto";

export function dectogHeaders(apiKey, rawBody = "") {
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const sig = createHmac("sha256", apiKey).update(`${ts}.${bodyHash}`).digest("hex");
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "x-dectog-timestamp": ts,
    "x-dectog-signature": `v1=${sig}`,
  };
}
```

## OpenAPI

`GET /openapi.json` serves an OpenAPI 3.1 description of every route, generated from the same table the server's tests check against the routes it answers. Routes marked `x-internal` serve the dashboard and may change without notice. Point a client generator or an agent at it: `https://app.dectog.com/openapi.json` on the hosted service.

## MCP

`POST /mcp` is a Model Context Protocol server for AI agents, authenticated with the same Bearer keys and without request signing. It is described in [Automation and agents](/guides/automation-and-agents/#mcp-server), not in the OpenAPI document.

## SDK identity

SDKs also send `x-dectog-sdk: <name>/<version>`, for example `flutter_dectog/1.0.0`. The server stores it as `sdk_name` and `sdk_version` on the install, on each event and on in-app clicks, and the Overview lists the versions in use. Without the header it reads the `DectogSDK/<version>` token of the User-Agent. Scripts and servers need not send either.

A self-hosted deployment can set `MIN_SDK_VERSION` (for example `1.1.0`) to retire old builds: an identified SDK older than that answers `400` with code `sdk_too_old` and the `min_version`. Callers that do not identify as an SDK are not checked.

## Rate limits

Every authenticated `/api/v1` response reports the account limit in `x-ratelimit-limit` (3000). They describe the account counter only; the device and IP counters below can refuse a request first.

The hosted service, and a self-hosted deployment set up with `npm run setup`, count the account, device, IP and beacon limits with Cloudflare's Rate Limiting bindings: one-minute windows kept per Cloudflare location, so the limits are approximate, and the response carries only `x-ratelimit-limit`. A deployment without those bindings in its Wrangler config (local development, an older config) counts them in D1 instead: fixed windows aligned to the wall clock (the current minute, `floor(now / 60 s)`), reset by the first request of a new minute, where a rejected request still counts; there the response also carries `x-ratelimit-remaining` and `x-ratelimit-reset` (seconds until the window ends). Several counters apply to one request.

| Limit | Window | Counter key | Applies to |
|---|---|---|---|
| 3,000 requests | 60 s | the account id | every authenticated `/api/v1` request |
| 60 requests | 60 s | `dev:<account id>:<device_id>` (first 128 characters) | requests that name a device: `device_id` in the JSON body, or `?device_id=` on `GET` and `HEAD` |
| 600 requests | 60 s | `ip:<account id>:<hashed IP>` | authenticated requests that name no device, so every link and temp-link call and any install or event call sent without `device_id` |
| 120 requests | 60 s | `webcollect:<hashed IP>` | `POST /_/collect`, the interstitial beacon |
| 5 requests | 1 hour | `contact:<hashed IP>` | `POST /api/contact` (its 429 carries no `Retry-After`) |

The hashed IP is `sha256(IP_SALT + ":" + ip)` with IPv6 addresses cut to their /64 prefix, so a whole IPv6 network shares one counter.

Over a limit, `/api/v1` answers `429` with code `rate_limited` and a `Retry-After` header holding the number of seconds until the current minute ends (1 to 60). Wait at least that long before retrying. The IP counter is per account and IP, so one account's traffic never consumes another account's allowance.

:::note[Fail-open and fail-closed]
If the rate-limit counter cannot be written (a database or binding failure), the account, device and IP limiters **let the request through** and log the failure: the limiter never takes the API down with it. The beacon limiter does the opposite and answers 429 when its D1 counter write fails.
:::

`GET /api/v1/resolve/:username/:slug` is not rate limited.

## CORS

| Prefix | `access-control-allow-origin` | Other headers |
|---|---|---|
| `/api/v1/*` (including `resolve`) | `*` | `access-control-allow-headers: authorization, content-type, x-dectog-timestamp, x-dectog-signature, x-dectog-sdk, x-request-id`; `access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS`; `access-control-expose-headers: x-request-id` |
| `/api/admin/*` | `WEB_URL` (`https://app.dectog.com`) | `access-control-allow-credentials: true`; `vary: Origin`; `access-control-allow-headers: authorization, content-type, x-request-id`; same methods; `access-control-expose-headers: x-request-id` |

`OPTIONS` on any `/api/*` path answers `204`. The v1 API never uses cookies, so browser clients only need the headers above.

## Errors

Every error, on every route, is one JSON shape:

```json
{
  "error": {
    "code": "conflict",
    "message": "Slug already exists",
    "request_id": "8d2f4c1b9a7e6f30-AMS",
    "slug": "spring-sale"
  }
}
```

- `code` is a stable, machine-readable reason. Branch on it, not on `message`.
- `message` is for people and may be reworded. It names the field that failed validation.
- `request_id` identifies the request. The same value is in the `x-request-id` response header, which every response carries, errors or not. Quote it when you report a problem: it finds the request in the server's logs. Send your own `x-request-id` (8 to 128 characters from `A-Z a-z 0-9 . _ : -`) and the server uses it instead of generating one.
- Some errors carry extra keys next to `message`, such as `slug` on a 409.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Validation failed, or the body is not valid JSON (`Invalid JSON body`). The message names the field. |
| 400 | `sdk_too_old` | The calling SDK build is older than the deployment's `MIN_SDK_VERSION`; the error carries `min_version`. |
| 401 | `missing_api_key`, `invalid_api_key`, `signature_required`, `stale_timestamp`, `invalid_signature` | Authentication or signature failed; see above. |
| 401 | `not_authenticated`, `invalid_session` | Admin API only: no session cookie, or a bad or expired one. |
| 403 | `forbidden` | Admin API only: the route needs the owner role, or bootstrap is not permitted. |
| 404 | `not_found` | The resource is not in your account (`Link not found`, `Temporary link not found`, `Install not found`, `No install found for this device`), or no route matches. |
| 409 | `conflict` | The slug is taken (`Slug already exists`, with the `slug`), or the instance is already bootstrapped. |
| 413 | `payload_too_large` | An events batch has more than 100 items. |
| 429 | `rate_limited` | Rate limited; see above. |
| 500 | `internal_error` | A server fault. The response never carries a stack trace; the `request_id` finds it in the logs. |

The route pages quote errors as `{"error": {"code", "message"}}` and leave out `request_id`, which every error carries. Messages are quoted exactly as the server sends them.

## Conventions

- Request and response bodies are JSON. Send `Content-Type: application/json`. Responses are `application/json; charset=utf-8`.
- Creates (`POST /api/v1/links`, `POST /api/v1/temp-links`) answer `201`. Everything else that succeeds answers `200`, including `DELETE`, which returns `{"success": true}` rather than `204`.
- Timestamps are ISO 8601 in UTC with milliseconds, `2026-10-12T09:00:00.000Z`. Epoch fields in install payloads are milliseconds.
- Ids are UUIDs, except click ids, which are 16 hexadecimal characters.
- Nullable fields are always present in responses and come back as `null`, never omitted. Fields that exist only in some situations (for example the attribution fields of a matched install) are omitted when they do not apply; the route pages say which.
- List routes return complete arrays. There is no pagination or filtering on `/api/v1`.
- Routes do not use trailing slashes.

## Health check

`GET /healthz` needs no authentication, is not rate limited, and answers on every host:

```json
{ "ok": true, "service": "dectog", "version": "v1", "host": "app.dectog.com" }
```

`host` echoes the request's Host header. Use it for uptime checks instead of a link URL. A tap check on a real link should send `x-dectog-no-track: 1` so it is not counted.

`GET /readyz` is the readiness check. It runs `SELECT 1` against D1 and compares wrangler's `d1_migrations` table with the migrations bundled into this build:

```json
{ "ok": true, "database": true, "migrations": { "expected": 30, "applied": 30, "missing": [] } }
```

It answers `503` with `ok: false` when D1 does not answer or a migration is missing, and lists the missing file names. It sends `cache-control: no-store`. Use it in deploy smoke tests: `/healthz` passes even with a broken database binding.
