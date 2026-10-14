---
title: Events
description: Identify users, record signup leads, conversions and custom events, and understand the durable queue, the batch and field limits, and the collection switch.
sidebar:
  order: 7
---

Post-install events let the dashboard show leads and revenue per link. The SDK queues events on disk and sends them in batches to `POST /api/v1/events`; the server stamps each event with the install's matched link, so no join is needed later.

## Identify

Bind your own user id to this device's install, with optional contact fields:

```dart
await dectog.identify(
  customerId: user.id,
  name: user.name,     // optional
  email: user.email,   // optional
  phone: user.phone,   // optional
);
```

- The id is persisted and stamped onto every later event until `logout()`.
- A repeat call with the same `customerId`, `name`, `email` and `phone` as the previous one sends nothing, so calling `identify` on every launch is safe. Any changed field, a `logout()` or an opt-out in between sends a new identify.
- The server upserts the customer record. A field you send again **overwrites** the stored value; a field you omit keeps its old value. Only the install association is first-seen: the customer stays attached to the install it was first identified on.
- `name`, `email` and `phone` are stored in plain text on the server until the retention cutoff.

### Signup leads

There is no lead call. The server records a `lead` event named `signup` automatically on the first identify of a **new** customer whose install is at most 30 days old and not a reinstall (a lead per customer at most). Users identified for the first time on an older install, for example right after you integrated the SDK, are existing users and are not counted. The Overview's Leads number and the per-link leads come from these events.

## Conversions

```dart
await dectog.trackConversion(
  revenue: 9.99,
  currency: 'USD',
  productId: 'pro-monthly',
  transactionId: purchase.transactionId,
  store: DectogStore.appStore,
  purchaseType: DectogPurchaseType.subscription,
);
```

`revenue` is required and must be at least 0. `eventName` defaults to `purchase`. `currency` is upper-cased by the server and capped at 8 characters. The transaction fields travel as top-level event fields, and `metadata` is stored as you pass it. Revenue reaches the per-link analytics in your account's currency. Renewals, refunds and cancels are on [Revenue](/sdk/revenue/).

## Custom events

```dart
await dectog.trackEvent('level_up', data: {'level': 3});
```

`eventName` is required; `data` becomes the event's metadata.

## Queue, flush, logout

Events are appended to `.dectog_event_queue.jsonl` in the SDK's backup-excluded directory and delivered at least once:

| Rule | Value |
|---|---|
| Automatic flush | when 20 events are queued, and every 30 seconds |
| Batch size | up to 100 events per request |
| Queue cap | 1000 events; the oldest are dropped first under pressure |
| Event size | 32 KB serialized; larger events are dropped |
| Transient failure (network, 5xx, 401, 408, 429) | the batch stays at the head of the queue and is retried on the next tick |
| Permanent rejection (any other 4xx) | the batch is discarded so it cannot block the queue |
| An invalid event in a delivered batch | the server stores the rest and lists it in `rejected`; the batch leaves the queue and debug logging prints the reason |
| Time to live | 7 days: an event still undelivered after that is dropped unsent |

```dart
await dectog.flush();   // send what is queued now
await dectog.logout();  // flush, then forget the customer id
```

Events queued by a previous launch are sent shortly after `initialize()`. `dispose()` makes a final flush attempt and keeps whatever did not go out for the next launch.

Each queued event carries a `client_timestamp` (device clock, ISO 8601), a `client_event_id` (a UUID stamped when it is queued and stored with it) and, when known, the persisted `customer_id`. A batch resent after a lost response is byte-identical, and the server stores each `client_event_id` once, so a retry never counts a purchase twice. Each batch carries the `install_id` from the first-launch verdict and, with `collectDeviceData` on, the `device_id`.

## Server limits

| Limit | Behavior |
|---|---|
| More than 100 events in one batch | `413 {"error":{"code":"payload_too_large","message":"events batch exceeds 100 items"}}`. The SDK never exceeds it. |
| One invalid event in a batch | The whole batch is rejected with 400 and nothing in it is stored. Because that is a permanent rejection, the SDK drops the batch. |
| `identify` without `customer_id` | 400 |
| `conversion` without `revenue`, or a negative or non-numeric revenue | 400 |
| Metadata that cannot be serialized to JSON | 400 |
| `event_name`, `customer_id`, `name` | truncated to 200 characters |
| `email` | truncated to 254 characters |
| `phone` | truncated to 32 characters |
| `currency` | truncated to 8 characters, upper-cased |
| `client_timestamp` | truncated to 64 characters |

The SDK only produces `identify`, `conversion` and `custom` events (`lead` is accepted by the API but never sent by the SDK). The rate limits of the API (3000 requests per minute per account, 60 per minute per device, 600 per minute per account and IP) apply; a 429 keeps the batch queued and the SDK retries on the next tick. See [Events and attribution](/api/events-and-attribution/) for the wire format.

## How events reach a link

The server denormalizes `matched_slug` when it stores an event: from the batch's `install_id` when that install was credited, else from the device's latest credited install. Events from organic installs carry no slug and appear only in account-wide totals. The Customers page shows each customer's events (latest 200) next to the link that brought them in; see [Customers](/dashboard/customers/).

When a DecTog link opens the already-installed app, the SDK remembers it (`slug`, click id, time) and stamps every later event with `open_slug`, `open_click_id` and `open_at`, plus a `session_id` that is new for every app process. An event within the re-engagement window after that open (7 days by default, set per app on the Apps page) counts for the re-opening link instead of the link that brought the install. The window is applied when the dashboard reads the numbers, so changing it changes past credit too.

## Turning collection off

```dart
await dectog.setEnabled(false);
```

Discards new events, clears the queue and stops the sender, and stops every other report too: clicks, app opens, install registration and the device ping. It is persisted; `setEnabled(true)` resumes. `isEnabled()` reads the flag. See [Device data and privacy](/sdk/device-data-and-privacy/).

## Attribution re-pull

```dart
final verdict = await dectog.getAttributionData();
```

Returns the cached first-launch verdict, or re-pulls `GET /api/v1/attribution` by device id (device tier on) or by the persisted install id. An organic install comes back with `matched: false`; `null` means the server knows no install for this device. Re-pulled verdicts carry `lastOpen`, the latest link that opened the installed app, with `username`, `slug`, `clickId` and `openedAt`.
