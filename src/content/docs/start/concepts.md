---
title: Concepts
description: The objects DecTog works with, accounts, apps, links, clicks, installs, verdicts, claims, events and the link URL modes, and how they relate.
sidebar:
  order: 2
---

DecTog is small. Everything in the dashboard, the API and the SDK maps onto the handful of objects below.

## Account

An account is one tenant, one username and one link subdomain. The username is the first label of every link URL (`https://acme.dectog.com/welcome` belongs to the account `acme`) and the value the SDK and the verdict call `username`. It cannot be renamed, and an account cannot be deleted from the dashboard.

Each account has an account key (`dtg_` and 32 hex characters) for servers and scripts, with every scope, and one or more SDK keys (`dtg_pub_` and 32 hex characters) for the apps it ships, which cannot change or delete links unless created with the links:write option. A client authenticates with a key as a Bearer token and signs every request with it. A third kind, the site key (`dtg_site_` and 32 hex characters), sits in your web pages for [`dectog.js`](/sdk/web/) and works only from the origins it lists. All three kinds are managed under **Settings**. See [Authentication](/api/overview/#authentication).

Everything an account stores is scoped to it. There is no cross-account view. Several people can work in one account, each with a team role: owner, member or viewer. Beyond the account, the only privilege is the platform owner role, held by the deployment's bootstrap account, which unlocks the Blog and Messages screens. See [Account and sign-in](/dashboard/account-and-sign-in/).

## Apps and the default app

An app is a registered iOS and/or Android application: its identifiers, store URLs, custom schemes, social preview, webhooks and attribution options. An account can register any number of apps on the **Apps** page.

The **default app** is the oldest app of the account, the first one you registered. It matters in these places:

| Situation | What the default app does |
|---|---|
| A permanent link created without an app, or whose app was deleted | The link routes through the default app's store URLs, schemes and fallback URL. |
| Every temporary link | Temporary links have no app of their own and always use the default app. |
| The blocked fraud rules, the low-entropy attribution window and the webhooks of an app | Only as the last resort. These are read from the app the install concerns: the app of the credited or routed link; else the install's own app, the one whose Android package or iOS bundle ID equals the `package_name` the SDK sends (on an account with one app, that app); else the oldest app. |
| Deleting an app | Its links are re-pointed to the default app. Clicks and installs are untouched. |

The well-known files are account-wide: `apple-app-site-association` lists every app with a bundle ID and Team ID, `assetlinks.json` every app with a package.

## Links

A link is a slug under your subdomain. Slugs contain letters, digits, `_` and `-`, are at most 128 characters long, and are unique across both link kinds of the account.

| | Permanent link | Temporary link |
|---|---|---|
| Lifetime | Until you delete it, or until an expiry you set | Expires after a TTL of 60 seconds to 30 days (dashboard: 5 min, 1 hour, 1 day, 7 days) |
| Slug | Required | Optional; auto-generated as `t_` plus 10 hex characters |
| App | Chosen per link, else the default app | Always the default app |
| Target (**Fallback URL**) | Optional; `null` inherits the app's fallback URL | Same |
| Deep-link paths, custom mobile redirect, custom desktop fallback, Tracking defaults | Yes | No |
| Social preview | Per link, else the app's | Per link, else the app's |
| Lifetime click counter | Yes | No |

A link's target is a fallback, not a redirect for everyone: on a phone the store or the app comes first, and on a desktop the target only appears as a button on the QR page. [How a tap is routed](/links/how-a-tap-is-routed/) has the full order; [Temporary links](/links/temporary-links/) covers expiry.

## Link URLs and URL modes

The server builds link URLs in one of two modes, set by `LINK_URL_MODE` and `ROOT_DOMAIN`:

| Mode | URL | Used when |
|---|---|---|
| `subdomain` | `https://{username}.{ROOT_DOMAIN}/{slug}` | Hosted service (`ROOT_DOMAIN=dectog.com`) and production self-hosts with a wildcard DNS record |
| `path` | `{PUBLIC_BASE_URL}/r/{username}/{slug}` | Local development, `workers.dev` deployments. Forced whenever `ROOT_DOMAIN` starts with `localhost`, whatever the mode says. |

An account with an active [custom domain](/links/custom-domains/) gets `https://{custom domain}/{slug}` in either mode; its subdomain or path URLs keep working.

Three request forms reach the redirect engine on any deployment: `/{slug}` on a tenant subdomain or a custom domain (exactly one path segment), `/r/{username}/{slug}` on any host (on a custom domain only for its own account), and `/?user={username}/{slug}` on any host except the dashboard host and custom domains. The SDK recognizes all three when a link opens the app.

When an app is opened through a custom scheme, the URL is `scheme://{username}/{slug}`, or `scheme://{path}` when the link (or a `dec_deeplink` parameter) sets a deep-link path for that platform. Either way the query ends with `dtg_l={username}/{slug}`, which names the link: the SDK reads the link from that tag, because a path such as `products/42` cannot be told apart from a username and slug by its shape.

## Clicks

A click is one recorded tap on a link. Two sources exist:

| `source` | Recorded by | When |
|---|---|---|
| `web` | The redirect engine | A browser tap that reached the server and was not a bot. Carries device type, OS, browser, client hints, geo and ASN from Cloudflare, the salted IP hash, the referring origin, `utm_*` and the `dec_*` tracking values. |
| `mobile_app` | The SDK, through `POST /api/v1/clicks` | A link opened the app directly (a verified Universal Link or App Link never touches the server), or an `intent://` bounce delivered the web click id to the app, in which case the existing web row is converted instead of inserting a second one. |

Bots and link unfurlers get a preview page and no click. Each click has a 16-character id; it rides on store URLs as `dtg_click=<id>` and is what makes an install deterministic. A click can be credited to at most one install.

## Installs, verdicts and claims

An install is the first launch of the app on a device, registered once by the SDK with an idempotent `install_attempt_id`. The server answers with a verdict, the same object the SDK exposes as `DectogAppInstallResponse` and the dashboard as an install:

| Field | Meaning |
|---|---|
| `matched` | Attribution credit. `true` only at `guaranteed` or `high` confidence. The dashboard counts these as attributed installs. |
| `type` | `non-organic` when matched, else `organic`. |
| `match_source` | `referrer` (Play or an OEM store), `clipboard` (copied link or paste), `fingerprint`, or `null`. |
| `referrer_source` | Which deterministic reader won: `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo` or `meta`. |
| `match_confidence` | `guaranteed`, `high`, `medium`, `low` or `null`. |
| `routing` | A route the app may open even without credit: present whenever the install is matched, and at `medium` confidence with `matched: false`. |
| `username`, `slug`, `link`, `click_params`, `deep_link`, `clicked_at` | The matched link and the click's `dec_*` values. `link` is only present for permanent links. |
| `is_reinstall`, `install_state` | Reinstall detection (same device seen before, or the SDK's own classification) and the client's `install` / `reinstall` / `update` classification. |
| `fraud_flags` | [Fraud rule](/start/fraud-rules/) hits such as `emulator` or `click_reuse`. |
| `apple_search_ads` | Always present; `null` until the SDK ever sent an AdServices token. |

A claim is a deterministic signal that arrives after the first launch: a Play referrer the store delivered late, a link pasted through `DectogPasteButton`, a late Meta read. The SDK sends it to `POST /api/v1/app-installs/{id}/claim`; the verdict changes at most once, from organic or fingerprint to deterministic, and the SDK re-emits it with `claim: 'upgraded'`. [How attribution works](/start/how-attribution-works/) explains the signals and the confidence levels.

## Events, customers and app opens

After the install the SDK can report:

| Object | SDK call | What it is |
|---|---|---|
| Event | `trackConversion`, `trackEvent`, `identify` | Typed rows (`conversion`, `custom`, `lead`, `identify`) stamped with the install's matched link, so leads and revenue appear per link. `identify` is stored as an event too; the first identify of a new user on a fresh install is the `lead`. Batches of up to 100 events. |
| Customer | `identify(customerId: ...)` | Your user id with optional name, email and phone, bound to the device's install attribution. A later call overwrites the fields it sends and keeps the ones it omits; the install association stays with the first install. Browse them under **Customers**. |
| App open | Automatic | A DecTog link opened the already-installed app. Counted as **Opens** on the Overview and per link. |

See [Events](/sdk/events/) and [Events and attribution](/api/events-and-attribution/).

## Webhooks

An account can have any number of webhooks, each taking one app's events or every app's. The server POSTs the events a webhook is subscribed to: `app.installed` for every first-launch verdict and `app.install_updated` when a claim upgrades it, conversions and leads, app opens, referrals, link changes and, opt-in, every tap. The body is the envelope `{event_id, event, created_at, attempt, data}`, signed with `x-dectog-signature: sha256=<HMAC-SHA256 of the raw body>`. Every delivery is logged, and a failed one is retried for about a day. See [Webhooks](/api/webhooks/).

## Where things live

| Object | Dashboard | API | SDK |
|---|---|---|---|
| Account, keys, link configuration | Settings | `/api/admin/settings`, `/api/admin/keys` (cookie session) | `DectogConfig(apiKey:)` takes an SDK key |
| Apps | Apps | `/api/admin/apps` | |
| Links, temporary links | Links | `/api/v1/links`, `/api/v1/temp-links`, `/api/v1/resolve/{username}/{slug}` | `createLink`, `createTempLink`, `resolveLink` |
| Clicks | Overview, per-link numbers | `/api/v1/clicks` | Automatic |
| Installs, verdicts, claims | Overview, Customers | `/api/v1/app-installs`, `/api/v1/attribution` | `onAppInstalled`, `getAttributionData()` |
| Events, customers, opens | Overview, Links, Customers | `/api/v1/events`, `/api/v1/app-opens` | `identify`, `trackConversion`, `trackEvent` |

The `/api/v1` routes take a key (account or SDK) and the request signature; the `/api/admin` routes take the dashboard's session cookie. See [REST API overview](/api/overview/).
