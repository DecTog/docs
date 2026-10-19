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
| `type` | string | yes | `identify`, `lead`, `conversion`, `custom` or `screen_view`. |
| `event_name` | string, 200 | `screen_view` only | Free text, for example `purchase` or `signup`; for a `screen_view`, the screen. |
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
| `open_slug` | string, 128 | no | The link that last opened the app before this event. With it, `open_at` is required. Not stored when it names no link of the account, or a link deleted, paused or expired before `open_at`: an open `/app-opens` refused takes no credit. |
| `open_click_id` | string, 8 to 32 of `A-Z a-z 0-9 - _` | no | That open's click id. Anything else is dropped; the event is still stored. |
| `open_at` | ISO 8601 date | with `open_slug` | When that link opened the app. A time after the request is stored as the request time. |
| `session_id` | string, 64 | no | The app process the event came from (the SDK sends a new id per process). A `screen_view` is stored only with one. |
| `app_store_jws` | string, 16384 | no | Conversions: a StoreKit 2 transaction (`jwsRepresentation`). Verified against Apple Root CA - G3; its `transactionId`, `originalTransactionId`, `productId`, price and currency replace the event's, `store` becomes `app_store`, and the row is stored with `source: "store"`. Its bundle ID must be one of the account's apps. With it, `revenue` is optional. |
| `client_event_id` | string, 8 to 64 of `A-Z a-z 0-9 - _` | no | Your id for the event, unique per account. A resend with an id the account already stored is a duplicate and changes nothing. The SDK sends a UUID it stamps when the event is queued. |
| `name`, `email`, `phone` | string 200, 254, 32 | no | Read on `identify` only. |

String values are trimmed and truncated to the stated length; empty strings become `null`.

### Batch rules

- Each event stands on its own. An invalid event is listed in `rejected` with its index in the batch and the error; the other events are stored.
- An event whose `client_event_id` the account already stored, or that repeats an id earlier in the same batch, counts in `duplicates` and is not stored again. This is what makes a resend after a lost response safe: a purchase is never counted twice.
- The response is `200 {"accepted": n, "duplicates": n, "rejected": [{"index": i, "error": "…"}]}`. `accepted` counts the events stored and every valid `screen_view`, kept or not.
- When the batch names an `install_id` the account does not have (after a database restore, a retention purge, or a build pointed at a fresh database), the events are still stored and the answer adds `"code": "install_not_found", "action": "reregister"`. The SDK then registers the install again.
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
| `open_at must be an ISO 8601 date` |
| `app_store_jws must be a JWS of at most 16384 characters` |
| `app_store_jws: <reason>` (the signature, chain or dates do not verify) |
| `app_store_jws names no transaction` |
| `app_store_jws names an app this account does not have (set its iOS bundle ID)` |
| `app_store_jws carries no price; send revenue too` |

### What each type does

- **`identify`** upserts the customer row keyed by (`account`, `customer_id`). `name`, `email` and `phone` are stored **in plain text**. On a repeat `identify`, a non-null value in the new call overwrites the stored one and an omitted field keeps its stored value; `first_install_id` is set once, from the first `identify` that carried an `install_id`, and never replaced. The `identify` is also stored as an event row of type `identify`. See [Dashboard: Customers](/dashboard/customers/).
- **Automatic signup lead.** The first `identify` of a customer the account has not seen before, sent from a fresh install (the batch's `install_id`, else the device's latest install, created within the last 30 days and not a reinstall), also stores a `lead` event with `event_name: "signup"` and `metadata: {"auto": true, "source": "identify"}`. A `lead` with `event_name: "signup"` that you post for a customer who already has one is counted in `duplicates` and not stored.
- **`screen_view`** is a screen the app showed. It needs `event_name` and refuses `revenue`. It is never stored as an event: the batch's screen views go, once per flush, onto the row of their app session (`session_id`), which keeps the device, install, customer and link open (`open_slug`, `open_click_id`, `open_at`) the session is first known by, the device time of its first screen, the screen count and the first 50 screens with their times, in the order shown. A session that starts before sign-in becomes the customer's at the `identify`, screens before it included; a session keeps the link open that started it. A screen view without a `session_id` is accepted and not stored. Screen views count in no event total or list, and are not in the raw events export; the per-subject export, erasure and retention carry the session rows. Per link, the dashboard lists the screens reached in the 30 minutes after the link opened the app (`GET /api/admin/links/:slug/screens`, on [Admin API](/api/admin-api/#links)); per customer and per install, the 20 newest sessions with the first 50 screens of each (`screen_sessions` on `GET /api/admin/customers/:customerId` and `/installs/:id`).
- **`lead`**, **`conversion`**, **`custom`** are stored as sent. `conversion` requires `revenue` unless it is a `cancel`. A conversion whose `store` + `transaction_id` + `transaction_type` the account already has is a duplicate. Net revenue, the figure every dashboard total shows, adds purchases and subtracts refunds, in the account's revenue currency. See [Revenue](/sdk/revenue/).

Every stored event carries `matched_slug`, the slug of the link that brought the install, so per-link leads and revenue need no join at read time. Per-link numbers credit an event to `open_slug` instead when it happened within the re-engagement window after that open: the window of the re-opening link's app (`reengagement_window_hours`, the default app's for a link bound to none), else `REENGAGEMENT_WINDOW_HOURS` (default 168 hours). It is resolved per event: through `install_id` when the batch names one (only if that install is matched; there is no fallback to the device for an organic `install_id`), else through the device's latest matched install. The request's raw IP is stored on the event row unless the deployment sets `STORE_RAW_IP=0`.

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

## POST /api/v1/store/apple/:token

App Store Server Notifications v2 for one app. `:token` comes from the dashboard (**Apps → Store notifications**); there is no API key. The body is Apple's `{"signedPayload": "<JWS>"}`. The notification and the `signedTransactionInfo` inside it must verify against Apple Root CA - G3 and name the app's iOS bundle ID. What each notification type records is on [Revenue](/sdk/revenue/#store-notifications).

| Status | Body |
|---|---|
| 200 | `{"ok": true, "outcome": "recorded"}`; `outcome` is `recorded`, `updated`, `duplicate`, `ignored`, `unmatched` or `test` |
| 400 | `signedPayload is required`, or the payload has no `notificationUUID` |
| 401 | `{"error": {"code": "invalid_signature", "message": "signedPayload: <reason>"}}` |
| 404 | `Unknown store notification URL` |
| 422 | `{"error": {"code": "bundle_mismatch", …}}` |

## POST /api/v1/store/play/:token

Google Play real-time developer notifications, pushed by a Pub/Sub push subscription with authentication on. The `Authorization: Bearer` token must be a Google-signed OIDC token whose audience is this URL and whose email is the service account saved for the app. The body is Pub/Sub's `{"message": {"data": "<base64 JSON>", "messageId": "…"}, "subscription": "…"}`; the decoded notification must name the app's Android package.

| Status | Body |
|---|---|
| 200 | `{"ok": true, "outcome": "…"}` as above |
| 400 | `The body is not a Pub/Sub push message` |
| 401 | `{"error": {"code": "invalid_token", …}}` |
| 403 | No service account saved for the app |
| 404 | `Unknown store notification URL` |
| 422 | `{"error": {"code": "package_mismatch", …}}` |

## GET /api/v1/attribution

Returns the stored verdict for a device or an install, so an app can recover it after a restart or a failed first call. The body is the verdict from [Clicks and installs](/api/clicks-and-installs/) plus `last_open`.

| Query parameter | Meaning |
|---|---|
| `install_id` | The install to return. Wins when both parameters are given. |
| `device_id` | The device's latest **matched** install, else its latest install. Also keys the per-device rate limit. |

| Status | Body |
|---|---|
| 400 | `{"error": {"code": "invalid_request", "message": "device_id or install_id query parameter is required"}}` |
| 404 | `{"error": {"code": "not_found", "message": "No install found for this device"}}`: no install exists for that device. |
| 404 | `{"error": {"code": "install_not_found", "message": "This install is not known to the server; register it again", "action": "reregister"}}`: the `install_id` names no install of yours. |
| 200 | The verdict. An organic install answers 200 with `"matched": false`; 404 only means "no install at all". |

`last_open` is always present: `{"username", "slug", "click_id", "opened_at"}` for the latest app open reported for this device (the query's `device_id`, or the install's own) or for this install id, else `null`.

```bash title="Re-pull the verdict without a device id"
dectog GET '/api/v1/attribution?install_id=3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f'
```

## POST /api/v1/device-ping

Marks the device active today: one `device_days` row per device and UTC day, written by the day's first ping; later pings that day write nothing. The SDKs send it once a day. It feeds the retention numbers.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `device_id` | string, 128 | yes | Missing answers `400 {"error": {"code": "invalid_request", "message": "device_id is required"}}`. |
| `app_version` | string, 64 | no | |
| `os` | string, 32 | no | |

Response: `200 {"ok": true}`. Device-day rows are deleted by the retention job; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

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
