---
title: Migrate from Branch, Adjust or AppsFlyer
description: Concept-by-concept mapping from Branch, Adjust and AppsFlyer to DecTog links, dec_* parameters, the SDK verdict and the webhooks, with a plain list of what DecTog does not do.
sidebar:
  order: 2
---

This guide is for teams moving deep links and install attribution from Branch, Adjust or AppsFlyer. It maps names and behaviors, nothing else. Vendor terms are written as they appear in those products' documentation. It assumes the hosted service: the API at `https://app.dectog.com` and links at `https://{username}.dectog.com/{slug}`.

:::note[Self-hosting]
On your own deployment the API base is `PUBLIC_BASE_URL`, links use your `ROOT_DOMAIN`, and the fingerprint windows come from `ATTRIBUTION_WINDOW_HOURS` and `ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS`. See [Configuration reference](/self-hosting/configuration-reference/).
:::

## The verdict in their terms

Every install report returns one `DectogAppInstallResponse`. This table places the vocabulary of the three products on its fields.

| Concept | DecTog |
|---|---|
| The install came from a link (Branch `+clicked_branch_link`, AppsFlyer `af_status: Non-organic`, Adjust attribution with a tracker) | `matched: true`, `type: 'non-organic'`. `matched` is attribution credit. It is granted only at `matchConfidence` `guaranteed` or `high`. |
| Deterministic match (Branch `+match_guaranteed`) | `matchConfidence: 'guaranteed'`, `matchSource` `referrer` or `clipboard`, and `referrerSource` naming the store: `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo` or `meta`. |
| Probabilistic match (AppsFlyer "probabilistic modeling", Branch "fingerprint") | `matchSource: 'fingerprint'`. `high` is credited. `medium` is not credited but returns a `routing` candidate (`slug`, `deepLink`, `clickParams`, `confidence`). `low` returns nothing. |
| Deferred deep link (Branch `$deeplink_path`, Adjust deferred deep link callback, AppsFlyer `deep_link_value`) | `install.deepLink` (the `dec_deeplink` of the tapped URL) or `install.routing?.deepLink`. For the link's stored path call `dectog.resolveLink(username, slug)` and read `deepLinkPath`, the running platform's. |
| First session (Branch `+is_first_session`, AppsFlyer `is_first_launch`) | The `onAppInstalled` emission itself. `installState` is `install`, `reinstall` or `update`. App updates never run the fingerprint. Reinstalls run the full ladder and carry `isReinstall: true`; the dashboard leaves them out of the Installs KPI and the per-link counts. |
| Referring link (Branch `~referring_link`) | `install.link?.url` and `install.slug` |
| Campaign fields (Branch `~campaign`, `~channel`, `~feature`, `~tags`; Adjust `campaign`, `adgroup`, `creative`, `label`; AppsFlyer `pid`, `c`, `af_adset`, `af_ad`, `af_channel`) | The link's Tracking fields `label`, `campaign`, `adgroup`, `creative`, overridden per tap by `dec_label`, `dec_campaign`, `dec_adgroup`, `dec_creative`, plus `dec_tracker`. Returned as `install.clickParams`. `utm_*` is stored as well and feeds the Overview charts. |
| Custom link data (Branch link data, AppsFlyer `deep_link_sub1` to `deep_link_sub10`) | Link `metadata` (any JSON), returned as `install.customParameters` |
| Identity (Branch `setIdentity`, AppsFlyer `setCustomerUserId`) | `dectog.identify(customerId: ..., name: ..., email: ..., phone: ...)`; `dectog.logout()` forgets it |
| Events (Branch `BranchEvent`, Adjust event tokens, AppsFlyer `logEvent` with `af_revenue`) | `dectog.trackConversion(revenue: ..., currency: ...)` and `dectog.trackEvent(name)`. The first `identify` of a new customer on a fresh install records the signup lead. See [Events](/sdk/events/). |
| Attribution read-back (AppsFlyer `onConversionDataSuccess`, Adjust attribution callback) | `onAppInstalled`, `currentAppInstall`, and `getAttributionData()`, which re-pulls `GET /api/v1/attribution` after a restart |
| Server postback (Branch webhooks, Adjust callbacks, AppsFlyer Push API) | [Webhooks](/api/webhooks/): `app.installed`, `app.install_updated`, `event.conversion`, `event.lead`, `app.opened`, `referral.converted`, link changes and, opt-in, `click.recorded`. HMAC-SHA256 signed, logged, retried for about a day. |
| Request signing (AppsFlyer `af_sig`) | Every SDK call carries `x-dectog-timestamp` and `x-dectog-signature`. Unsigned requests get 401. |

## Branch

| Branch | DecTog |
|---|---|
| Quick Link `https://xyz.app.link/abc` | `https://{username}.dectog.com/{slug}`, created on the Links page or with `POST /api/v1/links` |
| `$deeplink_path`, `$ios_deeplink_path`, `$android_deeplink_path` | `ios_deep_link_path` and `android_deep_link_path` on the link; `dec_deeplink` per tap |
| `$fallback_url` | The link's `target` is the last mobile fallback, after the app's `fallback_url` |
| `$desktop_url` | The link's `fallback_url`, or `dec_fallback` per tap. The default is the branded QR page. |
| `$ios_url`, `$android_url` | `dec_redirect_ios` and `dec_redirect_android` per tap; the link's `redirect_url` for both platforms |
| `$og_title`, `$og_description`, `$og_image_url` | `og_title`, `og_description`, `og_image_url` on the link, with the app's values as defaults |
| `$web_only`, `$uri_redirect_mode` | No equivalent |
| NativeLink (`checkPasteboardOnInstall`, `willShowPasteboardToast`) | The pasteboard read is on by default on iOS (`DectogCollection.pasteboard`). `willShowPasteboardPrompt()` works before `initialize()`. The iOS tap-to-store page is the web side that copies the link. `DectogPasteButton` renders `UIPasteControl` for late pastes. |
| Install referrer readers (Play, Huawei, Samsung, Xiaomi) | Built in, with retries. Play, Huawei and vivo need no extra library. Samsung and Xiaomi activate when the host app adds their libraries. See [Deterministic attribution](/sdk/deterministic-attribution/). |
| Reinstall event | `isReinstall: true`, `installState: 'reinstall'`. A reinstall goes through the ladder and the fingerprint like a first install; the dashboard leaves it out of the Installs KPI and the per-link counts. |
| Data Export API | The [raw export](/api/export/) of clicks, installs, opens and events, with the account key |
| Journeys, Universal Email, Deepviews, Data Feeds | No equivalent |

## Adjust

Adjust's tracker URL parameters keep their names in DecTog with a `dec_` prefix.

| Adjust | DecTog |
|---|---|
| Tracker `https://app.adjust.com/<token>` | A link. `dec_tracker` records a tracker name per tap; it has no routing effect. |
| `campaign`, `adgroup`, `creative`, `label` | `dec_campaign`, `dec_adgroup`, `dec_creative`, `dec_label`, falling back to the link's Tracking defaults |
| `deep_link` | `dec_deeplink` |
| `redirect`, `redirect_ios`, `redirect_android`, `redirect_macos`, `redirect_windows` | `dec_redirect`, `dec_redirect_ios`, `dec_redirect_android`, `dec_redirect_macos`, `dec_redirect_windows`, plus `dec_redirect_linux` |
| `fallback` | `dec_fallback` |
| `AdjustAttribution` (`trackerToken`, `trackerName`, `campaign`, `adgroup`, `creative`, `clickLabel`) | `install.clickParams` (`tracker`, `campaign`, `adgroup`, `creative`, `label`), `install.slug`, `install.link` |
| Deferred deep link callback | `onAppInstalled` with `deepLink` or `routing` |
| LinkMe | The pasteboard read plus the iOS tap-to-store page |
| Install referrer with retries | Up to three connection attempts, 3 seconds apart, for transient Play errors. The first-launch registration waits up to `installReferrerTimeout` (default 5 seconds); a referrer that arrives later is sent as a late claim and `onAppInstalled` emits again. |
| `retry_in` | The SDK honors `Retry-After`: up to 10 seconds in-process, longer waits defer to the next launch |
| Apple Search Ads through AdServices | `DectogCollection.appleSearchAdsToken` in `collect` (off by default). The result is on `install.appleSearchAds`, on `getAttributionData()`, on the webhook and on the Overview card. |
| Server callbacks | Webhooks |
| Reattribution | No equivalent for installs: a late deterministic signal can upgrade an organic or fingerprint verdict; a credited install never changes link. Events within the re-engagement window after a link opens the installed app (7 days by default, per app) count for that link; see [Events](/sdk/events/#how-events-reach-a-link). |
| SKAdNetwork, ad-network integrations | None |

## AppsFlyer

| AppsFlyer | DecTog |
|---|---|
| OneLink `https://xyz.onelink.me/abc/...` | `https://{username}.dectog.com/{slug}` |
| `af_dp`, `deep_link_value` | `dec_deeplink` per tap; `ios_deep_link_path` and `android_deep_link_path` on the link |
| `deep_link_sub1` to `deep_link_sub10` | Link `metadata` (returned as `customParameters`), or the `dec_*` tracking fields |
| `af_web_dp` | The link's `fallback_url` or `dec_fallback` |
| `af_ios_url`, `af_android_url` | `dec_redirect_ios`, `dec_redirect_android`, or the link's `redirect_url` |
| `af_r` | `dec_redirect` |
| `pid`, `c`, `af_adset`, `af_ad`, `af_channel` | `utm_source` and `utm_campaign` (the Overview charts group by these) plus `dec_label`, `dec_campaign`, `dec_adgroup`, `dec_creative` |
| Unified Deep Linking (`subscribeForDeepLink`, `DeepLinkResult`) | `onLinkClick` for direct opens; `onAppInstalled.routing` and `deepLink` for deferred opens |
| Conversion data (`onConversionDataSuccess`: `af_status`, `is_first_launch`, `media_source`, `campaign`) | `onAppInstalled`: `type`, `matched`, `matchSource`, `matchConfidence`, `clickParams`; `getAttributionData()` on later launches |
| `setDeepLinkTimeout` | `installReferrerTimeout` (default 5 seconds) plus late claims |
| `setCustomerUserId` | `identify(customerId: ...)` |
| `logEvent` with `af_revenue` and `af_currency` | `trackConversion(revenue: ..., currency: ...)` |
| `af_sig` | The request signature on every SDK call |
| Push API | Webhooks: installs, conversions, leads, opens and referrals |
| Pull API, Master API | The [raw export](/api/export/) of clicks, installs, opens and events, and the MCP [`analytics` tool](/guides/automation-and-agents/#mcp-server) for totals by link, campaign, country and other dimensions, both with the account key; `GET /api/v1/links` (lifetime `click_count`); the dashboard |
| Protect360 | Eight rules: `emulator`, `impossible_speed`, `install_velocity_ip`, `click_storm_ip`, `stale_referrer`, `stale_clipboard`, `stale_meta`, `click_reuse`. Strict fraud mode makes flagged installs count as organic. |
| Apple Search Ads | `appleSearchAds` on the verdict |
| SKAdNetwork, Conversion Studio, ad-network integrations | None |

AppsFlyer separates routing (UDL) from attribution data (GCD). DecTog separates them inside one object: `routing` says where to send a new user, `matched` and `clickParams` say who gets credit.

## Running both for a while

A migration is safer when both tools see the same traffic for a few weeks. Keep the MMP's SDK in the app next to flutter_dectog, point a DecTog link's **If the app isn't installed > Custom URL** (`redirect_url`) at the MMP's tracking link, and turn on **MMP click handoff** for the app on the Apps page. A tap then goes through DecTog, which records the click, and on to the MMP's link with DecTog's click id added:

| Destination host | Added |
|---|---|
| `*.onelink.me`, `app.appsflyer.com` (AppsFlyer) | `clickid=<DecTog click id>`, and `pid=<your media source>` when the app sets one |
| `*.sng.link` (Singular) | the same |
| `app.adjust.com`, `adj.st` (Adjust) | the same |

A `clickid` or `pid` already in the tracking link is kept. Store URLs, scheme links and other hosts are never changed. The click id is the 16-character `dtg_click` value that names the click in DecTog, so an install the MMP attributes can be looked up on the DecTog side by it. Whether the MMP keeps the `clickid` parameter in its raw data depends on the link and partner settings in its own dashboard; check one test install there before relying on it. The store redirect then belongs to the MMP's link, so DecTog's own install match for those taps falls back to the store referrer the MMP passes on, or to the fingerprint.

## How attribution differs

- Deterministic signals win in this order: store install referrer, pasteboard, Meta referrer. Then the fingerprint. Then organic. See [How attribution works](/start/how-attribution-works/).
- One install per click. A click another install already consumed moves the ladder on to the next signal; `click_reuse` is flagged only when nothing later matches.
- Fingerprint candidates are web clicks from a phone with the same hashed IP and OS family. The window is 24 hours for clicks that share a device model or a screen profile with the install, the probabilistic window Adjust and AppsFlyer use, and 2 hours for clicks with neither and for installs on cellular. The 2-hour window can be set per app (1 to 720 hours) in the app's Advanced settings.
- App updates (`install_state: update`) never run the fingerprint. Reinstalls do, and carry `is_reinstall: true`. Late claims never run the fingerprint.
- Strict fraud mode, the low-entropy window and an install's webhook app are read from the app the install concerns, and an install is only matched against its own app's links.
- A pasted link or a Meta referrer earns credit for 7 days (per app); an older one routes the user without credit. Store referrers keep 30 days.
- Apple Search Ads is resolved server-side and arrives later: `pending`, then `resolved`, `no_attribution`, `invalid` or `expired`. Only `resolved` and `no_attribution` are final.

## What DecTog does not do

DecTog is not a mobile measurement partner: no SKAdNetwork or AdAttributionKit, no ad-network integrations or postbacks, advertising identifiers only through the optional `flutter_dectog_adid` package, no re-attribution windows, and SDKs for Flutter, React Native and the web. The full list, with the probabilistic-matching limits and Apple's fingerprinting rules, is on [What DecTog does not do](/start/what-dectog-does-not-do/).
