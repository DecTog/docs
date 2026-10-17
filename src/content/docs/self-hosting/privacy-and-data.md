---
title: Privacy and data
description: What a DecTog server stores about visitors, devices and customers, for how long, what the SDK sends, what a tenant can delete, and what to put in a privacy policy.
sidebar:
  order: 7
---

This page lists the personal data a self-hosted DecTog handles, table by table, with the retention each column gets from the daily sweep (`RETENTION_DAYS`, default 400, or an account's shorter window). The sweep itself is specified on [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/). "Retention" means the value is set to `NULL` once the row is older than the cutoff; "forever" means the sweep never blanks it, so it lasts as long as its row. Rows of `clicks`, `app_installs`, `events` and `app_opens` older than the cutoff are deleted outright once the daily rollups hold their day, which leaves only the per-link daily counts; the one exception is an event with a store transaction id (a purchase, renewal or refund), kept with its personal columns nulled so its transaction is still known.

## IP addresses

Every request's address is read from `CF-Connecting-IP` (else the first `X-Forwarded-For` entry, else `0.0.0.0`).

- **Hashed:** `sha256("<IP_SALT>:<address>")`. IPv6 addresses are cut to their /64 prefix before hashing, because privacy extensions rotate the interface id between the browser tap and the app's first launch; IPv4-mapped addresses are hashed as the plain IPv4, and addresses whose /64 prefix is all zeros (loopback) are hashed in full. The hash is the join key for fingerprint matching, the beacon, the `install_velocity_ip` and `click_storm_ip` rules, the per-IP rate limits and the Overview's "unique visitors". It is only as private as `IP_SALT`.
- **Raw:** not stored by default. A deployment that sets `STORE_RAW_IP=1` also keeps the plain address in `clicks.ip_raw`, `app_installs.ip_raw` and `events.ip_raw` until retention, where the Customers detail page and the admin API show it. Matching, fraud rules and rate limits never use it. The hosted service leaves it off.

| Table | Hashed | Raw | Until |
|---|---|---|---|
| `clicks` | `ip_hash` | `ip_raw`, only with `STORE_RAW_IP=1` | the row is deleted at retention (nulled while the daily rollups catch up) |
| `app_installs` | `ip_hash` | `ip_raw`, only with `STORE_RAW_IP=1` | the same |
| `events` | none | `ip_raw`, only with `STORE_RAW_IP=1` | the same |
| `app_opens` | `ip_hash` | none | the same |
| `rate_limits` | in the key | none | rows deleted after the window passes; with the Rate Limiting bindings (the default config) only the sign-in and reset limits use it |

Bots (User-Agent list, or a Cloudflare bot score below 30) never produce a click row. Link taps set no cookies; the only cookies are the dashboard session and the two Google sign-in cookies.

## Clicks

| Data | Column | Source | Until |
|---|---|---|---|
| Device family, OS label, browser | `device_type`, `os`, `browser`, `os_major`, `os_minor` | User-Agent; `Sec-CH-UA-Platform-Version` for the Android version, Safari's `Version/` token for the iOS version | forever |
| Device model | `device_model` | `Sec-CH-UA-Model` client hint or the WebView `Build/` token, lower-cased; from the SDK on in-app clicks | retention |
| Raw User-Agent | `ua_raw` | header, cut to 512 characters | retention |
| Language | `accept_language` (128 characters), `lang` (primary tag) | `Accept-Language` | `accept_language` at retention; `lang` forever |
| Geo and network | `country`; `region`, `city`, `asn`, `as_org` (128 characters) | Cloudflare's `cf` object | `country` forever; the rest at retention |
| Screen profile | `screen_width`, `screen_height`, `pixel_ratio`, `max_touch_points`, `connection_type` | the beacon of the pages a phone gets instead of a plain redirect: the mobile interstitial, the iOS tap-to-store page, and the Facebook and Instagram page on Android | screen fields after `min(RETENTION_DAYS, 30)` days; `connection_type` forever |
| Device settings | `text_size` (iOS and iPadOS only), `dark_mode`, `high_contrast` (Increase Contrast), `reduce_motion` (Reduce Motion), `utc_offset_min` | the same beacon, from the browser's media queries, the system body font and the page's clock | with the screen fields, after `min(RETENTION_DAYS, 30)` days |
| Traffic source | `referrer` | `Referer` header reduced to its origin; null for the deployment's own hosts | forever |
| Campaign | `utm_*`, `link_params` (`dec_*` values) | the link URL's query string | forever |
| Bot score | `bot_score` | Cloudflare bot management, scores of 30 and above | forever |
| Page button | `cta`, `cta_at` | the link page's beacon: which store, app or website button was tapped first | forever |
| SDK-reported opens | `device_id`, `session_id`, `client_click_time`, `launch_referrer` | the SDK's `POST /api/v1/clicks` | `device_id` and `launch_referrer` at retention; the rest forever |

## Installs

| Data | Columns | Source | Until |
|---|---|---|---|
| Device id | `device_id` | the SDK's device tier: IDFV on iOS (persisted in the Keychain by default) or `ANDROID_ID` | retention |
| Hardware | `device_model`, `device_manufacturer`, `device_kind`, `cpu_type`, `os_build` | device tier | retention; `cpu_family` (derived) forever |
| Screen | `screen_width`, `screen_height`, `screen_density` | device tier | retention |
| Device settings | `text_size` (iOS only), `dark_mode`, `high_contrast` (iOS only), `reduce_motion` | device tier | retention |
| Network | `connectivity_type`, `carrier_mcc`, `carrier_mnc` | device tier | retention |
| ASN | `asn` | Cloudflare | forever |
| OS, locale | `os`, `os_version`, `os_major`, `os_minor`, `language`, `lang`, `timezone` | always sent | forever |
| UTC offset | `utc_offset_min` | always sent, like the time zone | retention, with the device tier |
| App | `app_platform`, `app_version`, `app_build_number`, `package_name`, `installer_package`, `install_time`, `update_time`, `first_install_ts`, `install_state`, `is_physical_device` | always sent | forever |
| WebView User-Agent | `web_user_agent` (512 characters) | SDK | retention |
| Store referrer | `install_referrer` (2048 characters), `referrer_store`, `referrer_status`, the click and install-begin timestamps | Play, Huawei, Samsung, Xiaomi or vivo referrer | forever. The string carries `dtg_click=<id>` and `dtg_l=<username>/<slug>`, plus whatever else the store put in it. |
| Meta referrer | `meta_referrer` (512 characters), `meta_referrer_ts`, `meta_referrer_is_ct` | Meta's on-device provider, only when the app has a Facebook App ID | `meta_referrer` at retention; the rest forever |
| Copied link | `clipboard_slug` | the pasteboard; only the slug and click id are extracted, the clipboard text itself is never stored | forever |
| Apple Search Ads | `asa_token`; `asa_attribution` (campaign, ad group, keyword and ad ids, dates, country) | AdServices, only with `DectogCollection.appleSearchAdsToken` | the token is nulled as soon as the status settles, or at retention; the record forever |
| Verdict and fraud | `matched*`, `match_*`, `referrer_source`, `candidate_count`, `routing_click_id`, `fp_shadow_*`, `fraud_flags` | the Worker | forever |
| Free-form | `metadata` | whatever the app put in the request's `metadata` | forever |

### Advertising identifiers

`POST /api/v1/app-installs` accepts `ad_id` and `ad_tracking_limited` and stores them in `ad_identifiers`, keyed by install id. No query joins that table to `app_installs` or to `device_id`; it is written once and deleted by the sweep. flutter_dectog itself reads neither the GAID nor the IDFA; these fields are only sent by apps that add the `flutter_dectog_adid` package, and only when the user allowed tracking (otherwise `ad_tracking_limited` is `true` and no id is sent). See [Device data and privacy](/sdk/device-data-and-privacy/).

### What the SDK sends per tier

The device tier (`DectogCollection.deviceTier`) is on by default and `persistDeviceId` is `true` by default. With the device tier on, every install registration carries the device id, hardware, screen, settings and network fields above, and every in-app click the device id and model. With it off, those fields are absent: the server then cannot detect reinstalls by device, the fingerprint has no model or screen signal, and `GET /api/v1/attribution` works by `install_id` only. The OS, locale (the UTC offset included), app and referrer fields are sent regardless. The iOS pasteboard read is on by default (`DectogCollection.pasteboard`; iOS on, Android off unless the dashboard or `collect` says otherwise) and triggers the system paste notice on iOS 16 and later; the Apple Search Ads token is off by default.

## Customers and events

- `customers.name` (200 characters), `email` (254) and `phone` (32) are stored **in plain text**, exactly as your app sends them in `identify` events (`apps/worker/src/api_events.ts`). A later identify that sends a field overwrites it; a field it omits keeps its old value. Only `first_install_id` is first-seen. They are nulled once the customer's `updated_at` is older than the retention cutoff. `customer_id`, the identifier your app chose, is kept forever.
- Event rows are deleted at retention once the rollups hold their day. Until then a row past the cutoff keeps `type`, `event_name`, `revenue`, `currency`, `install_id` and `matched_slug`, and has `device_id`, `customer_id`, `metadata` (free JSON from your app) and `ip_raw` nulled. An event with a `transaction_id` is never deleted by the sweep: it stays in that nulled form, so a purchase restored after the window counts once and a refund finds its purchase. It goes with an erasure of its device or customer, or a permanent delete of its link.
- `device_pings` rows (device id, app version, OS, time) are deleted at retention.
- `app_opens` rows go the same way: deleted at retention once the rollups hold their day; until then they keep the slug and time and have `device_id`, `install_id`, `click_id` and `ip_hash` nulled.

The dashboard masks the email in the Customers list (`e****@domain`) but shows it in full on the detail page, together with the attributed click's geo and network, and its raw IP when the deployment stores one (`STORE_RAW_IP=1`). See [Customers](/dashboard/customers/).

## Rejected requests

When a `/api/v1` call is refused as malformed, the server stores the account, the route, the error code and message, the SDK build, and the SHA-256 and size of the body, never the body. The rows are deleted after 30 days.

## Store notifications

`store_notifications` logs every App Store and Google Play notification an app's URL receives: store, notification id, type, subtype, environment, transaction id, outcome and time. No customer data. Rows are deleted after 90 days; the revenue rows they wrote stay like any other event. `app_store_endpoints` keeps each app's URL token and the Pub/Sub service account email until the app or its endpoint is deleted.

## Data that leaves the server

- **Webhooks:** the `app.installed` and `app.install_updated` deliveries include `device_id`, `device_model`, `device_manufacturer`, OS, connectivity, carrier codes, `ip_hash`, the matched link and click params, fraud flags and the Apple Search Ads record; `event.*` deliveries include the customer id and the event's metadata; `click.recorded` the click's `ip_hash`, country and language. Every delivery is kept in `webhook_deliveries` with that data and the start of your endpoint's response for 30 days, then deleted by the daily job; neither the retention sweep nor a permanent link delete removes it sooner. Webhook secrets are stored encrypted under `JWT_SECRET` and never returned after they are shown once. See [Webhooks](/api/webhooks/).
- **Exports:** the [raw export](/api/export/) and the dashboard's CSV hand the tenant its own clicks, installs, opens and events, without the IP (raw or hashed) and the user agent. A CSV too large to stream is written to the `EXPORTS` R2 bucket, when one is configured, behind a signed link, and deleted after 7 days; its job row (the query, not the data) goes a week later.
- **Apple:** the AdServices token is posted to `api-adservices.apple.com`.
- **Google Play's device list:** at most daily, the Worker downloads `https://storage.googleapis.com/play_public/supported_devices.csv` to name device models. The request carries no data about you or your users.
- **European Central Bank:** once a day the Worker downloads `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` (the euro reference rates) to convert revenue. The request carries no data about you or your users.
- **Resend:** the password-reset email (recipient address, reset link) when `RESEND_API_KEY` is set.
- **Google:** the OAuth code exchange when Sign in with Google is configured, and, when an app receives Play notifications, a download of Google's public signing keys (`https://www.googleapis.com/oauth2/v3/certs`) to verify the push tokens. That request carries no data.
- **Cloudflare:** everything is processed in Workers and stored in D1. D1 chooses a region when the database is created; `wrangler d1 create --location` pins it.
- **Visitors' browsers contact only the deployment.** Link pages and the dashboard load their fonts (Outfit, Inter, Fira Code, all SIL OFL) and country flags from the deployment itself; no page asks Google Fonts, a CDN or any other host for anything.

## Accounts

`users` keeps the email, a PBKDF2-SHA256 password hash (100,000 iterations), the username, the SHA-256 of the account key with its 8-character prefix (never the key itself), the role and the Google `sub`. Nothing in `users` is ever anonymized. `password_resets` stores token hashes with expiry and use time, never pruned. `contact_messages` stores name, email, subject and message from the public form until an owner deletes them.

## Teams

`invites` keeps the invited email address and role, with the SHA-256 of the link's token, after it is accepted or expires; `memberships` keeps who belongs to which account. Neither is anonymized or pruned.

## Audit log

`audit_events` records every change to an account's configuration, every sign-in, wrong password, sign-out and password reset, and every CSV export ([Settings: Audit log](/dashboard/settings/#audit-log)). Each entry holds the email of the person who acted (or the key's prefix and name), the salted IP hash, the user agent and the request id. It holds no secret: fields that look like one are stored as `[redacted]`, and webhook URLs only as their origin. Entries are never anonymized or pruned: `RETENTION_DAYS` does not apply to them, and they are kept as long as the account.

## What a tenant can delete

| Action | Effect |
|---|---|
| Delete a link (dashboard **Delete**, `DELETE /api/v1/links/:slug`) | Nothing at once: the link is marked deleted and stops answering. Thirty days later the daily job sets the personal columns of its clicks and app opens to `NULL` (see [Scheduled jobs](/self-hosting/scheduled-jobs-and-retention/#deleted-links-daily)); the counts stay. |
| Delete a link permanently (dashboard **Delete permanently**, `?permanent=true`) | In one batch: events whose `matched_slug` is the link or whose install was attributed through its clicks; the link's app opens and referrals; `customers.first_install_id` cleared where it pointed at those installs; the attributed installs; every click on the link; the link row. The data disappears from Overview and per-link analytics. |
| Delete a temporary link | The same two paths. |
| "Delete expired" temporary links | Only the `temp_links` rows; clicks and installs stay. |
| Delete an app | Its links fall back to the oldest remaining app; installs and clicks are untouched; its store notification URLs stop working. |
| Regenerate the API key | The old key stops working immediately. |
| Erase a device or a customer | See [A request from one person](#a-request-from-one-person). |
| Shorten the retention window (Settings → **Data retention**) | From the next daily run, the account's raw rows older than its window are anonymized or deleted, as `RETENTION_DAYS` does for the deployment. |

There is no way through the dashboard or the API to delete an account or to rename a username.

## A request from one person

When someone asks what you hold about them, or asks you to delete it, find their device or customer id (the Customers screen, or the install detail on Overview and Links) and use **Download everything stored (JSON)** or **Erase this device** / **Erase this customer** there. From a server, with the account key and the `dectog` helper from [Signing with curl](/api/overview/#signing-with-curl):

```bash
dectog GET    /api/v1/devices/<device_id>/export > device.json
dectog DELETE /api/v1/devices/<device_id>
```

`/api/v1/customers/<customer_id>/export` and `DELETE /api/v1/customers/<customer_id>` do the same for a customer (URL-encode an id with `/`, spaces or other reserved characters). An SDK key gets `403 account_key_required`.

**The export** is a JSON file: the device's installs (device, OS, app version, screen, device settings, network, language, raw IP when `STORE_RAW_IP=1`, the attribution verdict and fraud flags), its taps (link, time, country, region, city, browser, user agent, device settings, referrer, UTM; a tap its install was credited to or routed by counts as its own), events, app opens, app starts, advertising ids and the referral that brought it. A customer's export holds the customer record, its events, the referrals it made and received (without the other customers' ids), its referral link, and its devices: each device only they used, exported in full, and each device another customer also used, by id only. Salted IP hashes, matching internals and the Apple Search Ads token are left out.

**Erasing a device** deletes, in one batch, its installs, events (by device id or install id), app opens, app starts, advertising ids, the referrals that name it, and the webhook deliveries that mention the device, one of its installs or one of its taps. Its taps (by device id, and the taps its installs were credited to or routed by) keep their link, time, country, platform and UTM, so link counts stay, and lose the device id and model, IP, user agent, language, region, city, network, referrer, screen profile, device settings (text size, dark mode, Increase Contrast, Reduce Motion, UTC offset), session and link parameters. Customers that pointed at its installs keep their record, with the install link cleared. On a device more than one customer used, the device's events include the other customers' events from it, and they go too; erase the customer instead to keep theirs.

**Erasing a customer** deletes the customer record, its events and the referrals it made or received, and the webhook deliveries that name it, clears it from its referral link (which keeps routing taps, since it may be shared, but credits no one), then erases each device only that customer used, as above. A device another customer also used is kept, with that customer's data; only the erased customer's events on it go.

What stays, and for how long:

- **Counts.** The daily rollups hold totals per link and day, never a device or a person, and keep them.
- **The audit log** records the request: who erased or exported, when, the number of rows per table, and the first 12 hex characters of `sha256("<account>:<device|customer>:<id>")`, never the id itself.
- **A tombstone** with that hash, for 8 days: an SDK keeps unsent events up to 7 days, so an event of the erased device or customer with a client timestamp before the erasure is acknowledged and dropped. Events made after the erasure are stored as new data.
- **CSV exports** made earlier keep their copy until the file expires, at most 7 days.
- **D1 Time Travel** can restore the database to any minute of the last 30 days (7 on the Workers Free plan; [Cloudflare's Time Travel page](https://developers.cloudflare.com/d1/reference/time-travel/)), so erased rows stay restorable there until then. Nothing in DecTog restores them.

Deleting an install row frees its click for a future fingerprint match (the `NOT EXISTS` check in the candidate query), but the erased taps have no IP hash or device model left to match on.

## For your privacy policy

A self-hosted DecTog makes you the controller of this data. Items a policy and the store declarations usually need to cover, with where each comes from:

1. **Link taps:** IP address (hashed and, until retention, raw), country, region and city, ASN, User-Agent and client hints, language, referrer origin, UTM parameters; on the interstitial and tap-to-store pages also the screen profile, text size, dark mode, Increase Contrast, Reduce Motion and UTC offset; purpose: routing, install attribution, fraud detection, analytics.
2. **App installs and opens:** the vendor-scoped device identifier (IDFV persisted in the Keychain, or `ANDROID_ID`), hardware model and manufacturer, OS and version, screen metrics, text size, dark mode, Increase Contrast and Reduce Motion, UTC offset, connectivity and carrier codes (Android), app version and install dates, IP address; purpose: install attribution, reinstall detection, analytics. Declare the persisted identifier in the App Store privacy answers and the Play Data safety form.
3. **Store install referrers** (Play, Huawei, Samsung, Xiaomi, vivo) and, if you set a Facebook App ID, Meta's on-device install referrer.
4. **Pasteboard access on iOS** on first launch (system notice on iOS 16 and later), if you leave the pasteboard read at its default.
5. **Apple Search Ads attribution token**, if `collect` names `appleSearchAdsToken`.
6. **Advertising identifier** (IDFA after ATT, GAID), only with the `flutter_dectog_adid` package.
7. **Customer identity**: whatever your app sends in `identify` (name, email, phone, your customer id) and in event metadata, stored in plain text.
8. **Retention:** clicks, installs, events and app opens deleted after `RETENTION_DAYS` (400 by default), keeping only daily per-link counts; other personal columns anonymized then; the screen profile and device settings of taps after 30 days, Apple tokens as soon as resolved.
9. **Your website, with [`dectog.js`](/sdk/web/):** first-party cookies `dtg_click` (the click a visitor landed with, 30 days), `dtg_consent` (their answer, a year) and `dtg_banner`; the leads, purchases and custom events your pages send, with no IP stored. In the EU and EEA, the UK and Switzerland, and for browsers that send Global Privacy Control, nothing is stored before consent.
10. **Consent in your app:** with `DectogConfig(enabled: false)` the SDK sends nothing and reads no pasteboard until your app calls `setEnabled(true)`; events tracked meanwhile wait on the device (at most 7 days). See [Waiting for consent](/sdk/device-data-and-privacy/#waiting-for-consent).
11. **Processors:** Cloudflare (Workers, D1), plus Apple, Resend, Google and your own webhook endpoint where used.

The device settings in items 1 and 2 need particular care. Text size, dark mode, Increase Contrast, Reduce Motion and the UTC offset are device configuration, and Apple's user-privacy rules for developers prohibit deriving data from a device's configuration to identify it; DecTog compares them one by one for 0 points and combines them into no identifier, but the App Store review risk is yours. Increase Contrast, Reduce Motion and a large text size can suggest a disability, which EU data-protection law may treat as health data. An app that cannot carry this leaves the SDK's device tier out or turns **Probabilistic match** off; the link pages still record the settings on the tap. See [Device data and privacy](/sdk/device-data-and-privacy/#device-settings).

Adjust `RETENTION_DAYS` on the [Configuration reference](/self-hosting/configuration-reference/) if 400 days is longer than your policy allows.
