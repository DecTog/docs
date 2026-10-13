---
title: Contributing
description: Repository layout of the server, the Flutter SDK and these docs, how to run the tests, the migration and data-layer rules, how to propose changes, and the three licenses.
sidebar:
  order: 1
---

DecTog is three repositories under [github.com/DecTog](https://github.com/DecTog):

| Repository | Contents | License |
|---|---|---|
| `DecTog/dectog` | The server: Cloudflare Worker, D1 database, Next.js dashboard and marketing site | AGPL-3.0 |
| `DecTog/flutter_dectog` | The Flutter SDK, published on pub.dev as `flutter_dectog` | MIT |
| `DecTog/docs` | This site | Content CC BY 4.0, site code MIT |

## Repository layout

### `dectog` (server)

| Path | What it is |
|---|---|
| `apps/worker/src/` | The Worker: `index.ts` routes hosts and paths; `redirect.ts` is the link engine; `api_links.ts`, `api_clicks.ts`, `api_installs.ts`, `api_events.ts` are the SDK API; `attribution.ts`, `fraud.ts`, `asa.ts` decide verdicts; `api_admin.ts`, `api_auth.ts`, `api_google.ts`, `api_customers.ts`, `api_attribution_admin.ts`, `api_blog.ts` serve the dashboard; `auth.ts`, `ratelimit.ts`, `webhook.ts`, `wellknown.ts`, `ogpreview.ts`, `collect.ts`, `seed.ts`, `bootstrap.ts` |
| `apps/worker/src/db/` | The typed data layer: `tables.ts` (column registry), `write.ts` (`insertStmt`, `updateById`), `links.ts`, `tempLinks.ts`, `users.ts` (the shared lookups) |
| `apps/worker/migrations/` | `0001_init.sql` to `0027_apple_search_ads.sql` |
| `apps/worker/test/` | Vitest suites on the Workers pool with an isolated D1 |
| `apps/worker/wrangler.jsonc` | Dev defaults and the `production` environment |
| `apps/web/src/app/` | The Next.js app: `(site)` marketing pages, `login`, `reset-password`, `dashboard/**` |
| `apps/web/public/SKILL.md`, `llms.txt` | The agent guide and index, served at `https://dectog.com/SKILL.md` and `/llms.txt` |
| `docs/API_CONTRACT.md` | The SDK-to-worker contract, route by route |
| `docs/ATTRIBUTION-RELIABILITY-PLAN.md` | How attribution works and the status of each follow-up |
| `docs/DATA-LAYER.md` | The data-layer rules summarized below |

### `flutter_dectog` (SDK)

| Path | What it is |
|---|---|
| `lib/flutter_dectog.dart` | The public entry point |
| `lib/src/dectog_impl.dart` | `FlutterDectog`: initialization, link handling, install registration, claims, events, link CRUD |
| `lib/src/models/` | `DectogConfig`, `DectogLink`, `DectogTempLink`, `DectogLinkResolution`, `DectogLinkClick`, `DectogAppInstallRequest`, `DectogAppInstallResponse`, `DectogClickParams`, `DectogError` |
| `lib/src/services/` | Device identity and hardware, the install referrer service, the install state store (the `.dectog_install.json` sentinel), the event queue, request signing, the retry policy, the sensitive-URL filter, the link deduper |
| `lib/src/widgets/dectog_paste_button.dart` | `DectogPasteButton` |
| `android/src/main/kotlin/app/dectog/flutter_dectog/` | `DectogIdentifiersPlugin.kt`, `InstallReferrers.kt` (Play, Huawei, Samsung, Xiaomi and vivo readers), `Pasteboard.kt` |
| `ios/flutter_dectog/` | The Swift package: `DectogIdentifiersPlugin.swift`, `DectogInstallDates.swift`, `DectogKeychain.swift`, `DectogPasteControl.swift`; `ios/flutter_dectog.podspec` for CocoaPods hosts |
| `example/` | The example app; reads `env/dev.json` for `DECTOG_API_KEY`, `DECTOG_BASE_URL`, `DECTOG_LINK_ROOT_DOMAIN` |
| `test/` | Unit tests for the models, the referrer service, the state store, the event queue, signing, the retry policy, the URL parser and the paste button |
| `docs/react_native_port.md` | The draft port guide; see [Porting the SDK](/contributing/porting-the-sdk/) |

### `docs` (this site)

| Path | What it is |
|---|---|
| `src/content/docs/<group>/<slug>.md` | One page per file; the sidebar groups are fixed in `astro.config.mjs` and pages are ordered by `sidebar.order` |
| `src/components/Footer.astro` | The footer with the version note ("flutter_dectog 1.0.x, migration 0027") and the license split |
| `wrangler.jsonc` | The Worker that serves `dist/` on the route `docs.dectog.com/*` |
| `.github/workflows/deploy.yml` | Builds on every push and pull request; deploys on push to `main` |

## Running the checks

```bash
# Server
cd apps/worker && npm ci && npm test          # Vitest on the Workers pool, 28 suites, 300+ tests
cd apps/worker && npm run typecheck           # tsc --noEmit
cd apps/web && npm ci && npm run typecheck

# SDK
cd flutter_dectog && flutter pub get && flutter analyze && flutter test

# Docs
cd docs && npm ci && npm run build            # fails on broken internal links
```

The worker suite covers the attribution ladder end to end (referrer, clipboard, Meta, scored fingerprint and confidence, late claims, idempotent replays, one install per click, synthesized clicks), the fraud rules and strict mode, Apple Search Ads against a stand-in API, OEM store routing and the tap-to-store page, request signing and rate limits, the events pipeline and customers, link and app CRUD, the redirect engine, retention and the schema registry.

To run the server locally with the demo account, follow [Local quick start](/self-hosting/local-quick-start/). To test an SDK change against it, run the worker with `npm run dev:android` and the example app with `flutter run --dart-define-from-file=env/dev.json`. See [Testing](/sdk/testing/).

## Migration rules

- `apps/worker/migrations/` is append-only. A migration that has been applied to a shared or remote database is never edited or deleted; add a new numbered file.
- Files apply in name order. Two files are numbered `0012` (`0012_blog.sql`, `0012_mobile_interstitial.sql`) and that is fine; do not renumber them.
- `0003_hashed_api_keys.sql` wipes tenant data. It only matters for databases that predate it.
- A migration that adds or removes a column must also change the row type in `src/types.ts` and the column registry in `src/db/tables.ts`. `tsc` enforces the type-registry pair and `test/schema.test.ts` compares the registry with `PRAGMA table_info` on the migrated test database.
- Deploys run `wrangler d1 migrations apply DB --remote --env production` before `wrangler deploy --env production`. Plain `npm run deploy` uses the dev configuration. See [Database and migrations](/self-hosting/database-and-migrations/).

## Data-layer rules

The worker talks to D1 with raw, parameterized SQL and no ORM. From `docs/DATA-LAYER.md`:

1. Every value is bound with `?`. Request input never reaches SQL text.
2. Reads carry a row type from `src/types.ts` (`.first<LinkRow>()`, `.all<AppRow>()`) or an inline shape for aggregates. No `any`.
3. The link, temp-link and user lookups live once, in `src/db/links.ts`, `src/db/tempLinks.ts` and `src/db/users.ts`. Do not paste that SQL again.
4. Writes go through `src/db/write.ts`: `insertStmt(db, table, row)` requires the full row type, so a new column turns every insert site into a compile error until it supplies a value; `updateById(db, table, id, patch)` takes a typed partial. Expression updates such as `click_count = click_count + 1`, the analytics, attribution, rate-limit and cron SQL stay raw.
5. Time cutoffs are computed in JavaScript (`isoDaysAgo` in `src/util.ts`) and bound as ISO strings. Never compare a stored timestamp with SQLite's `datetime('now', …)`: it emits `YYYY-MM-DD HH:MM:SS`, and because `T` sorts after a space, stored `…T…Z` values compare as newer than they are.

## Design decisions to keep

- No billing. There is no billing or subscription code anywhere, and the docs do not describe any.
- API keys are stored as a SHA-256 hash plus a prefix, with an AES-GCM encrypted copy (keyed from `JWT_SECRET`) so Settings can show the key again. Every SDK call is also HMAC-signed with the key.
- Attribution: deterministic signals first (store referrers, Meta, pasteboard), then a scored, tenant-scoped fingerprint; one install per click; 24-hour window for model-bearing candidates and 2 hours otherwise; credit only at high confidence, routing at medium, nothing on a tie. See [Attribution internals](/self-hosting/attribution-internals/).
- Privacy: hashed IPs (IPv6 at /64), device-tier anonymization on the retention schedule, ad identifiers in their own table and never joined to device data, no cross-install identifiers. See [Privacy and data](/self-hosting/privacy-and-data/).

## Proposing a change

1. Open an issue on the repository the change belongs to. For behavior changes, describe the current behavior and the one you want before writing code.
2. Fork, branch, and keep the checks above green. A worker change that touches a route, a verdict field or a limit needs a test in `apps/worker/test/`; an SDK change needs one in `test/`.
3. Keep the prose in step with the code. The pages of this site, `docs/API_CONTRACT.md`, `apps/web/public/SKILL.md` and `llms.txt` all describe the same behavior; update the ones your change affects, and bump the version note in `src/components/Footer.astro` when the SDK version or the latest migration changes.
4. Never commit secrets. `.dev.vars`, `env/dev.json` and OAuth client secret files stay out of commits.
5. Open a pull request. The docs site builds every pull request and deploys `main` automatically.

Documentation fixes are the quickest contribution: every page has an "Edit page" link that opens the file on GitHub.

## Licenses

- The server (`DecTog/dectog`: the Worker, the web app and everything else in that repository) is licensed under the GNU AGPL v3. You can run it, modify it and self-host it. If you offer a modified version as a network service, you must publish your changes.
- The Flutter SDK (`DecTog/flutter_dectog`) is licensed under the MIT License, so the AGPL never reaches your app.
- These docs: the content under `src/content` is licensed under CC BY 4.0 (reuse it with attribution); the site code (configuration, components, styles) is MIT.
