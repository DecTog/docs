---
title: Database and migrations
description: The 16 D1 tables, every migration file and what it does, the append-only rule, and the typed data layer that keeps schema, row types and SQL in step.
sidebar:
  order: 6
---

DecTog stores everything in one Cloudflare D1 (SQLite) database, bound as `DB`. The Worker talks to it with raw, parameterized SQL; there is no ORM. The rules are in `docs/DATA-LAYER.md` in the server repository and summarized below.

## Tables

The schema at migration 0027 has 16 tables (`apps/worker/src/db/tables.ts`). Every table is scoped by `user_id` (the tenant) except the four platform tables at the end.

| Table | One line |
|---|---|
| `users` | Accounts: email, PBKDF2 password hash, username (the link subdomain), `api_key_hash` + `key_prefix`, the encrypted viewable key `api_key_enc`, `role` (`owner` or `user`), `google_sub` |
| `apps` | Registered apps: store identifiers and URLs, schemes, fallback URL, social preview, webhook URL and secret, interstitial, tap-to-store, strict fraud mode, Facebook App ID, OEM store URLs, low-entropy window |
| `links` | Permanent short links: slug (unique per tenant together with `temp_links`), optional target, metadata JSON, `click_count`, social preview, deep-link paths, redirect and fallback URLs, tracking defaults (`label`, `campaign`, `adgroup`, `creative`) |
| `temp_links` | Temporary links: slug, target, `ttl_seconds`, `expires_at`, social preview; no counters |
| `clicks` | One row per recorded tap or in-app open: link, device and browser, geo and ASN, hashed IP (raw IP only with `STORE_RAW_IP=1`), UTM, `link_params`, beacon screen profile, client hints, `origin` (`redirect`, `sdk`, `synthesized_referrer`) |
| `app_installs` | One row per install registration: device tier, referrer telemetry, the attribution verdict, fraud flags, shadow match, Apple Search Ads lifecycle, idempotency key |
| `ad_identifiers` | Advertising id per install, isolated so it is never joined to the device tier |
| `customers` | The tenant's own user identities from `identify` events: `customer_id`, name, email, phone, `first_install_id` |
| `events` | `identify`, `lead`, `conversion` and `custom` events with revenue, `matched_slug` denormalized at insert, metadata JSON, raw IP only with `STORE_RAW_IP=1` |
| `device_pings` | One row per SDK init ping (device, app version, OS), collected for DAU and retention read-outs that are not built yet; nothing reads the table today |
| `app_opens` | Warm opens: a link opened an already-installed app (slug, click id, device, hashed IP) |
| `rate_limits` | Fixed-window counters keyed by account id, `dev:<account>:<device>`, `ip:<account>:<hash>` or `webcollect:<hash>` |
| `blog_categories` | Marketing-site blog categories (platform-wide, owner-managed) |
| `blog_posts` | Blog posts: Tiptap HTML plus optional block JSON, published flag and dates |
| `contact_messages` | Submissions from the public contact form |
| `password_resets` | Single-use reset tokens, stored as SHA-256 hashes with expiry and `used_at` |

There are no foreign-key constraints. Cascades (deleting a link, deleting an app, unlinking a category) are done in the API layer.

## Migrations

`apps/worker/migrations/` holds one `.sql` file per change. `wrangler d1 migrations apply` runs the files that are not yet recorded in the `d1_migrations` table, in filename order, and the test setup (`test/setup.ts`) applies them the same way with `localeCompare`. Two files share the number 0012; `0012_blog.sql` sorts before `0012_mobile_interstitial.sql`, and both apply. Do not renumber them.

| File | Purpose |
|---|---|
| `0001_init` | `users` (plain-text API key), `apps`, `links`, `temp_links`, `clicks`, `app_installs` and the first indexes |
| `0002_attribution_indexes` | Replaces the global IP index with `clicks (user_id, ip_hash, clicked_at)`; adds `app_installs (matched_click_id)` |
| `0003_hashed_api_keys` | Rebuilds `users` with `api_key_hash` + `key_prefix`. **Destructive:** existing keys become unusable `legacy:` hashes and the migration deletes every row in `links`, `temp_links`, `clicks`, `app_installs` and `apps`. It was written for a pre-release database; on a fresh database it runs on empty tables. |
| `0004_rate_limits` | `rate_limits` |
| `0005_device_data` | Device-tier columns on `clicks` and `app_installs`, `is_reinstall`, the device index, `ad_identifiers` |
| `0006_social_preview` | `og_*` on `apps` and `links` |
| `0007_temp_link_social` | `og_*` on `temp_links` |
| `0008_install_webhook` | `install_webhook_url`, `install_webhook_secret` on `apps` |
| `0009_app_scheme` | `ios_app_scheme`, `android_app_scheme` |
| `0010_click_referrer` | `clicks.referrer` (origin only, analytics) |
| `0011_link_routing` | Deep-link paths, `redirect_url`, `fallback_url` on `links` |
| `0012_blog` | `blog_categories`, `blog_posts`, `contact_messages` |
| `0012_mobile_interstitial` | `apps.mobile_interstitial`; beacon columns `screen_width`, `screen_height`, `pixel_ratio`, `max_touch_points`, `enriched_at` on `clicks` |
| `0013_auth_flows` | `password_resets` |
| `0014_user_roles` | `users.role` (default `user`); promotes the oldest existing account to `owner` |
| `0015_optional_link_target` | Rebuilds `links` and `temp_links` so `target` is nullable (copies every row) |
| `0016_events_pipeline` | `app_installs.match_source`; `customers`, `events`, `device_pings`; `ip_raw` on `clicks` and `app_installs`. Its header comment says customers store "hashes only"; the code stores name, email and phone in plain text. |
| `0017_antifraud_matching` | Click-time signals (`ua_raw`, `accept_language`, `lang`, `os_major`, `ua_arch`, `connection_type`, geo, `asn`, `as_org`, `bot_score`); install provenance and fraud columns (`web_user_agent`, `cpu_family`, `package_name`, `is_physical_device`, `installer_package`, referrer timestamps, `meta_referrer`, `referrer_source`, `clipboard_slug`, `fraud_flags`); `apps.strict_fraud_mode`, `apps.fb_app_id`; `app_opens` |
| `0018_install_times` | `install_time`, `update_time` |
| `0019_meta_referrer_is_ct` | `meta_referrer_is_ct` |
| `0020_customer_indexes` | Customers list and events-by-customer indexes |
| `0021_google_sign_in` | `users.google_sub` with a unique partial index |
| `0022_link_params` | `clicks.link_params`; `label`, `campaign`, `adgroup`, `creative` on `links` |
| `0023_api_key_viewable` | `users.api_key_enc` |
| `0024_auto_signup_leads` | Index for the one-signup-lead-per-customer check |
| `0025_shared_device_index` | `events (user_id, device_id, customer_id)` |
| `0026_attribution_reliability` | Install contract v2: `install_attempt_id` with a unique partial index, attempt and client timestamps, referrer telemetry and server timestamps, `install_state`, `first_install_ts`, `match_confidence`, `match_score`, `candidate_count`, `routing_click_id`, `fp_shadow_*`, `asn`, `asa_token`, `asa_attribution`, `claimed_at`, `updated_at`; `clicks.client_click_time`, `launch_referrer`, `origin`; `apps.ios_tap_to_store`, OEM store URLs, `low_entropy_window_hours`; the `(user_id, ip_hash, created_at)` install index |
| `0027_apple_search_ads` | `asa_status`, `asa_attempts`, `asa_token_at`, `asa_resolved_at` and the pending-token index |
| `0028_claim_source` | `claim_source` on `app_installs`: which late signal upgraded the install |
| `0029_sdk_identity` | `sdk_name` and `sdk_version` on `app_installs`, `events` and `clicks` |

### Commands

```bash
cd apps/worker
npm run db:migrate                                              # local: wrangler d1 migrations apply DB --local
npx wrangler d1 migrations list DB --remote --env production    # what is pending
npx wrangler d1 migrations apply DB --remote --env production   # production
npx wrangler d1 execute dectog --local --command "SELECT name FROM sqlite_master WHERE type='table'"
npx wrangler d1 execute dectog --remote --env production --command "SELECT COUNT(*) FROM users"
```

`DB` is the binding name and `dectog` the database name; `migrations` accepts the binding, `execute` is shown with the name. The local database lives under `apps/worker/.wrangler/state/v3/d1`; delete that directory to start over. `npm run db:migrate:remote` runs the production command above.

### The append-only rule

Once a migration has been applied to a shared or remote database, its file is never edited, renamed or deleted. A change to the schema is a new file with the next number, and its file name goes into `apps/worker/src/migrations.ts`, the list [`/readyz`](/api/overview/#health-check) compares with `d1_migrations`; `test/readyz.test.ts` fails until the list and the folder agree. Rolling back a Worker does not roll back a migration, and nothing in the repository reverts one; see [Deploy](/self-hosting/deploy/).

## The typed data layer

Three artifacts describe every table, and two checks keep them identical:

1. **Row types** in `apps/worker/src/types.ts` (`UserRow`, `AppRow`, `LinkRow`, `ClickRow`, `InstallRow`, and so on). Every read carries one: `.first<LinkRow>()`, `.all<AppRow>()`.
2. **The column registry** in `apps/worker/src/db/tables.ts`: `TABLES.<name> = table<Row>({ column: true, … })`. Its type is `Record<keyof Row, true>`, so a key missing from or unknown to the row type is a compile error (`npm run typecheck`).
3. **The migrations**, compared with the registry by `test/schema.test.ts`: for every registry entry `PRAGMA table_info(<table>)` must list exactly the registered columns, and every table in `sqlite_master` (ignoring `sqlite_*`, `_cf_*` and `d1_migrations`) must have a registry entry.

Writes go through `apps/worker/src/db/write.ts`:

- `insertStmt(db, table, row)` takes the full row type and derives the column list from the object's keys, checked against the registry. Adding a column to a row type turns every insert site into a compile error until it supplies a value; an `undefined` value throws at runtime (`bind null instead`). It returns a prepared statement, so it works inside `db.batch()`.
- `updateById(db, table, id, patch)` takes a typed partial patch for tables keyed by `id` and skips `undefined` keys.
- Expression updates (`click_count = click_count + 1`), the analytics, attribution, rate-limit and cron SQL stay as raw statements with `?` placeholders. Request input never reaches SQL text.
- The link, temp-link and user lookups live once in `src/db/links.ts`, `tempLinks.ts` and `users.ts`.
- Time cutoffs are computed in JavaScript (`isoDaysAgo` in `util.ts`) and bound as ISO strings. Stored timestamps are JavaScript ISO strings (`…T…Z`); SQLite's `datetime('now', …)` emits `YYYY-MM-DD HH:MM:SS`, and because `T` sorts after a space the two never compare correctly.

### Adding a column

1. Create `apps/worker/migrations/0028_<name>.sql` with the `ALTER TABLE … ADD COLUMN` (nullable, or with a default).
2. Add the field to the row type in `types.ts` and the key to the registry in `tables.ts`.
3. Fix every insert site the compiler now flags (`npm run typecheck`).
4. `npm run db:migrate` locally, then `npm test`: `schema.test.ts` fails until the three agree.
5. Deploy with the release routine (migrations first, then the Worker).
