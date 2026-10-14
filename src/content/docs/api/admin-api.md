---
title: Admin API
description: The cookie-session routes the dashboard uses, listed for self-hosters who automate against their own deployment. Not a stable contract.
sidebar:
  order: 7
---

:::caution[Not a stable contract]
Everything under `/api/admin` and `/api/auth` exists to serve the dashboard. Routes, shapes and error strings change whenever the dashboard does, without notice. The stable, versioned surface is `/api/v1` ([API overview](/api/overview/)). Use this page when you automate your **own** deployment and accept that the next release may break your script.
:::

## Session basics

- Authentication is a cookie, `dectog_session`, set by login, signup and Google sign-in. It holds an HS256 JWT signed with `JWT_SECRET` that expires after 30 days. Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when the request came over https. Login without `remember` sets a browser-session cookie (the token inside still lasts 30 days); `remember: true`, signup and Google sign-in set `Max-Age` of 30 days.
- Logout deletes the cookie; tokens are never revoked server-side. A password reset does not end existing sessions. Rotating `JWT_SECRET` signs everyone out.
- Routes marked **session** answer `401` with code `not_authenticated` without a cookie and `401` with code `invalid_session` for a bad or expired token or a deleted user.
- Routes marked **owner** additionally require the `owner` role (`403 {"error": {"code": "forbidden", "message": "Owner access required"}}`). The owner is the account created by bootstrap or the demo seed; signup and Google sign-in always create `user`, and there is no route to change roles. See [Account and sign-in](/dashboard/account-and-sign-in/).
- Every query is scoped to the signed-in account. There is no cross-account view.
- CORS on `/api/admin/*`: `access-control-allow-origin` is `WEB_URL`, with `access-control-allow-credentials: true`, `vary: Origin` and allowed headers `authorization, content-type, x-request-id`; `x-request-id` is exposed. `OPTIONS /api/*` answers 204.
- Errors use the same `{"error": {"code", "message", "request_id"}}` envelope as the v1 API ([Errors](/api/overview/#errors)). A body that is not valid JSON answers `400 {"error": {"code": "invalid_request", "message": "Invalid JSON body"}}`.

```bash title="Log in and call a session route with curl"
curl -sS -c jar.txt -X POST https://app.dectog.com/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…","remember":true}'
curl -sS -b jar.txt https://app.dectog.com/api/admin/links | jq '.links[] | {slug, click_count, installs}'
```

Self-hosted deployments replace `https://app.dectog.com` with their own `PUBLIC_BASE_URL`.

## Accounts and sign-in

| Method and path | Auth | Purpose | Notable responses |
|---|---|---|---|
| `POST /api/admin/bootstrap` | `x-bootstrap-token` header when `ENVIRONMENT=production` or `BOOTSTRAP_TOKEN` is set | First account on an empty database. See below. | `201 {ok, email, username, api_key, demo}`; `403 Bootstrap not permitted`; `409 Already bootstrapped` |
| `POST /api/admin/signup` | public | `{email, password, username}`. Creates a `user` account and its first SDK key, sets a 30-day cookie, returns both keys. | `201 {user, api_key, sdk_key}` (`api_key` is the account key); `403 Signup is currently closed` (`OPEN_SIGNUPS=0`); `400 Please enter a valid email address`, a password-rule message, `Username must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric`, `Username '<name>' is reserved`; `409 An account with this email or username already exists` |
| `POST /api/admin/login` | public | `{email, password, remember?}`. Email is trimmed and lower-cased. | `200 {user: {id, email, username, role, created_at}}` plus the cookie; `400 Email and password are required`; `401 Invalid email or password`; `429` over 10 attempts per minute from one IP. No per-account lockout. |
| `POST /api/admin/logout` | public | Deletes the cookie. | `200 {ok: true}` |
| `GET /api/admin/me` | session | The signed-in account. | `200 {user: {id, email, username, role, created_at}}` |
| `POST /api/admin/forgot-password` | public | `{email}`. Creates a one-hour, single-use reset token (older unused tokens are cancelled) and emails `<WEB_URL>/reset-password?token=…` through Resend, or logs the link when `RESEND_API_KEY` is unset. | `200 {ok: true, message: "If that email exists, a reset link is on its way."}` whether or not the account exists; `429` over 5 requests per minute from one IP or 3 per minute for one address. |
| `POST /api/admin/reset-password` | public | `{token, password}`. Does not sign the user in. | `200 {ok: true}`; `400 Reset token is required`, a password-rule message, `This reset link is invalid or has expired`, `This reset link has already been used` |
| `GET /api/auth/config` | public | What the login page shows. | `200 {signupOpen, googleEnabled, linkRootDomain}`; `linkRootDomain` is `ROOT_DOMAIN`, or `null` when unset |
| `GET /api/auth/google/start` | public | 302 to Google's consent screen (authorization code with PKCE S256, `state`, scopes `openid email profile`, `prompt=select_account`). Sets `dectog_google_oauth` (10 minutes, path `/api/auth/google`). | `404 Google sign-in is not configured` when `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is unset |
| `GET /api/auth/google/callback` | public | Google's redirect target, `<WEB_URL>/api/auth/google/callback`. Signs in a linked account, links an existing account with the same verified email, or parks a new identity in `dectog_google_pending` (15 minutes). | 302 to `/dashboard`, `/login?google=choose_username`, or `/login?google_error=<reason>` with reason `not_configured`, `cancelled`, `expired`, `failed`, `other_google_account` or `signup_closed` |
| `GET /api/auth/google/pending` | pending cookie | The parked identity for the username step. | `200 {email, name}`; `404 Google sign-in expired — try again` |
| `POST /api/auth/google/complete` | pending cookie | `{username}`. Creates the account with a random password (set a real one through forgot-password). | `201 {user: {id, email, username, role: "user"}, api_key}`; `401 Google sign-in expired — try again`; `403 Signup is currently closed`; `400` username rules; `409 That username is taken` or `An account with this Google email already exists — sign in instead` |

Password rule for signup and reset: 8 to 72 characters with at least one lowercase letter, one uppercase letter and one digit (`Password must be at least 8 characters`, `Password must be less than 72 characters`, `Password must include a lowercase letter`, `Password must include an uppercase letter`, `Password must include a number`). Username rule: `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` after lower-casing; reserved: `app`, `www`, `api`, `links`, `dashboard`, `admin`, `mail`, `static`, `cdn`.

### Bootstrap

`POST /api/admin/bootstrap` has two body forms. Both answer `409 {"error": {"code": "conflict", "message": "Already bootstrapped"}}` once any user exists, and `201 {"ok": true, "email", "username", "api_key", "sdk_key", "demo"}` on success: `api_key` is the account key, `sdk_key` the first SDK key (`null` for the demo seed). Both can be viewed again in Settings, except the demo account key.

| Body | Result |
|---|---|
| `{"email", "password", "username"}` | Creates exactly that account with role `owner` and no demo data, in any environment. All three fields are required; password at least 12 characters (no other rule); username rules as above. Errors are `400` with `email, password and username are required`, `email is not a valid address`, `password must be at least 12 characters`, `username must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric`, `username '<name>' is reserved`, or `409 Username or email already exists`. `demo` is `false`. |
| empty, not JSON, or a JSON object with none of those three keys | Seeds the demo account `demo@dectog.local` / `demo1234` / username `demo` (role `owner`) with the demo app, links, clicks and installs. `demo` is `true`. In production this answers `403 {"error": {"code": "forbidden", "message": "Demo seed is disabled in production — provide email, password and username"}}`. |

The header check runs first: when `ENVIRONMENT=production` or `BOOTSTRAP_TOKEN` is set, `x-bootstrap-token` must equal `BOOTSTRAP_TOKEN`, otherwise `403 {"error": {"code": "forbidden", "message": "Bootstrap not permitted"}}`. In production without a configured token every call is refused. See [Local quick start](/self-hosting/local-quick-start/) and [Deploy](/self-hosting/deploy/).

## Settings

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/settings` | session | Account and link configuration. | `200 {email, username, key_prefix, api_key, link_mode, root_domain, public_base_url, example_link}`. `api_key` is the full key decrypted from its stored copy, or `null` for keys created before that copy existed (including the demo seed's key) or when `JWT_SECRET` changed since. Authentication keeps working in every one of those cases. |
| `POST /api/admin/settings/regenerate-key` | session | Replaces the account key's hash, prefix and stored copy in one update. The old key stops working immediately; SDK keys are untouched. | `200 {api_key, key_prefix}` |
| `GET /api/admin/keys` | session | SDK keys, active first, newest first. | `200 {keys: [{id, name, kind, prefix, key, scopes, environment, last_used_at, created_at, revoked_at}]}`; `key` is the full key (`null` once revoked or when it cannot be decrypted) |
| `POST /api/admin/keys` | session | `{name?, links_write?}`. Creates an SDK key; `links_write: true` adds the `links:write` scope. | `201 {id, name, key, prefix, scopes}`; `409` at 20 active keys |
| `POST /api/admin/keys/:id/revoke` | session | Revokes an SDK key of the account at once. | `200 {ok: true}`; `404 Key not found` (unknown, foreign or already revoked) |

See [Dashboard: Settings](/dashboard/settings/).

## Links

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/links` | session | Every link, newest first, no pagination; deleted links only with `?include_deleted=1`. | `200 {links: [...], temp_links: [...]}`. Each permanent link has every column (the lifecycle ones included), `metadata` parsed, plus `url`, `clicks_7d` (rolling 7 days), and lifetime `installs` (matched, non-reinstall), `opens`, `leads` and `revenue` (every currency summed, 2 decimals). Each temporary link has every column plus `url` and `is_expired`. |
| `POST /api/admin/links` | session | Same fields and rules as the v1 create, with the slug trimmed. | `201 {id, slug, target, url, click_count: 0, created_at, metadata}` (a subset of the v1 Link); `400 Invalid or missing slug`, `Invalid target: must be a valid http(s) URL`, `Unknown app_id`, the `og_*` and routing messages; `409 Slug already exists` with `slug` |
| `PUT /api/admin/links/:slug` | session | Same partial-update semantics as v1 (absent keeps, `null` or `""` clears), lifecycle fields included. | `200 {ok: true, link: <raw row>}`: `metadata` is still a JSON string and there is no `url`; `404 Link not found` |
| `DELETE /api/admin/links/:slug` | session | Soft delete, like v1; `?permanent=1` deletes the link and its clicks, attributed installs, events and app opens. | Always `200 {deleted: true}`, even for an unknown slug |
| `POST /api/admin/links/:slug/restore` | session | Restores a deleted link. | `200 {ok: true}`; `404 Link not found` |
| `POST /api/admin/temp-links` | session | Same fields and TTL rules as v1 (`ttlSeconds` default 900, `0` becomes 900, clamped to 60 to 2,592,000; auto slug `t_<10 hex>`). | `201 {id, slug, target, url, ttl_seconds, expires_at, created_at, og_title, og_description, og_image_url}`; `400 ttlSeconds must be a number`, `Invalid slug`; `409 Slug already exists` |
| `PUT /api/admin/temp-links/:slug` | session | `target`, `og_*` and the lifecycle fields (no `expires_at`). | `200 {ok: true}`; `404 Temporary link not found` |
| `DELETE /api/admin/temp-links/expired` | session | Deletes every temporary link of the account whose `expires_at` has passed. Their clicks and installs are kept. | `200 {deleted: <count>}` |
| `DELETE /api/admin/temp-links/:slug` | session | Soft delete; `?permanent=1` deletes with history, like permanent links. | Always `200 {deleted: true}` |
| `POST /api/admin/temp-links/:slug/restore` | session | Restores a deleted temporary link. | `200 {ok: true}`; `404 Temporary link not found` |

## Webhooks

The routes behind Apps → Webhooks; see [Webhooks](/api/webhooks/) for the envelope, the events and retries.

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/webhooks` | session | Every webhook of the account. | `200 {data: [Webhook], events, default_events}`; a Webhook is `{id, app_id, url, events, active, consecutive_failures, disabled_at, disabled_reason, created_at, updated_at}`, never its secret |
| `POST /api/admin/webhooks` | session | `{url, app_id?, events?}`; `app_id` null or absent takes every app's events; `events` defaults to all but `click.recorded`. | `201` Webhook plus `secret` (`whsec_` and 64 hex), the only time it is shown; `400 url must be a valid http(s) URL`, `Unknown event …`, `Unknown app_id` |
| `PUT /api/admin/webhooks/:id` | session | Any of `url`, `app_id`, `events`, `active` (boolean); `true` resets the failure count. | `200` Webhook; `404 Webhook not found` |
| `DELETE /api/admin/webhooks/:id` | session | Deletes the webhook and its delivery log. | `200 {deleted: true}`; `404` |
| `POST /api/admin/webhooks/:id/rotate-secret` | session | A new secret; the old one stops working at once. | `200` Webhook plus `secret` |
| `POST /api/admin/webhooks/:id/test` | session | Delivers `webhook.test` now; never retried, never counted. | `200` the logged Delivery |
| `GET /api/admin/webhooks/:id/deliveries?limit=` | session | The latest deliveries, newest first, `limit` 1 to 200 (default 50). | `200 {data: [Delivery]}`; a Delivery is `{id, webhook_id, event_id, event, data, attempt, status, http_status, response_excerpt, error, next_attempt_at, delivered_at, created_at, updated_at}` |
| `POST /api/admin/webhook-deliveries/:id/resend` | session | One more attempt now, with the same `event_id`. | `200` the Delivery after it |

## Apps

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/apps` | session | All apps, oldest first. The first one is the account's default app. | `200` bare array with every column; `android_sha256_fingerprints` parsed into an array. |
| `POST /api/admin/apps` | session | Create. `name` is the only required field. | `201 {id, name}`; `400 App name is required` or a field message |
| `PUT /api/admin/apps/:id` | session | Partial update: absent keeps, a blank `name` keeps the old name, `""` or `null` clears other fields. | `200 {ok: true}`; `404 App not found` |
| `GET /api/admin/apps/:id/setup` | session | The setup checklist for one app, computed, never stored. | `200 {app_id, done, total, steps: [{key, label, status: done\|todo\|skipped, detail}], rules: {aasa, assetlinks}}`; each `rules` entry is null for a platform not set up, else `[{id, ok, message}]`; `404 App not found` |
| `DELETE /api/admin/apps/:id` | session | Deletes the app; links bound to it get `app_id: null` and follow the default app from then on. Installs and clicks are untouched. | `200 {deleted: true}`; `404 App not found` |
| `GET /api/admin/custom-domain` | session | The account's custom link domain. | `200 {configured, target, domain: null \| {hostname, status, suspended, delete_after, cloudflare: {hostname_status, certificate_status}, dns_records: [{type, name, value, purpose}], errors, last_checked_at, activated_at, created_at, url_example}}` |
| `POST /api/admin/custom-domain` | session | `{hostname}`: a subdomain of at least three labels, not of this deployment. Creates the Cloudflare custom hostname with TXT validation. See [Custom domains](/links/custom-domains/). | `201` as above; `400 invalid_hostname`; `409 domain_exists`, `hostname_taken`, `not_configured`; `502 cloudflare_error` |
| `POST /api/admin/custom-domain/refresh` | session | Asks Cloudflare (and DNS) now. | `200` as above; `404` without a domain |
| `DELETE /api/admin/custom-domain` | session | Suspends a domain that served (served 7 more days, then deleted); deletes one that never did. | `200` as above |
| `POST /api/admin/custom-domain/restore` | session | Undoes a removal within the 7 days. | `200` as above; `404` when nothing is removed |
| `GET /api/admin/links/:slug/preview-check` | session | What Facebook, X, LinkedIn, Slack, Discord, WhatsApp, iMessage and Telegram show for one of your links (permanent or temporary): each crawler's user agent through the redirect engine (no click recorded), the image fetched as each. See [Social previews and QR](/links/social-previews-and-qr/#check-the-preview-on-each-platform). | `200 {url, checked_at, expected: {title, description, image, card}, platforms: [{id, name, result: ok \| not_crawler \| blocked \| error, status, location, seen, image: {url, result, status, content_type, bytes}, issues}]}`; `404 Link not found` |
| `GET /api/admin/og-preview?url=` | session | Fetches a public page server-side and extracts a social preview. Follows redirects, 8-second timeout, reads at most 512 KB, first tag wins (`og:title`, `twitter:title`, `<title>`; `og:description`, `twitter:description`, `description`; `og:image:secure_url`, `og:image`, `twitter:image`, `twitter:image:src`), title and description cut to 150 characters. | `200 {title, description, image}`; `400 url query parameter is required`, `Enter a valid http(s) URL`, `Enter a valid public http(s) URL` (non-http scheme or a loopback, private or link-local host); `502 Couldn't reach that URL`, `That URL returned HTTP <n>`; `422 That URL isn't an HTML page`, `No title, description or image found on that page` |

App fields and their validation messages (`400`). Every text field is trimmed before it is validated and stored, on create and on update:

| Field | Rule |
|---|---|
| `ios_bundle_id`, `android_package` | `com.company.app` shape: `ios_bundle_id must look like com.company.app`, `android_package must look like com.company.app` |
| `ios_team_id` | 10 uppercase letters or digits: `ios_team_id must be a 10-character Apple Team ID (e.g. 8H7C9JL2K3)` |
| `ios_store_url`, `android_store_url` | Host exactly `apps.apple.com` / `play.google.com`: `ios_store_url must be an apps.apple.com URL`, `android_store_url must be a play.google.com URL` |
| `huawei_store_url`, `samsung_store_url`, `xiaomi_store_url` | Host on the store's domains (Huawei `appgallery.huawei.com`, `appgallery.cloud.huawei.com`, `url.cloud.huawei.com`; Samsung `galaxystore.samsung.com`, `apps.samsung.com`, `galaxy.store`; Xiaomi `global.app.mi.com`, `app.mi.com`, subdomains included): `<store>_store_url must be a valid http(s) URL`, `<store>_store_url must be a <hosts> URL` |
| `vivo_store_url` | Any http(s) URL |
| `android_sha256_fingerprints` | Array; each upper-cased and matching `AA:BB:…` (32 pairs); blanks dropped: `SHA-256 fingerprints must be 32 hex byte pairs separated by colons (AA:BB:…)` |
| `fallback_url` | http(s): `fallback_url must be a valid http(s) URL` |
| `ios_app_scheme`, `android_app_scheme` | A trailing `://` is stripped; letters, digits, `+`, `-`, `.`; `http`, `https`, `ws`, `wss`, `javascript`, `file`, `data`, `blob`, `about` and `intent` are refused: `ios_app_scheme must be a URL scheme (letters, digits, +, -, .) without :// — e.g. myapp`, `ios_app_scheme must be a custom app scheme — the browser handles http/https/javascript itself, so it can never open the app` (same for Android) |
| `mobile_interstitial`, `strict_fraud_mode`, `ios_tap_to_store` | Truthy stores 1, else 0 |
| `mmp_handoff` | `true` or `false` (anything else is a 400): add `clickid` (and `pid`) to AppsFlyer, Singular and Adjust tracking-link destinations |
| `mmp_pid` | Optional media source for the handoff: 1 to 100 letters, digits, `.`, `-`, `_` |
| `low_entropy_window_hours` | Whole number 1 to 720, or `null` / `""` for the deployment default: `low_entropy_window_hours must be a whole number of hours between 1 and 720` |
| `og_title`, `og_description`, `og_image_url` | 150 characters, 150 characters, http(s) URL |
| `fb_app_id` | Free text, trimmed. The worker only stores it; the SDK reads Meta's install referrer when `DectogConfig.fbAppId` is set in the app, not based on this field. |

## Analytics

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/overview?days=` | session | The Overview screen. `days` defaults to 90, clamped to 1 to 365; the previous window of the same length feeds every `delta`. | `200 {window, kpis: {clicks, visitors, installs, conversion, revenue, leads, opens}, timeseries, campaigns, sources, referrers, devices, countries, device_models, carriers, connectivity, reinstalls, match_sources, fraud: {flagged, reasons}, apple_search_ads: {attributed, no_attribution, pending, unresolved, campaigns}}`. Definitions are in [Dashboard: Overview](/dashboard/overview/). |
| `GET /api/admin/events?limit=&type=` | session | Latest events, newest first. `limit` default 50, 1 to 200, no offset. `type` filters only when it is `identify`, `lead`, `conversion` or `custom`; other values return every type. | `200 {events: [...]}` with every column including `ip_raw`, `revenue` rounded to 2 decimals, `metadata` parsed |
| `GET /api/admin/customers?q=&limit=&offset=` | session | Customer list. `q` (trimmed, 200 characters) is a substring match on `customer_id`, `name`, `email`, `phone`; `limit` default 50, 1 to 200. | `200 {total, limit, offset, customers: [...]}`, each with the customer fields, `matched_slug`, `match_source`, `app_platform`, `os`, `device_model`, `country`, `city`, `events`, `revenue`, `last_event_at`, `shared_device_customers` |
| `GET /api/admin/customers/:customerId` | session | Everything known about one customer. | `200 {customer, stats, devices, install, click, link, events (200), opens (50), shared_device_customers (50)}`; `404 Customer not found`. `install` and `click` omit `ip_hash` but keep `ip_raw`. |
| `GET /api/admin/retention?days=&slug=&campaign=&platform=` | session | The Retention card: day 1, 7 and 30 retention and weekly cohorts, calendar days in UTC. `days` default 90, 7 to 365; `slug` limits to installs credited to that link, `campaign` to installs whose click carried that `utm_campaign` or link campaign, `platform` to `ios` or `android` (anything else is a 400). | `200 {window: {days, start}, bucket: "calendar_day_utc", filters, installs, untracked, d1, d7, d30, weekly}`; each `dN` is `{eligible, retained, rate}` (`rate` a percentage with one decimal, null when nothing is eligible); `weekly` is `[{week, installs, retained: [n…], rates: [%…]}]`, newest first, nine weeks, null for weeks not started |
| `GET /api/admin/attribution-quality?days=` | session | The match-confidence and referrer-health panel. `days` default 7, 1 to 365. Reinstalls and updates are included. | `200 {days, by_platform, referrer_status, match_sources, shadow: {n, agree, disagree}, latency: {p50_ms, p90_ms, n}, updates_skipped}` |
| `GET /api/admin/analytics?event=&group_by=&interval=&tz=&<dimension>=` | session | The Breakdown card and the MCP `analytics` tool: see below. | `200 {window: {interval, tz, start, end, granularity, partial}, event, group_by, filters, truncated, data}`; `400` for any parameter it does not take |
| `GET /api/admin/export.csv?data=&…` | session | The analytics answer (`data=analytics`, the default) or the raw rows of `clicks`, `installs`, `opens` or `events` as CSV, with the same window and filters. | `200 text/csv`; past 50,000 rows `202` with an export job, or `422 export_too_large` without an `EXPORTS` bucket. See [Export raw data](/api/export/#csv). |
| `GET /api/admin/exports/:id` | session | A large export's job. | `200 {id, data, status, total_rows, row_count, bytes, error, created_at, finished_at, expires_at, status_url, download_url}`; `404` for another account's |
| `GET /api/admin/exports/:id/download?exp=&sig=` | signed link | The finished file. | `200 text/csv`; `403 invalid_download_link`; `404` once it is gone |

### The analytics query

One query answers "how many, by what, where": any of the metrics over a window, by time or by one or two dimensions, with filters.

| Parameter | Default | Values |
|---|---|---|
| `event` | all five | One or more of `clicks`, `installs`, `opens`, `leads`, `revenue`, comma separated. `installs` are first installs; `revenue` is net of refunds, in the account's currency. |
| `group_by` | `timeseries` | `timeseries`; one dimension; two (`campaign,country`, or `timeseries,device` for a series per platform); or `none` for one row of totals |
| `interval` | `30d` | `24h` (hourly: the current hour and the 23 before it), `7d`, `30d`, `90d`, `365d` (whole days, today included) |
| `start`, `end` | none | Local days `YYYY-MM-DD`, both included, in place of `interval`; at most 366 days |
| `tz` | `UTC` | An IANA time zone; days and hours are cut in it, changes of summer time included |
| `limit` | 100 | Rows (or, by time and a dimension, values of the dimension), 1 to 1000; past it `truncated` is true |
| a dimension | none | A filter: `country=US,DE` keeps those values, `country=-US` leaves them out. One dimension cannot do both. |

The dimensions are `link`, `campaign`, `adgroup`, `creative` (the link's tracking fields or the URL's `dec_*` values), `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `country`, `region`, `city`, `browser`, `referrer`, `device` (`ios`, `android`, `desktop`, `other`), `os`, `os_version`, `lang`, `app_version`, `match_source` and `cta` (the button a visitor took on a link page: `cta_ios`, `cta_android`, `cta_open`, `cta_web`).

An install takes the dimensions of the tap that won it; an event those of the link it counts for (the link that last opened the app within its re-engagement window, else the install's), and an open those of its tap. What no link brought is `(organic)`; a link that carried no value for a dimension is `(none)`. Both are values like any other, so `country=-US` keeps the rows without a country and `utm_source=(none)` finds the taps without one.

Each row has the group values, then the metrics; `conversion` (installs per click, in percent, one decimal) joins them when both are asked for. A metric whose rows lack the dimension, such as clicks by `match_source` or `app_version`, is `null` rather than 0. By time, every day or hour of the window is there, zero when nothing happened. `window.partial` is true when the window starts before the raw rows the retention window keeps.

```bash title="Installs and revenue by campaign and country, last 30 days, Berlin time, without the US"
curl -sS -b jar.txt 'https://app.dectog.com/api/admin/analytics?event=installs,revenue&group_by=campaign,country&interval=30d&tz=Europe/Berlin&country=-US'
```

## Blog, messages and contact

Owner-only CMS routes under `/api/admin/blog` and the public site routes under `/api`. See [Blog and messages](/dashboard/blog-and-messages/).

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/blog/posts?limit=&offset=&search=` | owner | Posts including drafts, by `updated_at` descending. `search` matches title or slug; `limit` default 50, max 200. | `200 {posts, total, limit, offset}` |
| `GET /api/admin/blog/posts/:id` | owner | One post. | `200 {post}`; `404 Post not found` |
| `POST /api/admin/blog/posts` | owner | `{title (1-200), slug? (derived from the title), excerpt (≤500, required), content (HTML, required), content_blocks?, featured_image_url?, category_id?, published?}`. | `201 {post}`; `400 title, slug, excerpt and content are required`, `Title must be 1-200 characters`, `Slug may only contain letters, numbers, "-" and "_"`, `Excerpt must be at most 500 characters`, `Content is required`, `Featured image must be a valid http(s) URL`, `Unknown category`; `409 A post with this slug already exists` |
| `PUT /api/admin/blog/posts/:id` | owner | Partial update; the first publish stamps `published_at`, unpublishing keeps it. | `200 {post}`; `404`; `409` |
| `DELETE /api/admin/blog/posts/:id` | owner | | `200 {ok: true}`; `404 Post not found` |
| `GET /api/admin/blog/categories` | owner | Every category with `post_count` (drafts included). | `200 {categories}` |
| `POST /api/admin/blog/categories` | owner | `{name (1-80), slug?}`. | `201 {category}`; `400 Name must be 1-80 characters`; `409 A category with this slug already exists` |
| `PUT /api/admin/blog/categories/:id` | owner | `{name?, slug?}`. | `200 {category}`; `400 Nothing to update`; `404 Category not found`; `409` |
| `DELETE /api/admin/blog/categories/:id` | owner | Posts in it become uncategorized. | Always `200 {ok: true}` |
| `GET /api/admin/blog/messages?limit=&offset=` | owner | Contact-form inbox, newest first; `limit` default 50, max 200. | `200 {messages, total, limit, offset}` |
| `DELETE /api/admin/blog/messages/:id` | owner | | `200 {ok: true}`; `404 Message not found` |
| `GET /api/blog/posts?search=&category=&limit=&offset=` | public | Published posts, newest first; `limit` default 12, max 50; `search` matches title or excerpt; `category` is a category slug. | `200 {posts, total, limit, offset}` |
| `GET /api/blog/posts/:slug` | public | A published post. | `200 {post}`; `404 Post not found` |
| `GET /api/blog/categories` | public | Categories with at least one published post. | `200 {categories}` |
| `POST /api/contact` | public | `{name (1-100), email (valid, ≤200), subject (1-150), message (10-2000)}`. Stored only; no email is sent. | `201 {ok: true}`; `400 Name must be 1-100 characters`, `A valid email is required`, `Subject must be 1-150 characters`, `Message must be 10-2000 characters`; `429 Too many messages — try again later` |

## Rate limits

| Route | Limit |
|---|---|
| `POST /api/contact` | 5 per hour per hashed IP, counted before validation, so invalid submissions use up the allowance. The 429 carries no `Retry-After`. |
| `POST /api/admin/login` | 10 per minute per hashed IP, counted before the password check. `429` with `Retry-After`. There is no per-account lockout, so nobody can lock a user out by failing on purpose. |
| `POST /api/admin/forgot-password` | 5 per minute per hashed IP and 3 per minute per email address. `429` with `Retry-After`. |
| Every other `/api/admin` and `/api/auth` route | **None.** Signup, reset-password and bootstrap are not rate limited. Put your own protection in front of them when you expose a self-hosted dashboard publicly. |
