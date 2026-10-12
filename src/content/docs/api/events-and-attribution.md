---
title: Events and attribution
description: Batched post-install events, the attribution pull, device pings and app-open reports.
sidebar:
  order: 4
---

Four routes carry what happens after the install. The Flutter SDK calls them for you (see [Events](/sdk/events/)); this page is the wire contract. All four need the Bearer key and request signature from [API overview](/api/overview/) and are scoped to your account.

## POST /api/v1/events

Stores a batch of events and, through `identify`, your own customer identities.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `device_id` | string, 128 | no | The device the batch comes from. Keys the per-device rate limit. |
| `install_id` | string, 64 | no | The `install_id` from the install verdict. |
| `events` | array | yes | 1 to 100 event objects. |

Each event:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `type` | string | yes | `identify`, `lead`, `conversion` or `custom`. |
| `event_name` | string, 200 | no | Free text, for example `purchase` or `signup`. |
| `revenue` | number | `conversion` only | Must be finite and not negative. Stored as sent. |
| `currency` | string, 8 | no | Upper-cased on storage (`usd` becomes `USD`). The server never converts currencies. |
| `customer_id` | string, 200 | `identify` only | Your user id. |
| `metadata` | JSON | no | Stored as sent. |
| `client_timestamp` | string, 64 | no | Device clock. |
| `name`, `email`, `phone` | string 200, 254, 32 | no | Read on `identify` only. |

String values are trimmed and truncated to the stated length; empty strings become `null`.

### Batch rules

- The whole batch is validated before anything is written. One invalid event rejects all of them with a 400 and nothing is stored.
- More than 100 events answer `413 {"error": "events batch exceeds 100 items"}`.
- The response is `200 {"accepted": n}`.

| Status | Body |
|---|---|
| 400 | `{"error": "Invalid JSON body"}` |
| 400 | `{"error": "events must be a non-empty array"}` |
| 413 | `{"error": "events batch exceeds 100 items"}` |
| 400 | `{"error": "each event must be an object"}` |
| 400 | `{"error": "event.type must be one of identify, lead, conversion, custom"}` |
| 400 | `{"error": "identify events require customer_id"}` |
| 400 | `{"error": "revenue must be a non-negative number"}` |
| 400 | `{"error": "conversion events require revenue"}` |
| 400 | `{"error": "metadata is not JSON-serializable"}` |

### What each type does

- **`identify`** upserts the customer row keyed by (`account`, `customer_id`). `name`, `email` and `phone` are stored **in plain text**. On a repeat `identify`, a non-null value in the new call overwrites the stored one and an omitted field keeps its stored value; `first_install_id` is set once, from the first `identify` that carried an `install_id`, and never replaced. The `identify` is also stored as an event row of type `identify`. See [Dashboard: Customers](/dashboard/customers/).
- **Automatic signup lead.** The first `identify` of a customer the account has not seen before, sent from a fresh install (the batch's `install_id`, else the device's latest install, created within the last 30 days and not a reinstall), also stores a `lead` event with `event_name: "signup"` and `metadata: {"auto": true, "source": "identify"}`. A `lead` with `event_name: "signup"` that you post for a customer who already has one is counted in `accepted` but not stored.
- **`lead`**, **`conversion`**, **`custom`** are stored as sent. `conversion` requires `revenue`.

Every stored event carries `matched_slug`, the slug of the link that brought the install, so per-link leads and revenue need no join at read time. It is resolved per event: through `install_id` when the batch names one (only if that install is matched; there is no fallback to the device for an organic `install_id`), else through the device's latest matched install. The request's raw IP is stored on the event row as well.

```bash title="Identify a user and record a purchase"
dectog POST /api/v1/events '{
  "device_id": "4b1d8c3e9f2a",
  "install_id": "3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f",
  "events": [
    { "type": "identify", "customer_id": "u_1042", "name": "Ada", "email": "ada@example.com" },
    { "type": "conversion", "event_name": "purchase", "revenue": 12.5, "currency": "usd", "customer_id": "u_1042" }
  ]
}'
```

Response: `{"accepted": 2}`.

## GET /api/v1/attribution

Returns the stored verdict for a device or an install, so an app can recover it after a restart or a failed first call. The body is the verdict from [Clicks and installs](/api/clicks-and-installs/) plus `last_open`.

| Query parameter | Meaning |
|---|---|
| `install_id` | The install to return. Wins when both parameters are given. |
| `device_id` | The device's latest **matched** install, else its latest install. Also keys the per-device rate limit. |

| Status | Body |
|---|---|
| 400 | `{"error": "device_id or install_id query parameter is required"}` |
| 404 | `{"error": "No install found for this device"}`: no install exists for that device or install id. |
| 200 | The verdict. An organic install answers 200 with `"matched": false`; 404 only means "no install at all". |

`last_open` is always present: `{"username", "slug", "click_id", "opened_at"}` for the latest app open reported for this device (the query's `device_id`, or the install's own) or for this install id, else `null`.

```bash title="Re-pull the verdict without a device id"
dectog GET '/api/v1/attribution?install_id=3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f'
```

## POST /api/v1/device-ping

One row per app start, feeding the daily-active and retention numbers.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `device_id` | string, 128 | yes | Missing answers `400 {"error": "device_id is required"}`. |
| `app_version` | string, 64 | no | |
| `os` | string, 32 | no | |

Response: `200 {"ok": true}`. Ping rows are deleted by the retention job; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

## POST /api/v1/app-opens

Reports that a DecTog link opened the already-installed app (a warm open through an App Link, a Universal Link, a custom scheme or an intent bounce). Feeds the per-link Opens count and `last_open`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slug` | string, 128 | yes | One of your permanent or temporary slugs. Missing answers `400 {"error": "slug is required"}`; unknown answers `404 {"error": "Link not found"}`. |
| `click_id` | string, 64 | no | The `dtg_click` id from an intent bounce. Stored as sent; it is not checked against the clicks table. |
| `device_id` | string, 128 | no | |
| `install_id` | string, 64 | no | |
| `app_version` | string, 64 | no | |
| `os` | string, 32 | no | |
| `username` | string | no | Ignored. The slug is always looked up in the caller's own account. |

The request's hashed IP is stored on the row. Response: `200 {"ok": true}`.
