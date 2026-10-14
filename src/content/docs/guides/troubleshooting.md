---
title: Troubleshooting
description: Symptom, cause and fix for unattributed installs, App Links and Universal Links that do not verify, links that open the browser, 429s, webhook tests, preview auto-fill, Google sign-in and expired links.
sidebar:
  order: 4
---

Every entry describes what the hosted service and the SDK do today. Where a dashboard message or an API error string is quoted, it is quoted exactly.

:::note[Self-hosting]
Unknown usernames redirect to `UNKNOWN_HOST_REDIRECT` only when it is set; otherwise they get the 404 page. The fingerprint windows come from `ATTRIBUTION_WINDOW_HOURS` and `ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS`. Everything else below is the same.
:::

## An install is not attributed

Start on the Overview page. The "Match confidence & referrer health" panel shows credited installs, Android referrer coverage (amber when more than 5 % are missing), fingerprint accuracy from the shadow match, click-to-install latency, a confidence bar per platform and the "Install referrer reads" chips. It counts reinstalls and app updates, so its totals differ from the Installs KPI. See [Overview](/dashboard/overview/).

The confidence hover texts are: Guaranteed `install referrer, copied link or paste`; High `fingerprint, corroborated and unique — credited`; Medium `routed to the link, not credited`; Low `ambiguous or contradicted — nothing`; No candidate `no click from this network in the window`.

### Read the referrer status chips

Each chip is the result of the SDK's install-referrer read on Android. Amber chips are the ones to act on.

| Chip | Value | Meaning | What to do |
|---|---|---|---|
| referrer delivered | `ok` | The store handed back a referrer. If it carried `dtg_click`, the install is matched at `guaranteed`. If not, the install came through the store without a DecTog redirect and the ladder moved on. | Nothing, unless `ok` installs are organic: check that the tap went through a tagged store URL (below). |
| store reported organic | `organic` | Google Play returned its organic marker or an empty referrer. The install did not come through a tagged store link. | Check the path the tap took. The QR page's store buttons are untagged, a custom `redirect_url` or `dec_redirect` to a non-store host is never tagged, and custom vivo store URLs are never tagged. |
| store too old for the API | `feature_not_supported` | The Play Store on the device does not support the Install Referrer API. Final. | Nothing. The fingerprint still runs. |
| store service unavailable | `service_unavailable` | No connection to the Play Store service after up to three connection attempts, 3 seconds apart. | The SDK asks again on up to five later launches and sends a late claim; `onAppInstalled` emits the upgraded verdict. |
| developer error | `developer_error` | Play rejected the call after every retry. | Check that the installed build has the Install Referrer client available and is not stripped by your build tooling. |
| permission error | `permission_error` | The store refused the read. Final. | Nothing. |
| timed out | `timeout` | The read exceeded `installReferrerTimeout` (default 5 seconds). | The SDK retries on later launches and claims late. Raise `installReferrerTimeout` if your first launch is short. |
| read error | `error` | Any other failure. | Retried on later launches. Turn on `enableDebugLogging` to see the exception. |
| no store app | `not_available` | No Play Store (or no reader for the store that installed the app). Final. | For Huawei and vivo devices nothing is needed. For Galaxy Store and GetApps add the Samsung or Xiaomi referrer library to the host app. |
| iOS (no referrer API) | `not_android` | Expected on iOS. | iOS attribution uses the pasteboard and the fingerprint. |
| not reported (older SDK) | `unknown` | The app did not send a status. | Update the app to the current SDK. |

"Missing" in the coverage figure counts `service_unavailable`, `timeout`, `error` and `not_available`.

### The click was never recorded

- Bots and link unfurlers get the preview page and no click: any user agent containing `bot` (as a word), `crawler`, `spider`, `preview`, `fetcher`, `monitor`, `headless`, `whatsapp` or the named social crawlers, and any request Cloudflare scores below 30. A plain `curl` is not on the list; unless Cloudflare scores it below 30, it records a click.
- Hint-less Chromium: the first request from a mobile Chromium browser that sends `Sec-CH-UA-Mobile: ?1` without a `Sec-CH-UA-Model` header, has no `Build/` token in its user agent and no in-app marker, gets a 302 with `Critical-CH` and records nothing. Chrome retries with the hint and the retry records the click. A client that never retries leaves no click row. The install can still be matched: the Play and OEM store referrers carry `dtg_l=<username>/<slug>`, and the server synthesizes the click from it. With the mobile interstitial on, the same happens through a one-shot self-redirect carrying `?_ch=1`.
- In-app browsers (Facebook, Instagram and WebViews on Android) never take the hint path and never get the intent bounce. They get a plain 302 to the tagged store URL, so referrer attribution still works for them.
- The demo seed's installs carry no IP hash and never fingerprint-match. Its attributed installs are all Android referrer matches and its organic ones all iOS. Do not judge the fingerprint with the demo account.

### The fingerprint found nothing

- Candidates are web clicks from an iOS or Android user agent with the same hashed IP and the same OS family as the install that no other install has claimed. Clicks the SDK logged from inside the app and desktop clicks are never candidates.
- The window is 24 hours only when both the click and the install carry a device model and the install is not on cellular. Everything else gets 2 hours, or the low-entropy window of the account's oldest app (1 to 720 hours), never more than the wide window. With `collectDeviceData: false` the install carries no model or screen data and only ever gets the short window.
- `medium` confidence returns a `routing` candidate but no credit. `low` returns nothing. See [How attribution works](/start/how-attribution-works/).
- One install per click. A click another install already consumed moves the ladder on; `click_reuse` is flagged only when nothing later matches.
- App updates (`install_state: update`) never run the fingerprint; the panel's "kept out of matching" line counts them. Reinstalls (`is_reinstall`) run the full ladder and the fingerprint. They are left out of the Installs KPI and the per-link counts, not out of matching, so a reinstall can hold a click that the install you are looking for needed.

### Strict fraud mode made it organic

With strict fraud mode on (Apps, Advanced), an install that trips any rule (`emulator`, `impossible_speed`, `install_velocity_ip`, `click_storm_ip`, `stale_referrer`, `click_reuse`) is stored with `matched: false` and `match_source: null`. It keeps `match_confidence`, `referrer_source` and `matched_slug`, so the webhook carries `slug` next to `matched: false`. The click stays consumed. Strict mode is read from the account's oldest app. The fraud box on the Overview and the chips on a customer's detail page show the rules that fired.

### iOS specifics

- The pasteboard read is on by default. It only attributes when the link was on the pasteboard: turn on iOS tap-to-store (Apps, Advanced) so the "Get the app" button copies the link before opening the App Store. See [Deterministic attribution](/sdk/deterministic-attribution/).
- On iOS 16 and later the read shows the system "Allow paste from …?" alert when the pasteboard holds a URL. A user who declines leaves the install on the fingerprint. `willShowPasteboardPrompt()` tells you in advance; `DectogPasteButton` lets the user paste later and sends a late claim.
- Simulators cannot install from the App Store and do not open Universal Links. Test on a device.

### Check the SDK side

- `onAppInstalled` emits once per install, plus once more when a late claim upgrades the verdict. `currentAppInstall` holds the latest verdict. To retest, uninstall the app; on Android `adb shell pm clear <package>` also works. The SDK keeps its state in `.dectog_install.json` in a backup-excluded directory and validates it against the package's first-install time, so a restored backup does not suppress a real install.
- Set `enableDebugLogging: true` and look for the install POST. A 401 means the key was regenerated or is wrong; the server's four 401 bodies are listed under [Automation and agents](/guides/automation-and-agents/). A 429 is retried after `Retry-After` (up to 10 seconds in-process, otherwise on the next launch).

## App Links do not verify (Android)

| Symptom | Cause | Fix |
|---|---|---|
| Taps open Chrome or the store although the app is installed | The domain is not verified for the installed build | `adb shell pm get-app-links <package>` must list `{username}.dectog.com` as `verified`. Reinstall after changing the manifest or the fingerprints; Android verifies at install and update. |
| Verify shows `N package(s), MISSING fingerprints` | No fingerprint saved for the package | Add the SHA-256 fingerprints on the Apps page. |
| Verification fails although a fingerprint is saved | The saved fingerprint is not the one that signed the installed build | Store builds are signed by the Play App Signing key. Copy it from Play Console (Setup, App signing) and add it next to your upload and debug keys. Fingerprints are 32 colon-separated hex pairs; the server stores them uppercase. |
| Only some hosts verify | The intent filter uses a wildcard | Intent filters do not support wildcards. Add an `android:autoVerify="true"` filter per host and list `{username}.dectog.com` explicitly. |
| Verification never succeeds in development | Dev hosts (`10.0.2.2`, `localhost`) cannot serve an assetlinks file Android accepts | Expected. Android 12 and later open those links only from explicit intents (`adb shell am start`) or after the user enables the link in system settings. |
| Verify shows `Endpoint replied 404: Configuration not found` | No app on the account has a package | Save the package first. The well-known files are account-wide and built from every app. |

Until verification succeeds, taps from a Chrome-engine browser (user agent contains `Chrome/`) still reach the app through an `intent://` bounce, provided the app has both a scheme and a package. In-app browsers never get the bounce. See [Platform setup](/sdk/platform-setup/).

## Universal Links do not open the app (iOS)

| Symptom | Cause | Fix |
|---|---|---|
| Verify shows `No app IDs configured` or `Endpoint replied 404: Configuration not found` | The AASA is built only from apps that have both a bundle ID and a Team ID | Save both on the Apps page. The file then serves at `https://{username}.dectog.com/.well-known/apple-app-site-association` and includes `webcredentials`. |
| Taps open Safari although the file verifies | The entitlement is missing or the app was not reinstalled | Add `applinks:{username}.dectog.com` to the Associated Domains entitlement of every build configuration, enable the capability on the App ID, then reinstall. iOS fetches the AASA at install and update; an installed app never picks up a change. |
| The entitlement is `applinks:*.dectog.com`, as the Apps page tooltip and its "Copy for AI" prompt suggest | For a wildcard entry iOS fetches the AASA from the parent domain, `https://dectog.com/.well-known/apple-app-site-association`, and the apex answers 400 `{"error":{"code":"invalid_request","message":"Subdomain not found in host"}}` | Use the explicit host: `applinks:{username}.dectog.com`. |
| Works from Notes but not from the address bar | Typing a URL into Safari never triggers a Universal Link | Tap the link from Notes, Messages or another app. |
| Nothing works locally | The AASA must be served from a real domain over HTTPS | Path-mode and `localhost` deployments cannot pass; test against a deployed domain. The Simulator does not open Universal Links either. |
| A redirect to `myapp://` does nothing | iOS never opens a custom scheme from a server redirect | Custom schemes open only from a direct tap: the "Open in app" button of the tap-to-store page or the buttons on the QR page. |

## Links open the browser or the store instead of the app

- The domain is not verified for the installed build: see the two sections above.
- The tap came from an in-app browser. Android in-app browsers and WebViews get a plain 302 to the store, never the intent bounce. On iOS the tap-to-store page leads with "Open in app" inside Facebook, Instagram, Messenger, LINE, WeChat, Snapchat, TikTok and X when the app has an iOS scheme; otherwise the visitor gets the store.
- The visitor is on a desktop user agent, which includes iPadOS Safari in desktop mode. Desktop never redirects to the target; it gets the QR page or a fallback URL. See [How a tap is routed](/links/how-a-tap-is-routed/).
- The SDK reports `Invalid DecTog URL format`: the tapped host does not match `baseUrl` and `linkRootDomain`. On the hosted service leave both unset.
- The app has no store URL: a phone without the app goes to the app's fallback URL, then the link target, then the QR page. Add the store URLs on the Apps page.

## 429 Too Many Requests

| Limit | Scope | Behavior |
|---|---|---|
| 3000 per minute | The account | `{"error":{"code":"rate_limited","message":"Rate limit exceeded"}}` with `Retry-After` |
| 60 per minute | A `device_id` (SDK calls) | Same |
| 600 per minute | The account plus the caller's IP, for calls without a `device_id` (every link call from a script) | Same |
| 120 per minute | The interstitial beacon `POST /_/collect`, per IP | 429 with an empty body; this limiter also returns 429 when its database write fails |
| 5 per hour | The contact form, per IP | `Too many messages — try again later`, no `Retry-After` |

`Retry-After` is the number of seconds until the current one-minute window ends, at least 1. Windows are aligned to the clock, not sliding. When the limiter's database is unavailable, SDK and API requests go through. The SDK honors `Retry-After` up to 10 seconds in-process and defers longer waits to the next launch; event batches rejected with 429 stay queued. Scripts should sleep for `Retry-After` seconds. See [API overview](/api/overview/).

## Install webhook: "Send test"

The button appears only while editing an existing app and is disabled while the URL box is empty. It posts `event: "app.installed"` with `test: true`, `matched: false`, `type: "organic"` and `device_model: "DecTog test probe"` to the saved URL, signed like a real delivery (`x-dectog-signature: sha256=<hex>` over the raw body, `x-dectog-timestamp` separate and unsigned), with a 10-second timeout.

| Message | Meaning |
|---|---|
| `Test event delivered — endpoint replied 200` | Your endpoint answered 2xx |
| `Event delivered, but the endpoint replied 500` | Your endpoint answered, but not with 2xx |
| `Save the webhook URL and secret first` | The server needs both the URL and the secret saved. The button checks only the URL box, so an unsaved or empty secret ends here. |
| `Webhook delivery failed: <reason>` | Network failure or timeout |

Real deliveries are fire-and-forget with no retries, and they go to the webhook of the account's oldest app. See [Install webhook](/api/install-webhook/).

## Social preview: "Auto-fill from fallback URL"

The button fills empty preview fields from the fallback URL's Open Graph tags. It follows redirects, waits 8 seconds, reads at most 512 KB and only fetches public hosts.

| Message | Meaning |
|---|---|
| `Enter a valid http(s) URL` | The value is not a URL |
| `Enter a valid public http(s) URL` | Not http or https, or a private, loopback or link-local host (`localhost`, `.local`, `.internal`, `10.`, `127.`, `192.168.`, `172.16-31.`, `169.254.`, `100.64-127.`, `::1`, `fc`, `fd`, `fe80`) |
| `Couldn't reach that URL` | Connection failure or timeout |
| `That URL returned HTTP 503` | The page answered with a non-2xx status |
| `That URL isn't an HTML page` | The `Content-Type` is not HTML or XML |
| `No title, description or image found on that page` | The page has no usable `og:*`, `twitter:*`, `<title>` or `description` tags |

Titles and descriptions are cut to 150 characters. See [Social previews and QR](/links/social-previews-and-qr/).

## Google sign-in

| Message | Meaning |
|---|---|
| `Google sign-in was cancelled.` | You closed Google's consent screen |
| `Google sign-in timed out — please try again.` | The OAuth state cookie (10 minutes) was missing or did not match when Google sent you back |
| `Couldn't verify your Google account — please try again.` | Google's token could not be exchanged or checked, or the Google email is not verified |
| `No DecTog account uses that Google email, and signup is currently closed.` | Signups are closed and no account has that email |
| `That email is already linked to a different Google account.` | The account with that email is linked to another Google identity |
| `Google sign-in is not available right now.` | Google sign-in is not configured on this deployment |

A Google sign-in whose verified email matches an existing account links that account automatically. New Google users have 15 minutes to choose a username; after that the username step answers `Google sign-in expired — try again` and you start over. Google-only accounts have no usable password; set one with "Forgot password?". Reset links are valid for one hour, work once, and a new request cancels older ones: `This reset link is invalid or has expired`, `This reset link has already been used`. See [Account and sign-in](/dashboard/account-and-sign-in/).

## 404 and 410 pages

| Response | When | Page text |
|---|---|---|
| 302 to `https://dectog.com/` | The username does not exist | None (hosted service) |
| 404 page | The slug does not exist, or a temporary link was purged | `Link not found` and `This DecTog link does not exist.` |
| 410 page | A temporary link has expired, bots included | `Link expired` and `This temporary link has expired and is no longer available.` |
| JSON `404 {"error":{"code":"not_found","message":"Not found"}}` | Two or more path segments on a link host | None |

Both HTML pages carry `noindex`, a "Go to DecTog" button and the footer `Check the link for typos, or ask whoever shared it for a new one.`

Expired temporary links keep answering `GET /api/v1/resolve/{username}/{slug}` with 200 and `is_expired: true` until the daily purge removes links expired for more than 24 hours. After that the slug is free and the link is a 404. Deleting a link from the dashboard removes its clicks, installs, events and opens from the Overview. See [Temporary links](/links/temporary-links/).
