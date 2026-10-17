---
title: Database and migrations
description: The 35 D1 tables, the schema file, the append-only rule, and the typed data layer that keeps schema, row types and SQL in step.
sidebar:
  order: 6
---

DecTog stores everything in one Cloudflare D1 (SQLite) database, bound as `DB`. The Worker talks to it with raw, parameterized SQL; there is no ORM. The rules are in `docs/DATA-LAYER.md` in the server repository and summarized below.

## Tables

The schema has 35 tables (`apps/worker/src/db/tables.ts`). Every table is scoped by the account (`user_id`, or `tenant_id` in `memberships` and `invites`) except the platform tables: `rate_limits`, the blog and contact tables, `fx_rates` and the device model tables.

| Table | One line |
|---|---|
| `users` | Accounts: email, PBKDF2 password hash, username (the link subdomain), `api_key_hash` + `key_prefix` (the account key is never stored readable), `role` (`owner` or `user`), `google_sub`, `retention_days` (the account's own window, or `NULL`), `test_of` (on a test environment: its live account), `session_epoch` (raised to end every session) |
| `apps` | Registered apps: store identifiers and URLs, schemes, fallback URL, social preview, interstitial, tap-to-store, strict fraud mode, Facebook App ID, OEM store URLs, low-entropy window |
| `links` | Permanent short links: slug (unique per tenant together with `temp_links`), optional target, metadata JSON, `click_count`, social preview, deep-link paths, redirect and fallback URLs, tracking defaults (`label`, `campaign`, `adgroup`, `creative`) |
| `temp_links` | Temporary links: slug, target, `ttl_seconds`, `expires_at`, social preview; no counters |
| `clicks` | One row per recorded tap or in-app open: link, device and browser, geo and ASN, hashed IP (raw IP only with `STORE_RAW_IP=1`), UTM, `link_params`, beacon screen profile and device settings, client hints, `origin` (`redirect`, `sdk`, `synthesized_referrer`) |
| `app_installs` | One row per install registration: device tier, referrer telemetry, the attribution verdict, fraud flags, shadow match, Apple Search Ads lifecycle, idempotency key |
| `ad_identifiers` | Advertising id per install, isolated so it is never joined to the device tier |
| `customers` | The tenant's own user identities from `identify` events: `customer_id`, name, email, phone, `first_install_id` |
| `events` | `identify`, `lead`, `conversion` and `custom` events with revenue, `matched_slug` denormalized at insert, metadata JSON, raw IP only with `STORE_RAW_IP=1` |
| `app_sessions` | One row per app session with screen views, keyed by the SDK's `session_id` and written once per flush: the device, install, customer and link open the session is first known by, the device time of its first screen, the screen count and the first 50 screens as JSON. The Screens lists of customers and installs and the links page's Screens after open read it |
| `device_days` | One row per device and UTC day the app started (device, app version, OS, the first ping's time): with app opens and events, the activity behind the Overview's Retention card |
| `app_opens` | Warm opens: a link opened an already-installed app (slug, click id, device, hashed IP) |
| `rate_limits` | Fixed-window counters keyed by account id, `dev:<account>:<device>`, `ip:<account>:<hash>` or `webcollect:<hash>` |
| `blog_categories` | Marketing-site blog categories (platform-wide, owner-managed) |
| `blog_posts` | Blog posts: Tiptap HTML plus optional block JSON, published flag and dates |
| `contact_messages` | Submissions from the public contact form |
| `password_resets` | Single-use reset tokens, stored as SHA-256 hashes with expiry and `used_at` |
| `api_keys` | SDK keys (`dtg_pub_…`) and site keys (`dtg_site_…`, with their allowed `origins`): name, kind, scopes, SHA-256 of the key, prefix, the encrypted viewable key, `last_used_at`, `revoked_at` |
| `link_templates` | Named defaults a link can take (`links.template_id`), as JSON |
| `referrals` | One row per referred install: the referring and the referred customer, the link, the match source |
| `rejected_requests` | SDK calls refused with 400 or 422, for the debugging view: route, reason, the body's hash and size, never the body; 30 days |
| `app_store_endpoints` | Per app, the secret token in its Apple and Google store-notification URLs, and the Pub/Sub service account Google signs with |
| `store_notifications` | The store notifications received, with their outcome; 90 days |
| `fx_rates` | The ECB's daily euro reference rates, for revenue in the account's currency |
| `link_daily` | The daily rollups: per account, link, UTC day and platform, the clicks, installs, opens, leads and net revenue |
| `rollup_state` | Per account, the last day the rollups hold (`through_day`) and the last day whose raw rows are gone (`frozen_through`) |
| `webhooks` | Webhook endpoints: URL, optional app, events, encrypted signing secret, failure count and why one turned off |
| `webhook_deliveries` | One row per event and webhook: the envelope's data, attempts, the last response; 30 days |
| `export_jobs` | CSV exports past `EXPORT_STREAM_MAX_ROWS` rows: the query, progress, the R2 key and when the file goes |
| `device_models`, `device_model_refresh` | Marketing names (brand, name) for the Android models installs reported, keyed by the lowercased model, and when Google's list was last read |
| `memberships` | A person's role (`owner`, `member`, `viewer`) in another person's account; keyed by account and person |
| `invites` | Team invitations: the account, the invited email and role, the SHA-256 of the token, expiry and when accepted |
| `erasures` | One row per erased device or customer for 8 days: the SHA-256 of the account, the kind and the id, never the id itself, with when it was erased; events queued earlier are dropped on arrival |
| `audit_events` | The audit log: per account, entries numbered by `seq` (the key, with `user_id`), the action, who acted, the target, the changed fields with secrets redacted, hashed IP, user agent, request id. Only ever inserted; kept as long as the account |
| `custom_domains` | Each account's custom link domain: the Cloudflare hostname id, the state, the DNS records to add, errors, the checks, the suspension and its end. The active one is also `users.custom_domain`. |

There are no foreign-key constraints. Cascades (deleting a link, deleting an app, unlinking a category) are done in the API layer.

## Migrations

`apps/worker/migrations/` holds the schema file plus the migrations after it, which together create the 36 tables above and their 54 indexes. `wrangler d1 migrations apply` runs the files in the folder that are not yet recorded in the database's `d1_migrations` table, in filename order, and the test setup (`test/setup.ts`) applies them the same way with `localeCompare`. A schema change is the next numbered file.

The 63 migrations written before the first release were combined into `0001_schema.sql` on 2026-10-16; the server repository's git history keeps those files. A local database made before then has the old files recorded, so `migrations apply` stops at the first table it creates (`table users already exists`): delete `apps/worker/.wrangler/state/v3/d1` and apply again.

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
