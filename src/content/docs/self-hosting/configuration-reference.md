---
title: Configuration reference
description: Every Worker variable, secret and binding with its development default, production value and effect, plus the per-app options and the constants that cannot be changed without editing code.
sidebar:
  order: 3
---

The Worker reads its configuration from the `Env` type in `apps/worker/src/types.ts`. Values come from four places:

| Source | Used for | Where |
|---|---|---|
| Top-level `vars` in `apps/worker/wrangler.jsonc` | Local development defaults | `npm run dev` |
| `env.production.vars` in the same file | Production | `wrangler deploy --env production` |
| `.dev.vars` (never committed) | Local secrets | Read by `wrangler dev`; copy `.dev.vars.example` |
| `wrangler secret put <NAME> --env production` | Production secrets | Stored by Cloudflare, listed with `wrangler secret list --env production`, removed with `wrangler secret delete` |

A one-off override for a single run uses `wrangler dev --var NAME:value` (this is how `npm run dev:android` swaps `PUBLIC_BASE_URL`). The test suite injects its own values through `apps/worker/vitest.config.ts` (`JWT_SECRET=test-jwt-secret`, `IP_SALT=test-ip-salt`, `APP_HOST=app.test.local`, `UNKNOWN_HOST_REDIRECT=https://fallback.example.com/`, `ASA_RETRY_DELAY_MS=20`, `EXPORT_STREAM_MAX_ROWS=50`, and a local `EXPORTS` bucket).

## Variables

"Dev" is the top-level value in `wrangler.jsonc`; "Production" is the value in `env.production` as shipped (your own domain replaces `dectog.com`). "Unset" means the code default applies.

| Variable | Dev | Production | Effect |
|---|---|---|---|
| `ROOT_DOMAIN` | `localhost:8787` | `dectog.com` | Tenant hosts are `<username>.<ROOT_DOMAIN>`; the port is ignored and `*.localhost` qualifies, so `demo.localhost:8787` works locally. Also: the apex 301 of every page path to `WEB_URL`, recognizing the deployment's own hosts as self-referrers and as valid clipboard URLs, and subdomain resolution of the well-known files (skipped while the value starts with `localhost`). |
| `LINK_URL_MODE` | `path` | `subdomain` | `subdomain` builds `https://<username>.<ROOT_DOMAIN>/<slug>`, and only when `ROOT_DOMAIN` does not start with `localhost`. Any other value, or a localhost root, builds `<PUBLIC_BASE_URL>/r/<username>/<slug>`. Both URL forms are always served regardless of the mode; this only changes the URLs the API and dashboard print. |
| `PUBLIC_BASE_URL` | `http://localhost:8787` | `https://app.dectog.com` | Base of path-mode link URLs (`http://localhost:8787` when unset). Its host counts as the deployment's own for clipboard-URL validation and self-referrer suppression. Shown in Settings. |
| `WEB_URL` | `http://localhost:3000` | `https://app.dectog.com` | The dashboard origin: the only allowed CORS origin for `/api/admin/*` (with credentials); where `/` and a known tenant's root 302; the target of the apex page 301s; the base of password-reset links and of the Google redirect URI `<WEB_URL>/api/auth/google/callback`; the origin printed in `/robots.txt`, `/sitemap.xml` and a blog post's `og:url`. |
| `APP_HOST` | unset | `app.dectog.com` | Host whose non-Worker paths are served from the `ASSETS` binding (Worker paths: `/api/`, `/r/`, `/.well-known/`, `/_/`, `/healthz`, `/robots.txt`, `/sitemap.xml`). On this host `/login` 302s to `/dashboard` for a signed-in session, `/` is never redirected and the `/?user=` link form is disabled. Unset: no asset serving at all. |
| `UNKNOWN_HOST_REDIRECT` | unset | `https://dectog.com/` | 302 target for an unknown tenant host and for an unknown username in any URL form. Unset: JSON `404 {"error":{"code":"not_found","message":"Not found"}}` on a bare host, the HTML "Link not found" page on a link path. |
| `ENVIRONMENT` | unset | `production` | `production` makes the bootstrap token mandatory, disables the demo seed and makes `IP_SALT` mandatory. Nothing else reads it. See [Deploy](/self-hosting/deploy/). |
| `RETENTION_DAYS` | unset (400) | `400` | Age after which the daily job anonymizes personal data. `0`, blank or non-numeric means 400. Negative values are not rejected and would anonymize every row at the next run. See [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/). |
| `ATTRIBUTION_WINDOW_HOURS` | unset (24) | `24` | The wide fingerprint window for model-bearing candidates, clamped to 1 to 720. Deterministic referrer matching is not windowed. |
| `ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS` | unset (2) | unset (2) | The short window for model-less candidates and cellular installs, minimum 1. The effective value is `min(app override or this, ATTRIBUTION_WINDOW_HOURS)`. See [Attribution internals](/self-hosting/attribution-internals/). |
| `ATTRIBUTION_DETERMINISTIC_WINDOW_HOURS` | unset (168) | unset (168) | How long a pasted link or a Meta referrer earns credit, in hours, capped at 720. Older ones route without credit (`stale_clipboard`, `stale_meta`). Per-app override: `deterministic_window_hours`. See [Attribution internals](/self-hosting/attribution-internals/). |
| `REENGAGEMENT_WINDOW_HOURS` | unset (168) | unset (168) | Hours after a link re-opened the app during which events count for that link, capped at 720. Per-app override: `reengagement_window_hours`. |
| `ASA_RETRY_DELAY_MS` | unset (5000) | unset (5000) | Pause between the three inline Apple Search Ads attempts; any non-negative number. |
| `BRAND_NAME` | unset | unset | The product name on link pages ("This … link does not exist", "Go to …") and in the password-reset email. Unset: DecTog. |
| `MIN_SDK_VERSION` | unset | unset | An SDK version such as `1.1.0`. Identified SDK builds older than it get `400` with code `sdk_too_old`. Unset: every version is accepted. See [SDK identity](/api/overview/#sdk-identity). |
| `STORE_RAW_IP` | unset | unset | `"1"` also stores the raw client IP next to its hash on clicks, installs and events, for the Customers page's IP rows. Unset: raw IPs are never stored; matching uses only the salted hash either way. See [Privacy and data](/self-hosting/privacy-and-data/). |
| `OPEN_SIGNUPS` | unset (open) | unset (open) | `"0"` closes public signup: `POST /api/admin/signup` answers `403 Signup is currently closed`, the login page hides the signup tab (via `GET /api/auth/config`), and Google sign-in refuses to create new accounts (`signup_closed`). Existing accounts, linking an existing account to Google, and bootstrap are unaffected. |
| `CUSTOM_DOMAIN_TARGET` | unset | unset | The hostname customers point their custom link domain's CNAME at (the Cloudflare for SaaS fallback origin), e.g. `domains.dectog.com`. With the secrets `CF_API_TOKEN` and `CF_ZONE_ID` it turns custom domains on. See [Custom domains](/self-hosting/custom-domains/). |
| `EXPORT_STREAM_MAX_ROWS` | unset (50000) | unset (50000) | Rows a CSV export from the dashboard streams at once. Past it the export becomes a job that writes to the `EXPORTS` bucket, or is refused without one. See [Export raw data](/api/export/#larger-exports). |
| `EMAIL_FROM` | unset | unset | Sender of the password-reset email; the code default is `DecTog <hello@mail.dectog.com>` (the comment in `types.ts` naming `noreply@dectog.com` is stale). Set it to a sender verified in your Resend account. The `Reply-To` is hard-coded to `hello@dectog.com`. |

Bindings:

| Binding | Dev | Production | Effect |
|---|---|---|---|
| `DB` (D1) | database `dectog`, id `local-dev`, local state under `.wrangler/state` | database `dectog`, your id | The only data store. `migrations_dir` is `migrations` in both. |
| `ASSETS` (static assets) | none | `../web/out`, `run_worker_first: true`, `html_handling: auto-trailing-slash` | The dashboard and marketing export built by `npm run build:static` in `apps/web`. |
| `EXPORTS` (R2, optional) | none | none until you add it | Holds CSV exports larger than `EXPORT_STREAM_MAX_ROWS`, each deleted after 7 days. Create a bucket (`wrangler r2 bucket create dectog-exports`) and add `"r2_buckets": [{ "binding": "EXPORTS", "bucket_name": "dectog-exports" }]` to `env.production` in `wrangler.jsonc`. Without it a larger export answers `422 export_too_large`. |
| `ASA_FETCHER`, `WEBHOOK_FETCHER`, `OG_FETCHER`, `GOOGLE_FETCHER`, `CF_API_FETCHER` | test only | never | Service bindings the test suite uses to stand in for Apple, your webhook, fetched social-preview pages, Google's token endpoint and Cloudflare's custom hostnames and DNS-over-HTTPS APIs. In production the Worker uses global `fetch`. |

## Secrets

| Secret | Required | When it is missing | When it is rotated |
|---|---|---|---|
| `JWT_SECRET` | Yes | Dashboard sessions cannot be signed, so nobody can sign in; SDK and site keys created meanwhile are stored hash-only, so Settings shows only their mask. | Every session cookie (`dectog_session`, HS256, 30-day JWT) and every in-flight Google sign-in becomes invalid: everyone signs in again. The encrypted copies of SDK and site keys (`api_keys.key_enc`, AES-256-GCM under SHA-256 of `dectog-api-key-v1:` + the secret) can no longer be decrypted, so Settings shows those keys masked, and webhook deliveries fail with "The signing secret cannot be read (JWT_SECRET changed): rotate the webhook secret" until each secret is rotated. API authentication keeps working unchanged because it compares `sha256(key)`, which the secret never touches; the account key has no stored copy at all. |
| `IP_SALT` | Yes in production; optional locally (`dtg-default-salt` with a warning) | In production every request that hashes an IP fails with `IP_SALT is not set`: link taps, installs, claims, app opens, the beacon and the per-IP rate limit. | Every new `ip_hash` differs from every stored one. Fingerprint matching cannot see clicks made before the rotation, the `install_velocity_ip` and `click_storm_ip` rules lose their history, beacons for clicks made before the rotation are rejected (the beacon must match the click's hash), and Overview unique visitors double-count across the boundary. Rotation does not re-identify stored hashes. |
| `BOOTSTRAP_TOKEN` | Only for the bootstrap call in production | Locally: bootstrap needs no header. In production: every bootstrap call is `403`. | Harmless. Delete it after the owner account exists. |
| `RESEND_API_KEY` | No | Password-reset links are printed to the Worker console (`wrangler tail`) instead of being emailed; the user still sees the generic "If that email exists, a reset link is on its way." message. | Harmless; nothing is stored. |
| `CF_API_TOKEN`, `CF_ZONE_ID` | No, but both, with `CUSTOM_DOMAIN_TARGET` | Custom link domains are off: the Settings card says they are not set up and the admin routes answer `409 not_configured`. Domains already active keep being served. | A new token with the same permission (SSL and Certificates: Edit on the zone) is harmless. Another zone loses every custom hostname the old one had. See [Custom domains](/self-hosting/custom-domains/). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No, but both or neither | `GET /api/auth/config` reports `googleEnabled: false`, the login page hides the button and `/api/auth/google/start` answers `404` (`not_configured`). | Rotating the secret within the same Google Cloud project is harmless. A client in a different project issues different `sub` values, so stored `users.google_sub` links no longer match; sign-in then falls back to linking by verified email. |

Session tokens are stateless: rotating `JWT_SECRET` is the only way to revoke every session at once; there is no per-user revocation. Password-reset tokens are different: they are stored hashed in `password_resets` and do not depend on the secret.

## Per-app options

Settings that apply per registered app live on the `apps` row and are edited under Apps in the dashboard or through the admin API. Validation is in `apps/worker/src/appvalidation.ts`; the full form is on [Apps](/dashboard/apps/).

| Option | Column | Rule |
|---|---|---|
| Name | `name` | Required when creating |
| Fallback URL | `fallback_url` | http(s) URL. On mobile it outranks the link target; on desktop it is the last stop before the QR page. |
| iOS bundle id, Team ID, App Store URL, scheme | `ios_bundle_id`, `ios_team_id`, `ios_store_url`, `ios_app_scheme` | Bundle id `^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$`; Team ID `^[A-Z0-9]{10}$`; store host exactly `apps.apple.com`; scheme letters, digits, `+ - .`, without `://`, never http, https, ws, wss, javascript, file, data, blob, about or intent |
| Android package, SHA-256 fingerprints, Play URL, scheme | `android_package`, `android_sha256_fingerprints`, `android_store_url`, `android_app_scheme` | Package as the bundle id; fingerprints `AA:BB:…` (32 pairs, stored upper-case, JSON array); store host exactly `play.google.com`; scheme as iOS |
| OEM store URLs | `huawei_store_url`, `samsung_store_url`, `xiaomi_store_url`, `vivo_store_url` | Host-checked for Huawei (`appgallery.huawei.com`, `appgallery.cloud.huawei.com`, `url.cloud.huawei.com`), Samsung (`galaxystore.samsung.com`, `apps.samsung.com`, `galaxy.store`) and Xiaomi (`global.app.mi.com`, `app.mi.com`), subdomains included; vivo accepts any http(s) URL. See [App stores and OEM routing](/links/app-stores-and-oem-routing/). |
| Facebook App ID | `fb_app_id` | Free text; when set, the Android SDK reads Meta's on-device install referrer |
| Social preview | `og_title`, `og_description`, `og_image_url` | 150 characters, 150 characters, http(s) URL |
| Mobile interstitial | `mobile_interstitial` | 0/1. Serves the beacon page on mobile taps so the click row gets a screen profile. |
| iOS tap-to-store | `ios_tap_to_store` | 0/1. One-tap page that copies the link to the pasteboard before opening the App Store. |
| Strict fraud mode | `strict_fraud_mode` | 0/1. Flagged installs count as organic. |
| Low-entropy window | `low_entropy_window_hours` | Whole number 1 to 720, or empty for `ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS` |
| Pasted-link and Meta window | `deterministic_window_hours` | Whole number 1 to 720, or empty for `ATTRIBUTION_DETERMINISTIC_WINDOW_HOURS` |
| Re-engagement window | `reengagement_window_hours` | Whole number 1 to 720, or empty for `REENGAGEMENT_WINDOW_HOURS` |

`strict_fraud_mode`, `low_entropy_window_hours`, `deterministic_window_hours` and an install's webhook app are read from the app an install concerns (`apps/worker/src/appscope.ts`): the app of the credited or routed link; else the install's own app, the one whose Android package or iOS bundle ID equals the `package_name` the SDK sends (on an account with one app, that app); else the oldest app. The redirect engine uses the link's own app for routing, store URLs, schemes, interstitial and tap-to-store.

## Fixed constants

These are code constants. Changing them means editing the source and redeploying.

| Constant | Value | Where |
|---|---|---|
| Rate limits | 3,000 requests per minute per account; 60 per device; 600 per account + IP when no device id; beacon 120 per minute per IP; contact form 5 per hour per IP | `ratelimit.ts`, `collect.ts`, `api_blog.ts` |
| Request signature skew | ±1,800 s | `auth.ts` |
| Session lifetime | 30 days (JWT); cookie Max-Age 30 days with "Remember me", otherwise a browser-session cookie | `auth.ts`, `api_admin.ts` |
| Password reset | Token valid 1 hour, single use | `api_auth.ts` |
| Google username step | 15 minutes | `api_google.ts` |
| Temp links | TTL 60 s to 2,592,000 s (30 days), default 900; purged 24 h after expiry | `api_links.ts`, `index.ts` |
| Click screen profile | Nulled after `min(RETENTION_DAYS, 30)` days | `index.ts` |
| Beacon binding | Same hashed IP, within 10 minutes of the click | `collect.ts` |
| Bot threshold | Cloudflare bot score below 30 records no click | `redirect.ts` |
| Fingerprint candidate pool | Newest 50 web clicks from the same hashed IP | `attribution.ts` |
| Fraud thresholds | Velocity 5 (Wi-Fi/unknown) or 25 (cellular) installs per hashed IP in 24 h; click storm over 100 clicks per hashed IP in the hour before the click; impossible speed under 10 s; stale referrer over 30 days | `fraud.ts` |
| Apple Search Ads | 3 inline attempts, 24 h token TTL, 100 tokens per cron pass | `asa.ts` |
| Reserved usernames | `app www api links dashboard admin mail static cdn` | `bootstrap.ts` |
| Brand name | `DecTog` | `brand.ts` |
