---
title: Scheduled jobs and retention
description: The two cron triggers, what each one runs, how the daily rollups are built, and exactly which rows and columns the daily retention sweep deletes, nulls or keeps.
sidebar:
  order: 4
---

The Worker has two cron triggers, declared identically at the top level and in `env.production` of `apps/worker/wrangler.jsonc`. Cloudflare evaluates cron expressions in UTC. The handler is `scheduled` in `apps/worker/src/index.ts`.

| Expression | Fires | Runs |
|---|---|---|
| `7 * * * *` | Every hour at :07 | Apple Search Ads retry, the daily rollups, webhook retries, unfinished CSV exports and custom domain checks |
| `17 3 * * *` | Daily at 03:17 UTC | The same, then the expired temporary links' delete, the deleted-link anonymization, the webhook delivery-log purge, the export-file purge, the exchange rates and, once the rollups are done, the retention sweep |

The code branches on the expression: `7 * * * *` returns after the Apple Search Ads pass and the rollups; any other expression runs everything. The jobs run inside `waitUntil`, so a failure in one does not stop the others, except that the retention sweep waits for the rollup build. There is no job-level logging beyond console warnings.

`wrangler dev` does not fire crons. Start it with `--test-scheduled` and call `http://localhost:8787/__scheduled?cron=17+3+*+*+*` (or `7+*+*+*+*`) to run a trigger by hand; see the [Local quick start](/self-hosting/local-quick-start/).

## Apple Search Ads retry (both triggers)

`retryPendingAsaTokens` in `apps/worker/src/asa.ts`:

1. Selects up to 100 installs with `asa_status = 'pending'` and a non-null `asa_token`, oldest `asa_token_at` first (index `idx_installs_asa_pending`).
2. For each one, if the token arrived more than 24 hours ago (`ASA_TOKEN_TTL_MS`), the row is settled as `expired` without calling Apple. Apple answers 404 forever for such tokens.
3. Otherwise it makes exactly one `POST https://api-adservices.apple.com/api/v1/` with the token as a `text/plain` body and increments `asa_attempts`:
   - `200` with `attribution: true`: status `resolved`, Apple's record stored in `asa_attribution` (snake_case: `campaign_id`, `ad_group_id`, `keyword_id`, `ad_id`, `conversion_type`, `claim_type`, `click_date`, `impression_date`, `country_or_region`, `supply_placement`), and `app.install_updated` goes to the webhooks that take the install's app.
   - `200` with `attribution: false`: status `no_attribution`.
   - `400`: status `invalid`.
   - `404` (minted too recently): stays `pending`.
   - `5xx`, a network error or a malformed body: stays `pending`.
4. Whenever a status is settled, `asa_resolved_at` is set and `asa_token` is nulled: the token is a one-time credential and is never kept.

More than 100 pending tokens are spread over successive passes. The three inline attempts the install request itself makes, five seconds apart, are described on [Attribution internals](/self-hosting/attribution-internals/).

## Daily rollups (both triggers)

`buildRollups` (`apps/worker/src/rollups.ts`) fills `link_daily`: per account, link, UTC day and platform (`ios`, `android`, `desktop`, `other`), the clicks, first installs and the credited ones, app opens, leads, net revenue in the account's currency, and the events credited to a link because it re-opened the app. Installs and events no link earned sit under the slug `''`. The rows are rebuilt from the raw rows, a whole day at a time and never on the request path, so a tap costs no extra write.

Each account has a `rollup_state` row: `through_day`, the last built day, and `frozen_through` (below). A run takes the accounts furthest behind and builds up to 40 steps of 31 days across them, so a new deployment, or an account with years of data, backfills itself over the next runs; nothing needs to be run by hand. Reads take every day after `through_day` from the raw rows, so the dashboard is exact while the rollups catch up.

A change to a raw row of a built day moves `through_day` back to the day before it, and the next run rebuilds from there: a late claim that credits an older install, a store notification that changes an amount or reverses a refund, an exchange rate that arrives late, a new re-engagement window on an app (every unfrozen day), a deleted app, a new account currency, and a permanent link delete, which also removes the link's rollup rows.

What reads the rollups: the Overview's clicks, installs, reinstalls, opens, leads and revenue, its clicks per day and per device, for windows over 7 days (which are whole UTC days, today included), and the lifetime installs, reinstalls, opens, leads and revenue of every link on the Links screen.

## Webhook retries (both triggers)

`retryDueDeliveries` (`apps/worker/src/webhooks.ts`) sends again every pending delivery whose `next_attempt_at` has passed and whose webhook is on, oldest first, up to 300 per run, ten at a time with a 10-second timeout each. A failure schedules the next attempt 5 minutes, 30 minutes, 2 hours, 6 hours and 24 hours after the previous one (six attempts in all), then marks the delivery failed. Because the job runs hourly, the 5- and 30-minute retries happen at the next :07. A larger backlog waits for the next run. See [Webhooks](/api/webhooks/#delivery-and-retries).

## CSV exports (both triggers)

`resumeExportJobs` (`apps/worker/src/exports.ts`) writes up to three large CSV exports that the request which asked for them did not finish: queued ones, and ones whose run held them for 15 minutes without finishing. Each starts the file over, at most three attempts in all. Only with an `EXPORTS` bucket. See [Export raw data](/api/export/#larger-exports).

The daily trigger also runs `purgeExportJobs`: a file is deleted from the bucket seven days after it was written (its job turns `expired`), and the job row a week after that.

## Custom domains (both triggers)

`sweepCustomDomains` (`apps/worker/src/customdomains.ts`) asks Cloudflare (and DNS, for a domain waiting for its CNAME) about the custom domains not checked for ten minutes while pending and for a day once active, and deletes the hostnames of removed or moved domains whose 7-day grace has ended, 50 of each per run. A domain that failed and was never removed gets the same grace a week later. Only when custom domains are configured. See [Custom domains](/self-hosting/custom-domains/).

## Device names (daily)

`refreshDeviceModels` (`apps/worker/src/devicemodels.ts`) downloads Google Play's supported-devices list (`storage.googleapis.com/play_public/supported_devices.csv`, about 5 MB) and stores the marketing names of the device models your installs reported in the last 400 days, never the whole list, in `device_models`. It runs when the last refresh is a week old, or a day old while installs report models the table lacks. A download that fails, is not the list or has fewer than 10,000 rows changes nothing. The Overview's Top devices joins the names at read time.

## Webhook delivery log (daily)

```sql
DELETE FROM webhook_deliveries WHERE created_at < <now minus 30 days>
```

## Expired temporary links (daily)

```sql
UPDATE temp_links SET deleted_at = <now>
WHERE expires_at < <now minus 24 hours> AND expired_url IS NULL AND deleted_at IS NULL
```

A temporary link therefore keeps answering for up to a day after it expires: the redirect shows the 410 page, `GET /api/v1/resolve/:user/:slug` answers `410 link_expired`, and `GET /api/v1/temp-links/:slug` still works. A link with an expired URL is never deleted this way: it keeps sending taps there until its owner deletes it. After the delete both answer 404 and the link leaves the lists (`?include_deleted=1` lists it). It is a soft delete, like the dashboard's **Delete**: the link's clicks, installs and events stay, and its slug stays reserved (`409` with `deleted: true`) until the link is restored or deleted permanently, which takes its history too, so a new link never inherits it. Its taps lose their device data 30 days later, as for every [deleted link](#deleted-links-daily). The dashboard's **Delete expired** button and `DELETE /api/admin/temp-links/expired` do the same at once for every expired link. See [Temporary links](/links/temporary-links/).

## Exchange rates (daily)

Downloads the ECB's daily euro reference rates into `fx_rates` (`date`, `currency`, `rate`, plus `EUR` = 1), then fills `events.revenue_base` for up to 2,000 amounts that have none and a rate can convert: the amount in the account's revenue currency, converted with the rate of the event's day (the last rate published on or before it, else the first after it). A failed download is logged and retried the next day; amounts keep waiting with `revenue_base` null and count as 0 in totals. An amount in a currency the ECB does not publish waits the same way, without holding up the others.

## Anonymization sweep (daily)

The cutoff is `now minus RETENTION_DAYS` (default 400; `0`, blank or non-numeric also means 400). An account with a shorter window of its own (Settings → **Data retention**, 1 to 400 days; `PUT /api/admin/settings/retention`) is then swept again with its own cutoff, in the same order; a longer one has no effect.

First, for every account whose rollups are built through the cutoff's day, the clicks, installs, events and app opens older than the cutoff are deleted, except events with a `transaction_id` (purchases, renewals, refunds), which stay and are nulled as below, so a restored purchase still counts once and a refund finds its purchase. `frozen_through` becomes the cutoff's day: those days' totals now live only in `link_daily` and are never rebuilt (a later change of account currency converts them with each day's exchange rates instead). This is what keeps storage at about the retention window's worth of rows; see [What it costs to run](/self-hosting/cost/).

Then `anonymiseExpiredDeviceData` runs one `db.batch`, so every statement commits or none does. Each account's pass is on its own: one that fails is logged (`[dectog] retention: sweep failed`) and runs again the next day, and the others, and the purges in the table, still run. The sweep also runs when the day's rollup build failed, since it deletes only the days the rollups hold. Rows of accounts whose rollups are not that far yet are kept for aggregate analytics with their personal columns set to `NULL`, as below.

### What is deleted, nulled and kept

| Table | Action | Condition | Columns affected |
|---|---|---|---|
| `ad_identifiers` | DELETE rows | `created_at < cutoff` | whole row |
| `device_days` | DELETE rows | `day` before the cutoff's day | whole row |
| `app_sessions` | DELETE rows | `started_at < cutoff` | whole row |
| `rejected_requests` | DELETE rows | `created_at` older than 30 days, whatever the retention setting | whole row |
| `events` | SET NULL | `created_at < cutoff` | `device_id`, `customer_id`, `metadata`, `ip_raw` |
| `customers` | SET NULL | `updated_at < cutoff` (last identify, not creation) | `name`, `email`, `phone`, `first_install_id` |
| `app_installs` | SET NULL | `created_at < cutoff` | `device_id`, `device_model`, `device_manufacturer`, `device_kind`, `cpu_type`, `os_build`, `screen_width`, `screen_height`, `screen_density`, `text_size`, `dark_mode`, `high_contrast`, `reduce_motion`, `utc_offset_min`, `connectivity_type`, `carrier_mcc`, `carrier_mnc`, `ip_raw`, `ip_hash`, `web_user_agent`, `meta_referrer`, `asa_token` |
| `app_opens` | SET NULL | `created_at < cutoff` | `device_id`, `install_id`, `click_id`, `ip_hash` |
| `clicks` | SET NULL | `clicked_at < cutoff` | `device_id`, `device_model`, `ip_raw`, `ip_hash`, `ua_raw`, `accept_language`, `region`, `city`, `asn`, `as_org`, `launch_referrer` |
| `clicks` (screen profile and device settings) | SET NULL | `clicked_at` older than `min(RETENTION_DAYS, 30)` days, only rows that still carry a value | `screen_width`, `screen_height`, `pixel_ratio`, `max_touch_points`, `text_size`, `dark_mode`, `high_contrast`, `reduce_motion`, `utc_offset_min` |
| `rate_limits` | DELETE rows | `window_start` older than the current 60 s window minus 2 | whole row |
| `erasures` | DELETE rows | `expires_at` passed: 8 days after a device or customer was erased | whole row |
| `webhook_deliveries` | DELETE rows | an account whose own window is under 30 days: older than its cutoff (otherwise the 30-day job below) | whole row |

The sweep also deletes what an erasure missed: for every tombstone still standing, an event of the erased device or customer stored in the minute after the erasure (the life of an edge location's copy of the account, `SDK_AUTH_CACHE_SECONDS`) with a client time from before it; see [Privacy and data](/self-hosting/privacy-and-data/#a-request-from-one-person).

The screen profile and the device settings are dropped early because the fingerprint reads them only inside its window, which never exceeds 30 days (720 hours). `enriched_at` is kept on purpose: it is the "first beacon wins" gate, and a null would let a late beacon rewrite the row.

### Deleted links (daily)

`anonymiseDeletedLinks` gives the clicks and app opens of a link deleted more than 30 days ago (`links.deleted_at` or `temp_links.deleted_at`) the same treatment as above, whatever their age: the `clicks` personal columns, screen profile and device settings, and the `app_opens` columns, are set to `NULL`, only on rows that still carry a value. Thirty days is the cap of the attribution window, so an install from a tap made before the delete can still match its click until then. The link's installs and events belong to your app's users rather than to the link, and keep the `RETENTION_DAYS` schedule. A deleted link's counts stay; a permanent delete removes the rows instead.

### What stays after the cutoff

- **Clicks:** `id`, `user_id`, `username`, `link_slug`, `link_kind`, `source`, `device_type`, `os`, `os_major`, `browser`, `country`, `session_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `metadata`, `clicked_at`, `referrer` (origin only), `enriched_at`, `lang`, `os_minor`, `connection_type`, `bot_score`, `link_params`, `client_click_time`, `origin`.
- **Installs:** everything not listed above, including `install_referrer` (which contains `dtg_click=<id>` and `dtg_l=<username>/<slug>`), `metadata`, `asn`, `timezone`, `language`, `lang`, `os`, `os_version`, `os_major`, `os_minor`, `cpu_family`, `clipboard_slug`, `package_name`, `installer_package`, `is_physical_device`, the install and referrer timestamps, `fraud_flags`, the whole attribution verdict (`matched`, `matched_slug`, `matched_click_id`, `match_source`, `referrer_source`, `match_confidence`, `match_score`, `candidate_count`, `routing_click_id`, `fp_shadow_*`), `install_attempt_id`, `created_at_client`, `sent_at_client` and `asa_attribution`.
- **Events:** `type`, `event_name`, `revenue`, `currency`, `install_id`, `matched_slug`, `client_timestamp`, `created_at`.
- **Customers:** `customer_id` (the id your app chose), `created_at`, `updated_at`.
- **App opens:** `username`, `slug`, `app_version`, `os`, `created_at`.

### Tables the sweep never touches

`users`, `apps`, `links`, `temp_links` (the expiry delete only sets `deleted_at`), `audit_events` (kept as long as the account), `blog_categories`, `blog_posts`, `contact_messages` and `password_resets`. Contact-form messages and used or expired reset tokens (hashes only) therefore accumulate until someone deletes them: owners can delete messages in the dashboard; `password_resets` rows can only be removed with `wrangler d1 execute`.

### Limits

- An account can shorten its window, never lengthen it past `RETENTION_DAYS`.
- Past the cutoff, raw rows are deleted once their day is in the rollups, and only anonymized until then. Within the retention window, a tenant can delete a link permanently, or erase one device or customer (see [Privacy and data](/self-hosting/privacy-and-data/#a-request-from-one-person)); a plain delete keeps the rows.
- The sweep runs once a day at 03:17 UTC. Data older than the cutoff can exist for up to 24 hours before it is anonymized, and a Worker that is undeployed or erroring skips its runs silently.

### Checking that it ran

D1 keeps no job history. Confirm with a query against the oldest rows, for example:

```bash
npx wrangler d1 execute dectog --remote --env production \
  --command "SELECT COUNT(*) FROM clicks WHERE ip_raw IS NOT NULL AND clicked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-400 days')"
```

A count of 0 means the last sweep covered everything older than the cutoff. To see how far the rollups are:

```bash
npx wrangler d1 execute dectog --remote --env production \
  --command "SELECT user_id, through_day, frozen_through FROM rollup_state ORDER BY through_day LIMIT 20"
```

`test/retention.test.ts` and `test/rollups.test.ts` in the Worker repository pin the behavior described on this page.
