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
| `revenue` | number | `conversion` only (not for a cancel) | Must be finite and not negative. Stored as sent, and also converted into the account's revenue currency (`revenue_base`). |
| `currency` | string, 8 | no | Upper-cased on storage (`usd` becomes `USD`). Totals convert it with the ECB reference rate of the event's day; no currency means the account's currency. |
| `customer_id` | string, 200 | `identify` only | Your user id. |
| `metadata` | JSON | no | Stored as sent. |
| `client_timestamp` | string, 64 | no | Device clock. |
| `transaction_id` | string, 128 | no | Conversions: the store transaction. Stored once per `store` and `transaction_type`; a repeat is a duplicate. |
| `original_transaction_id` | string, 128 | no | Conversions: the subscription's first purchase. A renewal, refund or cancel inherits that purchase's `install_id` and link. |
| `product_id` | string, 200 | no | Conversions. |
| `store` | `app_store` or `play` | no | Conversions. |
| `purchase_type` | `one_time` or `subscription` | no | Conversions. |
| `quantity` | integer 1 to 10000 | no | Conversions. |
| `transaction_type` | `purchase`, `refund` or `cancel` | no | Conversions, default `purchase`. A refund subtracts its `revenue`; a cancel counts nothing and needs no `revenue`. |
| `client_event_id` | string, 8 to 64 of `A-Z a-z 0-9 - _` | no | Your id for the event, unique per account. A resend with an id the account already stored is a duplicate and changes nothing. The SDK sends a UUID it stamps when the event is queued. |
| `name`, `email`, `phone` | string 200, 254, 32 | no | Read on `identify` only. |

String values are trimmed and truncated to the stated length; empty strings become `null`.

### Batch rules

- Each event stands on its own. An invalid event is listed in `rejected` with its index in the batch and the error; the other events are stored.
- An event whose `client_event_id` the account already stored, or that repeats an id earlier in the same batch, counts in `duplicates` and is not stored again. This is what makes a resend after a lost response safe: a purchase is never counted twice.
- The response is `200 {"accepted": n, "duplicates": n, "rejected": [{"index": i, "error": "…"}]}`.
- When every event of the batch is invalid the answer is `400` with the same list: `{"error": {"code": "invalid_request", "message": "Every event in the batch is invalid", "rejected": [...]}}`.
- More than 100 events answer `413 {"error": {"code": "payload_too_large", "message": "events batch exceeds 100 items"}}`.

| Status | Body |
|---|---|
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid JSON body"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "events must be a non-empty array"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "Every event in the batch is invalid", "rejected": [...]}}` |
| 413 | `{"error": {"code": "payload_too_large", "message": "events batch exceeds 100 items"}}` |

The per-event errors in `rejected`:

| Error |
|---|
| `each event must be an object` |
| `event.type must be one of identify, lead, conversion, custom` |
| `identify events require customer_id` |
| `revenue must be a non-negative number` |
| `conversion events require revenue` |
| `metadata is not JSON-serializable` |
| `client_event_id must be 8 to 64 letters, digits, '-' or '_'` |
| `transaction_type must be one of purchase, refund, cancel` |
| `store must be one of app_store, play` |
| `purchase_type must be one of one_time, subscription` |
| `quantity must be a whole number from 1 to 10000` |

### What each type does

- **`identify`** upserts the customer row keyed by (`account`, `customer_id`). `name`, `email` and `phone` are stored **in plain text**. On a repeat `identify`, a non-null value in the new call overwrites the stored one and an omitted field keeps its stored value; `first_install_id` is set once, from the first `identify` that carried an `install_id`, and never replaced. The `identify` is also stored as an event row of type `identify`. See [Dashboard: Customers](/dashboard/customers/).
- **Automatic signup lead.** The first `identify` of a customer the account has not seen before, sent from a fresh install (the batch's `install_id`, else the device's latest install, created within the last 30 days and not a reinstall), also stores a `lead` event with `event_name: "signup"` and `metadata: {"auto": true, "source": "identify"}`. A `lead` with `event_name: "signup"` that you post for a customer who already has one is counted in `duplicates` and not stored.
- **`lead`**, **`conversion`**, **`custom`** are stored as sent. `conversion` requires `revenue` unless it is a `cancel`. A conversion whose `store` + `transaction_id` + `transaction_type` the account already has is a duplicate. Net revenue, the figure every dashboard total shows, adds purchases and subtracts refunds, in the account's revenue currency. See [Revenue](/sdk/revenue/).

Every stored event carries `matched_slug`, the slug of the link that brought the install, so per-link leads and revenue need no join at read time. It is resolved per event: through `install_id` when the batch names one (only if that install is matched; there is no fallback to the device for an organic `install_id`), else through the device's latest matched install. The request's raw IP is stored on the event row only when the deployment sets `STORE_RAW_IP=1`.

```bash title="Identify a user and record a purchase"
dectog POST /api/v1/events '{
  "device_id": "4b1d8c3e9f2a",
  "install_id": "3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f",
  "events": [
    { "type": "identify", "customer_id": "u_1042", "name": "Ada", "email": "ada@example.com", "client_event_id": "u_1042-identify-1" },
    { "type": "conversion", "event_name": "purchase", "revenue": 12.5, "currency": "usd", "customer_id": "u_1042", "client_event_id": "order-88231" }
  ]
}'
```

Response: `{"accepted": 2, "duplicates": 0, "rejected": []}`. Sending the same body again answers `{"accepted": 0, "duplicates": 2, "rejected": []}`.

## GET /api/v1/attribution

Returns the stored verdict for a device or an install, so an app can recover it after a restart or a failed first call. The body is the verdict from [Clicks and installs](/api/clicks-and-installs/) plus `last_open`.

| Query parameter | Meaning |
|---|---|
| `install_id` | The install to return. Wins when both parameters are given. |
| `device_id` | The device's latest **matched** install, else its latest install. Also keys the per-device rate limit. |

| Status | Body |
|---|---|
| 400 | `{"error": {"code": "invalid_request", "message": "device_id or install_id query parameter is required"}}` |
| 404 | `{"error": {"code": "not_found", "message": "No install found for this device"}}`: no install exists for that device or install id. |
| 200 | The verdict. An organic install answers 200 with `"matched": false`; 404 only means "no install at all". |

`last_open` is always present: `{"username", "slug", "click_id", "opened_at"}` for the latest app open reported for this device (the query's `device_id`, or the install's own) or for this install id, else `null`.

```bash title="Re-pull the verdict without a device id"
dectog GET '/api/v1/attribution?install_id=3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f'
```

## POST /api/v1/device-ping

One row per app start, feeding the daily-active and retention numbers.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `device_id` | string, 128 | yes | Missing answers `400 {"error": {"code": "invalid_request", "message": "device_id is required"}}`. |
| `app_version` | string, 64 | no | |
| `os` | string, 32 | no | |

Response: `200 {"ok": true}`. Ping rows are deleted by the retention job; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

## POST /api/v1/app-opens

Reports that a DecTog link opened the already-installed app (a warm open through an App Link, a Universal Link, a custom scheme or an intent bounce). Feeds the per-link Opens count and `last_open`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slug` | string, 128 | yes | One of your permanent or temporary slugs. Missing answers `400 {"error": {"code": "invalid_request", "message": "slug is required"}}`; unknown answers `404 {"error": {"code": "not_found", "message": "Link not found"}}`. |
| `click_id` | string, 64 | no | The `dtg_click` id from an intent bounce. Stored when it has the click-id shape (8 to 32 of `A-Z a-z 0-9 _ -`), otherwise dropped while the open is still recorded. It is not checked against the clicks table. |
| `device_id` | string, 128 | no | |
| `install_id` | string, 64 | no | |
| `app_version` | string, 64 | no | |
| `os` | string, 32 | no | |
| `username` | string | no | Ignored. The slug is always looked up in the caller's own account. |

The request's hashed IP is stored on the row. Response: `200 {"ok": true}`.
