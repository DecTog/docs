---
title: Privacy and data
description: What a DecTog server stores about visitors, devices and customers, for how long, what the SDK sends, what a tenant can delete, and what to put in a privacy policy.
sidebar:
  order: 7
---

This page lists the personal data a self-hosted DecTog handles, table by table, with the retention each column gets from the daily sweep (`RETENTION_DAYS`, default 400). The sweep itself is specified on [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/). "Forever" means no code ever removes the value; "retention" means it is set to `NULL` once the row is older than the cutoff.

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
| Device family, OS label, browser | `device_type`, `os`, `browser`, `os_major` | User-Agent; `Sec-CH-UA-Platform-Version` for the Android version | forever |
| Device model | `device_model` | `Sec-CH-UA-Model` client hint or the WebView `Build/` token, lower-cased; from the SDK on in-app clicks | retention |
| CPU family | `ua_arch` | `Sec-CH-UA-Arch` | forever |
| Raw User-Agent | `ua_raw` | header, cut to 512 characters | retention |
| Language | `accept_language` (128 characters), `lang` (primary tag) | `Accept-Language` | `accept_language` at retention; `lang` forever |
| Geo and network | `country`; `region`, `city`, `asn`, `as_org` (128 characters) | Cloudflare's `cf` object | `country` forever; the rest at retention |
| Screen profile | `screen_width`, `screen_height`, `pixel_ratio`, `max_touch_points`, `connection_type` | the interstitial beacon, only for apps with the mobile interstitial on | screen fields after `min(RETENTION_DAYS, 30)` days; `connection_type` forever |
| Traffic source | `referrer` | `Referer` header reduced to its origin; null for the deployment's own hosts | forever |
| Campaign | `utm_*`, `link_params` (`dec_*` values) | the link URL's query string | forever |
| Bot score | `bot_score` | Cloudflare bot management, scores of 30 and above | forever |
| SDK-reported opens | `device_id`, `session_id`, `client_click_time`, `launch_referrer` | the SDK's `POST /api/v1/clicks` | `device_id` and `launch_referrer` at retention; the rest forever |

## Installs

| Data | Columns | Source | Until |
|---|---|---|---|
| Device id | `device_id` | the SDK's device tier: IDFV on iOS (persisted in the Keychain by default) or `ANDROID_ID` | retention |
| Hardware | `device_model`, `device_manufacturer`, `device_kind`, `cpu_type`, `os_build` | device tier | retention; `cpu_family` (derived) forever |
| Screen | `screen_width`, `screen_height`, `screen_density` | device tier | retention |
| Network | `connectivity_type`, `carrier_mcc`, `carrier_mnc` | device tier | retention |
| ASN | `asn` | Cloudflare | forever |
| OS, locale | `os`, `os_version`, `os_major`, `language`, `lang`, `timezone` | always sent | forever |
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

The device tier (`DectogCollection.deviceTier`) is on by default and `persistDeviceId` is `true` by default. With the device tier on, every install registration and in-app click carries the device id, hardware, screen and network fields above. With it off, those fields are absent: the server then cannot detect reinstalls by device, the fingerprint has no model or screen signal, and `GET /api/v1/attribution` works by `install_id` only. The OS, locale, app and referrer fields are sent regardless. The iOS pasteboard read is on by default (`DectogCollection.pasteboard`; iOS on, Android off unless the dashboard or `collect` says otherwise) and triggers the system paste notice on iOS 16 and later; the Apple Search Ads token is off by default.

## Customers and events

- `customers.name` (200 characters), `email` (254) and `phone` (32) are stored **in plain text**, exactly as your app sends them in `identify` events (`apps/worker/src/api_events.ts`). A later identify that sends a field overwrites it; a field it omits keeps its old value. Only `first_install_id` is first-seen. They are nulled once the customer's `updated_at` is older than the retention cutoff. `customer_id`, the identifier your app chose, is kept forever.
- Every event row keeps `type`, `event_name`, `revenue`, `currency`, `install_id` and `matched_slug` forever; `device_id`, `customer_id`, `metadata` (free JSON from your app) and `ip_raw` are nulled at retention.
- `device_pings` rows (device id, app version, OS, time) are deleted at retention.
- `app_opens` keep the slug and time forever; `device_id`, `install_id`, `click_id` and `ip_hash` are nulled at retention.

The dashboard masks the email in the Customers list (`e****@domain`) but shows it in full on the detail page, together with the attributed click's geo and network, and its raw IP when the deployment stores one (`STORE_RAW_IP=1`). See [Customers](/dashboard/customers/).

## Rejected requests

When a `/api/v1` call is refused as malformed, the server stores the account, the route, the error code and message, the SDK build, and the SHA-256 and size of the body, never the body. The rows are deleted after 30 days.

## Store notifications

`store_notifications` logs every App Store and Google Play notification an app's URL receives: store, notification id, type, subtype, environment, transaction id, outcome and time. No customer data. Rows are deleted after 90 days; the revenue rows they wrote stay like any other event. `app_store_endpoints` keeps each app's URL token and the Pub/Sub service account email until the app or its endpoint is deleted.

## Data that leaves the server

- **Webhooks:** the `app.installed` and `app.install_updated` deliveries include `device_id`, `device_model`, `device_manufacturer`, OS, connectivity, carrier codes, `ip_hash`, the matched link and click params, fraud flags and the Apple Search Ads record; `event.*` deliveries include the customer id and the event's metadata; `click.recorded` the click's `ip_hash`, country and language. Every delivery is kept in `webhook_deliveries` with that data and the start of your endpoint's response for 30 days, then deleted by the daily job; neither the retention sweep nor a permanent link delete removes it sooner. Webhook secrets are stored encrypted under `JWT_SECRET` and never returned after they are shown once. See [Webhooks](/api/webhooks/).
- **Exports:** the [raw export](/api/export/) and the dashboard's CSV hand the tenant its own clicks, installs, opens and events, without the IP (raw or hashed) and the user agent. A CSV too large to stream is written to the `EXPORTS` R2 bucket, when one is configured, behind a signed link, and deleted after 7 days; its job row (the query, not the data) goes a week later.
- **Apple:** the AdServices token is posted to `api-adservices.apple.com`.
- **European Central Bank:** once a day the Worker downloads `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` (the euro reference rates) to convert revenue. The request carries no data about you or your users.
- **Resend:** the password-reset email (recipient address, reset link) when `RESEND_API_KEY` is set.
- **Google:** the OAuth code exchange when Sign in with Google is configured, and, when an app receives Play notifications, a download of Google's public signing keys (`https://www.googleapis.com/oauth2/v3/certs`) to verify the push tokens. That request carries no data.
- **Cloudflare:** everything is processed in Workers and stored in D1. D1 chooses a region when the database is created; `wrangler d1 create --location` pins it.

## Accounts

`users` keeps the email, a PBKDF2-SHA256 password hash (100,000 iterations), the username, the SHA-256 of the API key with its 8-character prefix, the AES-GCM encrypted copy of the key, the role and the Google `sub`. Nothing in `users` is ever anonymized. `password_resets` stores token hashes with expiry and use time, never pruned. `contact_messages` stores name, email, subject and message from the public form until an owner deletes them.

## What a tenant can delete

| Action | Effect |
|---|---|
| Delete a link (dashboard **Delete**, `DELETE /api/v1/links/:slug`) | Nothing at once: the link is marked deleted and stops answering. Thirty days later the daily job sets the personal columns of its clicks and app opens to `NULL` (see [Scheduled jobs](/self-hosting/scheduled-jobs-and-retention/#deleted-links-daily)); the counts stay. |
| Delete a link permanently (dashboard **Delete permanently**, `?permanent=true`) | In one batch: events whose `matched_slug` is the link or whose install was attributed through its clicks; the link's app opens and referrals; `customers.first_install_id` cleared where it pointed at those installs; the attributed installs; every click on the link; the link row. The data disappears from Overview and per-link analytics. |
| Delete a temporary link | The same two paths. |
| "Delete expired" temporary links | Only the `temp_links` rows; clicks and installs stay. |
| Delete an app | Its links fall back to the oldest remaining app; installs and clicks are untouched; its store notification URLs stop working. |
| Regenerate the API key | The old key stops working immediately. |

There is no way through the dashboard or the API to delete an account, a customer, a single install, click or event, or to rename a username. A data-subject request therefore needs direct database access, always scoped to the tenant:

```bash
# everything recorded for one device id of one tenant (replace both placeholders)
npx wrangler d1 execute dectog --remote --env production --command \
  "DELETE FROM events WHERE user_id = '<user_id>' AND device_id = '<device_id>';
   DELETE FROM app_opens WHERE user_id = '<user_id>' AND device_id = '<device_id>';
   DELETE FROM device_pings WHERE user_id = '<user_id>' AND device_id = '<device_id>';
   DELETE FROM ad_identifiers WHERE install_id IN (SELECT id FROM app_installs WHERE user_id = '<user_id>' AND device_id = '<device_id>');
   DELETE FROM app_installs WHERE user_id = '<user_id>' AND device_id = '<device_id>';"
```

Deleting an install row frees its click for a future fingerprint match (the `NOT EXISTS` check in the candidate query), which is the intended consequence of removing the record.

## For your privacy policy

A self-hosted DecTog makes you the controller of this data. Items a policy and the store declarations usually need to cover, with where each comes from:

1. **Link taps:** IP address (hashed and, until retention, raw), country, region and city, ASN, User-Agent and client hints, language, referrer origin, UTM parameters; purpose: routing, install attribution, fraud detection, analytics.
2. **App installs and opens:** the vendor-scoped device identifier (IDFV persisted in the Keychain, or `ANDROID_ID`), hardware model and manufacturer, OS and version, screen metrics, connectivity and carrier codes (Android), app version and install dates, IP address; purpose: install attribution, reinstall detection, analytics. Declare the persisted identifier in the App Store privacy answers and the Play Data safety form.
3. **Store install referrers** (Play, Huawei, Samsung, Xiaomi, vivo) and, if you set a Facebook App ID, Meta's on-device install referrer.
4. **Pasteboard access on iOS** on first launch (system notice on iOS 16 and later), if you leave the pasteboard read at its default.
5. **Apple Search Ads attribution token**, if `collect` names `appleSearchAdsToken`.
6. **Advertising identifier** (IDFA after ATT, GAID), only with the `flutter_dectog_adid` package.
7. **Customer identity**: whatever your app sends in `identify` (name, email, phone, your customer id) and in event metadata, stored in plain text.
8. **Retention:** clicks, installs, events and app opens deleted after `RETENTION_DAYS` (400 by default), keeping only daily per-link counts; other personal columns anonymized then; screen profiles after 30 days, Apple tokens as soon as resolved.
9. **Processors:** Cloudflare (Workers, D1), plus Apple, Resend, Google and your own webhook endpoint where used.

Adjust `RETENTION_DAYS` on the [Configuration reference](/self-hosting/configuration-reference/) if 400 days is longer than your policy allows.
