---
title: Admin API
description: The cookie-session routes the dashboard uses, listed for self-hosters who automate against their own deployment. Not a stable contract.
sidebar:
  order: 6
---

:::caution[Not a stable contract]
Everything under `/api/admin` and `/api/auth` exists to serve the dashboard. Routes, shapes and error strings change whenever the dashboard does, without notice. The stable, versioned surface is `/api/v1` ([API overview](/api/overview/)). Use this page when you automate your **own** deployment and accept that the next release may break your script.
:::

## Session basics

- Authentication is a cookie, `dectog_session`, set by login, signup and Google sign-in. It holds an HS256 JWT signed with `JWT_SECRET` that expires after 30 days. Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when the request came over https. Login without `remember` sets a browser-session cookie (the token inside still lasts 30 days); `remember: true`, signup and Google sign-in set `Max-Age` of 30 days.
- Logout deletes the cookie; tokens are never revoked server-side. A password reset does not end existing sessions. Rotating `JWT_SECRET` signs everyone out.
- Routes marked **session** answer `401 {"error": "Not authenticated"}` without a cookie and `401 {"error": "Invalid or expired session"}` for a bad or expired token or a deleted user.
- Routes marked **owner** additionally require the `owner` role (`403 {"error": "Owner access required"}`). The owner is the account created by bootstrap or the demo seed; signup and Google sign-in always create `user`, and there is no route to change roles. See [Account and sign-in](/dashboard/account-and-sign-in/).
- Every query is scoped to the signed-in account. There is no cross-account view.
- CORS on `/api/admin/*`: `access-control-allow-origin` is `WEB_URL`, with `access-control-allow-credentials: true`, `vary: Origin` and allowed headers `authorization, content-type`. `OPTIONS /api/*` answers 204.
- Errors use the same `{"error": "<message>"}` shape as the v1 API. A body that is not valid JSON answers `400 {"error": "Invalid JSON body"}`.

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
| `POST /api/admin/signup` | public | `{email, password, username}`. Creates a `user` account, sets a 30-day cookie, returns the API key. | `201 {user, api_key}`; `403 Signup is currently closed` (`OPEN_SIGNUPS=0`); `400 Please enter a valid email address`, a password-rule message, `Username must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric`, `Username '<name>' is reserved`; `409 An account with this email or username already exists` |
| `POST /api/admin/login` | public | `{email, password, remember?}`. Email is trimmed and lower-cased. | `200 {user: {id, email, username, role, created_at}}` plus the cookie; `400 Email and password are required`; `401 Invalid email or password`. No lockout, no rate limit. |
| `POST /api/admin/logout` | public | Deletes the cookie. | `200 {ok: true}` |
| `GET /api/admin/me` | session | The signed-in account. | `200 {user: {id, email, username, role, created_at}}` |
| `POST /api/admin/forgot-password` | public | `{email}`. Creates a one-hour, single-use reset token (older unused tokens are cancelled) and emails `<WEB_URL>/reset-password?token=…` through Resend, or logs the link when `RESEND_API_KEY` is unset. | Always `200 {ok: true, message: "If that email exists, a reset link is on its way."}` |
| `POST /api/admin/reset-password` | public | `{token, password}`. Does not sign the user in. | `200 {ok: true}`; `400 Reset token is required`, a password-rule message, `This reset link is invalid or has expired`, `This reset link has already been used` |
| `GET /api/auth/config` | public | What the login page shows. | `200 {signupOpen, googleEnabled}` |
| `GET /api/auth/google/start` | public | 302 to Google's consent screen (authorization code with PKCE S256, `state`, scopes `openid email profile`, `prompt=select_account`). Sets `dectog_google_oauth` (10 minutes, path `/api/auth/google`). | `404 Google sign-in is not configured` when `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is unset |
| `GET /api/auth/google/callback` | public | Google's redirect target, `<WEB_URL>/api/auth/google/callback`. Signs in a linked account, links an existing account with the same verified email, or parks a new identity in `dectog_google_pending` (15 minutes). | 302 to `/dashboard`, `/login?google=choose_username`, or `/login?google_error=<reason>` with reason `not_configured`, `cancelled`, `expired`, `failed`, `other_google_account` or `signup_closed` |
| `GET /api/auth/google/pending` | pending cookie | The parked identity for the username step. | `200 {email, name}`; `404 Google sign-in expired — try again` |
| `POST /api/auth/google/complete` | pending cookie | `{username}`. Creates the account with a random password (set a real one through forgot-password). | `201 {user: {id, email, username, role: "user"}, api_key}`; `401 Google sign-in expired — try again`; `403 Signup is currently closed`; `400` username rules; `409 That username is taken` or `An account with this Google email already exists — sign in instead` |

Password rule for signup and reset: 8 to 72 characters with at least one lowercase letter, one uppercase letter and one digit (`Password must be at least 8 characters`, `Password must be less than 72 characters`, `Password must include a lowercase letter`, `Password must include an uppercase letter`, `Password must include a number`). Username rule: `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` after lower-casing; reserved: `app`, `www`, `api`, `links`, `dashboard`, `admin`, `mail`, `static`, `cdn`.

### Bootstrap

`POST /api/admin/bootstrap` has two body forms. Both answer `409 {"error": "Already bootstrapped"}` once any user exists, and `201 {"ok": true, "email", "username", "api_key", "demo"}` on success. The API key appears only in this response.

| Body | Result |
|---|---|
| `{"email", "password", "username"}` | Creates exactly that account with role `owner` and no demo data, in any environment. All three fields are required; password at least 12 characters (no other rule); username rules as above. Errors are `400` with `email, password and username are required`, `email is not a valid address`, `password must be at least 12 characters`, `username must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric`, `username '<name>' is reserved`, or `409 Username or email already exists`. `demo` is `false`. |
| empty, not JSON, or a JSON object with none of those three keys | Seeds the demo account `demo@dectog.local` / `demo1234` / username `demo` (role `owner`) with the demo app, links, clicks and installs. `demo` is `true`. In production this answers `403 {"error": "Demo seed is disabled in production — provide email, password and username"}`. |

The header check runs first: when `ENVIRONMENT=production` or `BOOTSTRAP_TOKEN` is set, `x-bootstrap-token` must equal `BOOTSTRAP_TOKEN`, otherwise `403 {"error": "Bootstrap not permitted"}`. In production without a configured token every call is refused. See [Local quick start](/self-hosting/local-quick-start/) and [Deploy](/self-hosting/deploy/).

## Settings

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/settings` | session | Account and link configuration. | `200 {email, username, key_prefix, api_key, link_mode, root_domain, public_base_url, example_link}`. `api_key` is the full key decrypted from its stored copy, or `null` for keys created before that copy existed (including the demo seed's key) or when `JWT_SECRET` changed since. Authentication keeps working in every one of those cases. |
| `POST /api/admin/settings/regenerate-key` | session | Replaces the hash, prefix and stored copy in one update. The old key stops working immediately. | `200 {api_key, key_prefix}` |

See [Dashboard: Settings](/dashboard/settings/).

## Links

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/links` | session | Every link, newest first, no pagination. | `200 {links: [...], temp_links: [...]}`. Each permanent link has every column, `metadata` parsed, plus `url`, `clicks_7d` (rolling 7 days), and lifetime `installs` (matched, non-reinstall), `opens`, `leads` and `revenue` (every currency summed, 2 decimals). Each temporary link has every column plus `url` and `is_expired`. |
| `POST /api/admin/links` | session | Same fields and rules as the v1 create, with the slug trimmed. | `201 {id, slug, target, url, click_count: 0, created_at, metadata}` (a subset of the v1 Link); `400 Invalid or missing slug`, `Invalid target: must be a valid http(s) URL`, `Unknown app_id`, the `og_*` and routing messages; `409 Slug already exists` with `slug` |
| `PUT /api/admin/links/:slug` | session | Same partial-update semantics as v1 (absent keeps, `null` or `""` clears). | `200 {ok: true, link: <raw row>}`: `metadata` is still a JSON string and there is no `url`; `404 Link not found` |
| `DELETE /api/admin/links/:slug` | session | Deletes the link and its clicks, attributed installs, events and app opens. | Always `200 {deleted: true}`, even for an unknown slug |
| `POST /api/admin/temp-links` | session | Same fields and TTL rules as v1 (`ttlSeconds` default 900, `0` becomes 900, clamped to 60 to 2,592,000; auto slug `t_<10 hex>`). | `201 {id, slug, target, url, ttl_seconds, expires_at, created_at, og_title, og_description, og_image_url}`; `400 ttlSeconds must be a number`, `Invalid slug`; `409 Slug already exists` |
| `PUT /api/admin/temp-links/:slug` | session | `target` and `og_*` only. | `200 {ok: true}`; `404 Temporary link not found` |
| `DELETE /api/admin/temp-links/expired` | session | Deletes every temporary link of the account whose `expires_at` has passed. Their clicks and installs are kept. | `200 {deleted: <count>}` |
| `DELETE /api/admin/temp-links/:slug` | session | Delete with history, like permanent links. | Always `200 {deleted: true}` |

## Apps

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/apps` | session | All apps, oldest first. The first one is the account's default app. | `200` bare array with every column, `android_sha256_fingerprints` parsed into an array. **`install_webhook_secret` is returned in plain text.** |
| `POST /api/admin/apps` | session | Create. `name` is the only required field. | `201 {id, name}`; `400 App name is required` or a field message |
| `PUT /api/admin/apps/:id` | session | Partial update: absent keeps, a blank `name` keeps the old name, `""` or `null` clears other fields. | `200 {ok: true}`; `404 App not found` |
| `DELETE /api/admin/apps/:id` | session | Deletes the app; links bound to it get `app_id: null` and follow the default app from then on. Installs and clicks are untouched. | `200 {deleted: true}`; `404 App not found` |
| `POST /api/admin/apps/:id/test-webhook` | session | Sends the test event described in [Install webhook](/api/install-webhook/), synchronously, 10-second timeout. | `200 {delivered: true, ok, status}` even for a non-2xx reply; `400 Save the webhook URL and secret first`; `502 Webhook delivery failed: <message>`; `404 App not found` |
| `GET /api/admin/og-preview?url=` | session | Fetches a public page server-side and extracts a social preview. Follows redirects, 8-second timeout, reads at most 512 KB, first tag wins (`og:title`, `twitter:title`, `<title>`; `og:description`, `twitter:description`, `description`; `og:image:secure_url`, `og:image`, `twitter:image`, `twitter:image:src`), title and description cut to 150 characters. | `200 {title, description, image}`; `400 url query parameter is required`, `Enter a valid http(s) URL`, `Enter a valid public http(s) URL` (non-http scheme or a loopback, private or link-local host); `502 Couldn't reach that URL`, `That URL returned HTTP <n>`; `422 That URL isn't an HTML page`, `No title, description or image found on that page` |

App fields and their validation messages (`400`):

| Field | Rule |
|---|---|
| `ios_bundle_id`, `android_package` | `com.company.app` shape: `ios_bundle_id must look like com.company.app`, `android_package must look like com.company.app` |
| `ios_team_id` | 10 uppercase letters or digits: `ios_team_id must be a 10-character Apple Team ID (e.g. 8H7C9JL2K3)` |
| `ios_store_url`, `android_store_url` | Host exactly `apps.apple.com` / `play.google.com`: `ios_store_url must be an apps.apple.com URL`, `android_store_url must be a play.google.com URL` |
| `huawei_store_url`, `samsung_store_url`, `xiaomi_store_url` | Host on the store's domains (Huawei `appgallery.huawei.com`, `appgallery.cloud.huawei.com`, `url.cloud.huawei.com`; Samsung `galaxystore.samsung.com`, `apps.samsung.com`, `galaxy.store`; Xiaomi `global.app.mi.com`, `app.mi.com`, subdomains included): `<store>_store_url must be a valid http(s) URL`, `<store>_store_url must be a <hosts> URL` |
| `vivo_store_url` | Any http(s) URL |
| `android_sha256_fingerprints` | Array; each upper-cased and matching `AA:BB:…` (32 pairs); blanks dropped: `SHA-256 fingerprints must be 32 hex byte pairs separated by colons (AA:BB:…)` |
| `fallback_url`, `install_webhook_url` | http(s): `fallback_url must be a valid http(s) URL`, `install_webhook_url must be a valid http(s) URL` |
| `ios_app_scheme`, `android_app_scheme` | A trailing `://` is stripped; letters, digits, `+`, `-`, `.`; `http`, `https`, `ws`, `wss`, `javascript`, `file`, `data`, `blob`, `about` and `intent` are refused: `ios_app_scheme must be a URL scheme (letters, digits, +, -, .) without :// — e.g. myapp`, `ios_app_scheme must be a custom app scheme — the browser handles http/https/javascript itself, so it can never open the app` (same for Android) |
| `mobile_interstitial`, `strict_fraud_mode`, `ios_tap_to_store` | Truthy stores 1, else 0 |
| `low_entropy_window_hours` | Whole number 1 to 720, or `null` / `""` for the deployment default: `low_entropy_window_hours must be a whole number of hours between 1 and 720` |
| `og_title`, `og_description`, `og_image_url` | 150 characters, 150 characters, http(s) URL |
| `install_webhook_secret` | Free text, trimmed |
| `fb_app_id` | Free text, trimmed. The worker only stores it; the SDK reads Meta's install referrer when `DectogConfig.fbAppId` is set in the app, not based on this field. |

## Analytics

| Method and path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /api/admin/overview?days=` | session | The Overview screen. `days` defaults to 90, clamped to 1 to 365; the previous window of the same length feeds every `delta`. | `200 {window, kpis: {clicks, visitors, installs, conversion, revenue, leads, opens}, timeseries, campaigns, sources, referrers, devices, countries, device_models, carriers, connectivity, reinstalls, match_sources, fraud: {flagged, reasons}, apple_search_ads: {attributed, no_attribution, pending, unresolved, campaigns}}`. Definitions are in [Dashboard: Overview](/dashboard/overview/). |
| `GET /api/admin/events?limit=&type=` | session | Latest events, newest first. `limit` default 50, 1 to 200, no offset. `type` filters only when it is `identify`, `lead`, `conversion` or `custom`; other values return every type. | `200 {events: [...]}` with every column including `ip_raw`, `revenue` rounded to 2 decimals, `metadata` parsed |
| `GET /api/admin/customers?q=&limit=&offset=` | session | Customer list. `q` (trimmed, 200 characters) is a substring match on `customer_id`, `name`, `email`, `phone`; `limit` default 50, 1 to 200. | `200 {total, limit, offset, customers: [...]}`, each with the customer fields, `matched_slug`, `match_source`, `app_platform`, `os`, `device_model`, `country`, `city`, `events`, `revenue`, `last_event_at`, `shared_device_customers` |
| `GET /api/admin/customers/:customerId` | session | Everything known about one customer. | `200 {customer, stats, devices, install, click, link, events (200), opens (50), shared_device_customers (50)}`; `404 Customer not found`. `install` and `click` omit `ip_hash` but keep `ip_raw`. |
| `GET /api/admin/attribution-quality?days=` | session | The match-confidence and referrer-health panel. `days` default 7, 1 to 365. Reinstalls and updates are included. | `200 {days, by_platform, referrer_status, match_sources, shadow: {n, agree, disagree}, latency: {p50_ms, p90_ms, n}, updates_skipped}` |

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
| Every other `/api/admin` and `/api/auth` route | **None.** Login, signup, forgot-password, reset-password and bootstrap are not rate limited and login has no lockout. Put your own protection in front of them when you expose a self-hosted dashboard publicly. |
