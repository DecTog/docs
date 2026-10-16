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

## Screen views

```dart
await dectog.trackScreenView('product', params: {'id': 42});
```

A screen view is an event of type `screen_view`, named by the screen. It counts in no event total: not in Leads, Revenue, the re-open counts or a customer's events. It feeds the links page's **Screens after open**, which lists the screens people reached in the 30 minutes after a link opened the app (see [Links](/dashboard/links/#screens-after-open)). The name is trimmed and cut to 200 characters, and an empty name sends nothing. `params` keeps strings (cut to 256 characters), finite numbers and booleans and drops the rest; the SDK adds the previous screen it reported as `previous_screen`.

To report every page route instead, add the observer to the navigator:

```dart
MaterialApp(
  navigatorObservers: [DectogNavigatorObserver()],
  // …
);
// go_router: GoRouter(observers: [DectogNavigatorObserver()], …)
```

It reports each page route the navigator shows, after a push, a replace or a pop, by `RouteSettings.name` (or `nameOf: (route) => …`); routes without a name, dialogs and sheets are skipped. A screen is reported once it has been on top for 350 ms (`debounce`), so a burst of transitions sends only the screen that settles, and the same screen twice in a row is sent once. Only the name goes unless `captureParams: {'id'}` allows route arguments, when `settings.arguments` is a map. Keep personal data out of screen names and parameters: they are stored like any event's metadata.

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

Each queued event carries a `client_timestamp` (device clock, ISO 8601), a `client_event_id` (a UUID stamped when it is queued and stored with it) and, when known, the persisted `customer_id`. A batch resent after a lost response is byte-identical, and the server stores each `client_event_id` once, so a retry never counts a purchase twice. Each batch carries the `install_id` from the first-launch verdict and, with the device tier, the `device_id`.

## Server limits

| Limit | Behavior |
|---|---|
| More than 100 events in one batch | `413 {"error":{"code":"payload_too_large","message":"events batch exceeds 100 items"}}`. The SDK never exceeds it. |
| One invalid event in a batch | The server stores the other events and lists the invalid one in `rejected`, with its index and the error. Only a batch in which every event is invalid answers 400. Either way the batch leaves the SDK's queue. |
| `identify` without `customer_id` | Rejected, as above |
| `conversion` without `revenue`, or a negative or non-numeric revenue | Rejected, as above |
| Metadata that cannot be serialized to JSON | Rejected, as above |
| `event_name`, `customer_id`, `name` | truncated to 200 characters |
| `email` | truncated to 254 characters |
| `phone` | truncated to 32 characters |
| `currency` | truncated to 8 characters, upper-cased |
| `client_timestamp` | truncated to 64 characters |

The SDK only produces `identify`, `conversion` and `custom` events (`lead` is accepted by the API but never sent by the SDK). The rate limits of the API (3000 requests per minute per account, 60 per minute per device, 600 per minute per account and IP) apply; a 429 keeps the batch queued and the SDK retries on the next tick. See [Events and attribution](/api/events-and-attribution/) for the wire format.

## How events reach a link

The server denormalizes `matched_slug` when it stores an event: from the batch's `install_id` when that install was credited, else from the device's latest credited install. Events from organic installs carry no `matched_slug`; they count for a link only when one re-opened the app within the re-engagement window (below), and otherwise appear only in account-wide totals. The Customers page shows each customer's events (latest 200) next to the link that brought them in; see [Customers](/dashboard/customers/).

When a DecTog link opens the already-installed app, the SDK remembers it (`slug`, click id, time) and stamps every later event with `open_slug`, `open_click_id` and `open_at`, plus a `session_id` that is new for every app process. An open the server refuses (the link is paused, expired, deleted or unknown: `/api/v1/app-opens` answers 404 or 410) is not remembered: the open before it stands. A `dtg_click` in the link that is not a click id is never kept or sent. An event within the re-engagement window after that open (7 days by default, set per app on the Apps page) counts for the re-opening link instead of the link that brought the install. The window is applied when the dashboard reads the numbers, so changing it changes past credit too.

## Turning collection off

```dart
await dectog.setEnabled(false);
```

Stops the sender and every other report: clicks, app opens, install registration and the device ping. Events tracked from then on are held in the on-disk queue with the ones already there, and go out after `setEnabled(true)`, unless they are older than 7 days by then. It is persisted; `isEnabled()` reads the flag. To start with collection off until the user agrees, pass `DectogConfig(enabled: false)`. See [Waiting for consent](/sdk/device-data-and-privacy/#waiting-for-consent).

## Attribution re-pull

```dart
final verdict = await dectog.getAttributionData();
```

Returns the cached first-launch verdict, or re-pulls `GET /api/v1/attribution` by device id (device tier on) or by the persisted install id. An organic install comes back with `matched: false`; `null` means the server knows no install for this device. Re-pulled verdicts carry `lastOpen`, the latest link that opened the installed app, with `username`, `slug`, `clickId` and `openedAt`.
