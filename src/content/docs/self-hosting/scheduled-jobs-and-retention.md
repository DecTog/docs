---
title: Scheduled jobs and retention
description: The two cron triggers, what each one runs, and exactly which columns the daily anonymization nulls, deletes or keeps.
sidebar:
  order: 4
---

The Worker has two cron triggers, declared identically at the top level and in `env.production` of `apps/worker/wrangler.jsonc`. Cloudflare evaluates cron expressions in UTC. The handler is `scheduled` in `apps/worker/src/index.ts`.

| Expression | Fires | Runs |
|---|---|---|
| `7 * * * *` | Every hour at :07 | Apple Search Ads retry only |
| `17 3 * * *` | Daily at 03:17 UTC | Apple Search Ads retry, then the temporary-link purge and the anonymization sweep |

The code branches on the expression: `7 * * * *` returns after the Apple Search Ads pass; any other expression runs everything. All three jobs run inside `waitUntil`, so a failure in one does not stop the others. There is no job-level logging beyond console warnings.

`wrangler dev` does not fire crons. Start it with `--test-scheduled` and call `http://localhost:8787/__scheduled?cron=17+3+*+*+*` (or `7+*+*+*+*`) to run a trigger by hand; see the [Local quick start](/self-hosting/local-quick-start/).

## Apple Search Ads retry (both triggers)

`retryPendingAsaTokens` in `apps/worker/src/asa.ts`:

1. Selects up to 100 installs with `asa_status = 'pending'` and a non-null `asa_token`, oldest `asa_token_at` first (index `idx_installs_asa_pending`).
2. For each one, if the token arrived more than 24 hours ago (`ASA_TOKEN_TTL_MS`), the row is settled as `expired` without calling Apple. Apple answers 404 forever for such tokens.
3. Otherwise it makes exactly one `POST https://api-adservices.apple.com/api/v1/` with the token as a `text/plain` body and increments `asa_attempts`:
   - `200` with `attribution: true`: status `resolved`, Apple's record stored in `asa_attribution` (snake_case: `campaign_id`, `ad_group_id`, `keyword_id`, `ad_id`, `conversion_type`, `claim_type`, `click_date`, `impression_date`, `country_or_region`, `supply_placement`), and the install webhook of the install's app fires with `event: "app.install_updated"` if that app has a URL and secret.
   - `200` with `attribution: false`: status `no_attribution`.
   - `400`: status `invalid`.
   - `404` (minted too recently): stays `pending`.
   - `5xx`, a network error or a malformed body: stays `pending`.
4. Whenever a status is settled, `asa_resolved_at` is set and `asa_token` is nulled: the token is a one-time credential and is never kept.

More than 100 pending tokens are spread over successive passes. The three inline attempts the install request itself makes, five seconds apart, are described on [Attribution internals](/self-hosting/attribution-internals/).

## Temporary-link purge (daily)

```sql
DELETE FROM temp_links WHERE expires_at < <now minus 24 hours>
```

A temporary link therefore keeps answering for up to a day after it expires: the redirect shows the 410 page and `GET /api/v1/resolve/:user/:slug` still returns `200` with `is_expired: true`. After the purge the slug is free again and both answer 404. The link's clicks and the installs attributed to them are kept; only the `temp_links` row goes. The dashboard's "Delete expired" button and `DELETE /api/admin/temp-links/expired` remove expired links immediately with the same effect. See [Temporary links](/links/temporary-links/).

## Exchange rates (daily)

Downloads the ECB's daily euro reference rates into `fx_rates` (`date`, `currency`, `rate`, plus `EUR` = 1), then fills `events.revenue_base` for up to 2,000 amounts that have none: the amount in the account's revenue currency, converted with the rate of the event's day (the last rate published on or before it, else the first after it). A failed download is logged and retried the next day; amounts keep waiting with `revenue_base` null and count as 0 in totals.

## Anonymization sweep (daily)

`anonymiseExpiredDeviceData` runs one `db.batch`, so every statement commits or none does. The cutoff is `now minus RETENTION_DAYS` (default 400; `0`, blank or non-numeric also means 400). Rows are kept for aggregate analytics; the personal columns are set to `NULL`.

### What is deleted, nulled and kept

| Table | Action | Condition | Columns affected |
|---|---|---|---|
| `ad_identifiers` | DELETE rows | `created_at < cutoff` | whole row |
| `device_pings` | DELETE rows | `created_at < cutoff` | whole row |
| `rejected_requests` | DELETE rows | `created_at` older than 30 days, whatever the retention setting | whole row |
| `events` | SET NULL | `created_at < cutoff` | `device_id`, `customer_id`, `metadata`, `ip_raw` |
| `customers` | SET NULL | `updated_at < cutoff` (last identify, not creation) | `name`, `email`, `phone`, `first_install_id` |
| `app_installs` | SET NULL | `created_at < cutoff` | `device_id`, `device_model`, `device_manufacturer`, `device_kind`, `cpu_type`, `os_build`, `screen_width`, `screen_height`, `screen_density`, `connectivity_type`, `carrier_mcc`, `carrier_mnc`, `ip_raw`, `ip_hash`, `web_user_agent`, `meta_referrer`, `asa_token` |
| `app_opens` | SET NULL | `created_at < cutoff` | `device_id`, `install_id`, `click_id`, `ip_hash` |
| `clicks` | SET NULL | `clicked_at < cutoff` | `device_id`, `device_model`, `ip_raw`, `ip_hash`, `ua_raw`, `accept_language`, `region`, `city`, `asn`, `as_org`, `launch_referrer` |
| `clicks` (screen profile) | SET NULL | `clicked_at` older than `min(RETENTION_DAYS, 30)` days, only rows that still carry a value | `screen_width`, `screen_height`, `pixel_ratio`, `max_touch_points` |
| `rate_limits` | DELETE rows | `window_start` older than the current 60 s window minus 2 | whole row |

The screen profile is dropped early because it is only ever read inside the fingerprint window, which never exceeds 30 days (720 hours). `enriched_at` is kept on purpose: it is the "first beacon wins" gate, and a null would let a late beacon rewrite the row.

### What stays after the cutoff

- **Clicks:** `id`, `user_id`, `username`, `link_slug`, `link_kind`, `source`, `device_type`, `os`, `os_major`, `browser`, `country`, `session_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `metadata`, `clicked_at`, `referrer` (origin only), `enriched_at`, `lang`, `ua_arch`, `connection_type`, `bot_score`, `link_params`, `client_click_time`, `origin`.
- **Installs:** everything not listed above, including `install_referrer` (which contains `dtg_click=<id>` and `dtg_l=<username>/<slug>`), `metadata`, `asn`, `timezone`, `language`, `lang`, `os`, `os_version`, `os_major`, `cpu_family`, `clipboard_slug`, `package_name`, `installer_package`, `is_physical_device`, the install and referrer timestamps, `fraud_flags`, the whole attribution verdict (`matched`, `matched_slug`, `matched_click_id`, `match_source`, `referrer_source`, `match_confidence`, `match_score`, `candidate_count`, `routing_click_id`, `fp_shadow_*`), `install_attempt_id`, `created_at_client`, `sent_at_client` and `asa_attribution`.
- **Events:** `type`, `event_name`, `revenue`, `currency`, `install_id`, `matched_slug`, `client_timestamp`, `created_at`.
- **Customers:** `customer_id` (the id your app chose), `created_at`, `updated_at`.
- **App opens:** `username`, `slug`, `app_version`, `os`, `created_at`.

### Tables the sweep never touches

`users`, `apps`, `links`, `temp_links` (apart from the expiry purge), `blog_categories`, `blog_posts`, `contact_messages` and `password_resets`. Contact-form messages and used or expired reset tokens (hashes only) therefore accumulate until someone deletes them: owners can delete messages in the dashboard; `password_resets` rows can only be removed with `wrangler d1 execute`.

### Limits

- One `RETENTION_DAYS` for the whole deployment; there is no per-tenant value.
- The sweep anonymizes; it does not delete installs, clicks or events. Deleting a link is the only cascade a tenant can trigger (see [Privacy and data](/self-hosting/privacy-and-data/)).
- The sweep runs once a day at 03:17 UTC. Data older than the cutoff can exist for up to 24 hours before it is anonymized, and a Worker that is undeployed or erroring skips its runs silently.

### Checking that it ran

D1 keeps no job history. Confirm with a query against the oldest rows, for example:

```bash
npx wrangler d1 execute dectog --remote --env production \
  --command "SELECT COUNT(*) FROM clicks WHERE ip_raw IS NOT NULL AND clicked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-400 days')"
```

A count of 0 means the last sweep covered everything older than the cutoff. `test/retention.test.ts` in the Worker repository pins the behavior described on this page.
