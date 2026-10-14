---
title: How a tap is routed
description: Every decision the redirect engine makes between a tap on a DecTog link and the destination, on mobile, on desktop and for bots, and when the click is recorded.
sidebar:
  order: 1
---

A link such as `https://acme.dectog.com/welcome` is served by the redirect engine. This page lists its decisions in the order the server takes them. The examples use the hosted service; on a self-hosted path-mode deployment the same link is `{PUBLIC_BASE_URL}/r/acme/welcome`.

## Entry points

| Request | Handled when |
|---|---|
| `https://{username}.dectog.com/{slug}` | Subdomain mode. Exactly one path segment; two or more return JSON `404 {"error":{"code":"not_found","message":"Not found"}}`. |
| `{base}/r/{username}/{slug}` | Any host, any mode. |
| `{base}/?user={username}/{slug}` | Any host except the dashboard host. |
| `https://{username}.dectog.com/` | No slug: a known username is sent to the dashboard, an unknown one to `UNKNOWN_HOST_REDIRECT`. |

## Decision order

| # | Check | Result |
|---|---|---|
| 1 | The username does not exist | `302` to `UNKNOWN_HOST_REDIRECT` (`https://dectog.com/` on the hosted service), or the 404 page when that variable is unset. Applies in path mode too. |
| 2 | The slug is a temporary link whose `expires_at` has passed | `410` page, for bots as well |
| 3 | No permanent or temporary link has this slug | `404` page |
| 4 | The request is a `HEAD`, the user agent is a bot, or Cloudflare's bot score is below 30 | `200` social preview page, **no click recorded**. See [Social previews and the QR page](/links/social-previews-and-qr/). |
| 5 | Otherwise | A click row is built. The app is the link's app, or the account's default (oldest) app. |
| 6 | The user agent is iOS or Android | The mobile chain below |
| 7 | Anything else, or a mobile visitor with no destination at all | The shared tail below |

"iOS" means the user agent contains `iPhone`, `iPad` or `iPod`; "Android" means it contains `Android`, tablets included. Everything else is desktop, including iPadOS Safari in its default desktop mode, which reports itself as macOS.

## The click row

The click gets a 16-character id (the `dtg_click` value), `source: web`, the link kind, device type, OS (the Android major version comes from the client hint when present), browser, device model (from the `Sec-CH-UA-Model` hint or a WebView `Build/` token), CPU architecture, the user agent (512 characters), `Accept-Language` (128 characters), country, region, city and ASN from Cloudflare, the salted IP hash plus the raw IP, the referring page's origin (null when the referrer is DecTog itself), the `utm_*` values and the `dec_*` tracking values. The interstitial and tap-to-store pages add the screen size, pixel ratio, touch points and connection type later. Permanent links also increment their lifetime click counter; temporary links have none.

## Mobile: choosing the destination

The server resolves one destination for a visitor without the app. The first non-null entry wins:

| # | Candidate | Notes |
|---|---|---|
| 1 | A custom redirect whose host is a store, re-tagged | Custom redirect means, in order: `dec_redirect_ios` / `dec_redirect_android`, then `dec_redirect`, then the link's **If the app isn't installed (mobile) > Custom URL** (`redirect_url`). Store hosts are `apple.com` and its subdomains on iOS; `play.google.com` and the Huawei, Samsung and Xiaomi store hosts on Android. The attribution tag is added. |
| 2 | A custom redirect, verbatim | Any other custom redirect URL. Not an install path, so no tag. |
| 3 | The tagged store URL | iOS: the app's App Store URL with `ct=dtg_click=<id>`. Android: the visitor's OEM store when configured, else the Play Store URL, with `referrer=dtg_click=<id>&dtg_l={username}/{slug}`. See [App stores and OEM routing](/links/app-stores-and-oem-routing/). |
| 4 | The **app's** Fallback URL | This outranks the link's own target on mobile. |
| 5 | The link's target (its **Fallback URL**) | |
| 6 | Nothing | The visitor falls through to the shared tail: `dec_fallback`, then the link's desktop fallback, then the QR page. |

A permanent link's deep-link paths and a `dec_deeplink` parameter do not change the destination; they only change the in-app route used by the intent bounce and the "Open in app" buttons.

## Mobile: delivering it

With a destination in hand, the response depends on the app's settings and the browser. The first matching row applies:

| # | Condition | Response | Click recorded |
|---|---|---|---|
| a | iOS, **iOS tap-to-store** is on, and the destination is the App Store (a tagged `apple.com` custom redirect, or no custom redirect and an App Store URL) | `200` tap-to-store page | Before the response |
| b | **Mobile beacon interstitial** is on and a destination exists | `200` interstitial page. Hint-less Chromium first gets a one-shot `302` to the same URL with `?_ch=1` and `Critical-CH`, which inserts nothing. | Before the response |
| c | Hint-less Chromium (see below) | `302` with `Critical-CH` | **Not yet.** Chrome retries the navigation with the model hint and the retry records it. |
| d | Android intent bounce applies | `302` to an `intent://` URL | Before the response |
| e | Any other destination | `302` | After the response, in the background |
| f | No destination | Shared tail | After the response, in the background |

### Android intent bounce

The bounce opens the installed app directly from Chrome when App Links verification has not happened yet, and lands everyone else on the store. It is used only when all of these hold: the device is Android; the app has both an **Android app scheme** and an **Android package**; the user agent contains `Chrome/` (Samsung Internet and Edge qualify); the user agent is not an in-app browser or WebView (`; wv)`, `FB_IAB`, `FB4A`, `FBAV`, `Instagram`); and a destination exists.

```text
intent://{path or username/slug}?dtg_click=<id>#Intent;scheme={scheme};package={package};S.browser_fallback_url={encoded destination};end
```

`{path}` is `dec_deeplink`, else the link's **Android deep link path**. The SDK reads `dtg_click` from the opened URL and converts the web click into the app's own click instead of logging a second one. Verified App Links bypass the browser, and the server, entirely.

### The interstitial page

Turned on per app with **Mobile beacon interstitial**. The page is titled "Opening the app…", carries `noindex`, and on load POSTs the screen width and height, pixel ratio, touch points and connection type to `/_/collect`, which updates the click row once. It then routes automatically: to the intent bounce after 450 ms when the bounce applies, otherwise to the destination after 300 ms. A custom scheme is never tried automatically. After 1.6 seconds it shows "Taking too long?" with an **Open app** button; that tap copies `https://acme.dectog.com/welcome?dtg_click=<id>` to the clipboard, tries the scheme URL when the app has one, and after 2 seconds goes to the destination if the page is still visible. Without JavaScript a plain **Continue** link remains. When iOS tap-to-store is also on, iPhone taps take the tap-to-store page instead, so the switch affects Android only.

### The iOS tap-to-store page

Turned on per app with **iOS tap-to-store**. iOS has no install referrer and Safari only writes the pasteboard from a user gesture, so this page replaces the automatic redirect with one button. It is titled "Get {app name}" and shows **Get {app name}** plus, when the app has an iOS scheme, a secondary **Open in app** button. Inside the Facebook, Instagram, Messenger, LINE, WeChat, Snapchat, TikTok and X in-app browsers, and only when a scheme exists, the heading becomes "Continue in the app" and **Open in app** comes first. The Get tap shows a "Link saved" notice, writes `https://acme.dectog.com/welcome?dtg_click=<id>` to the pasteboard and opens the tagged store URL; a 600 ms safety timer opens the store even if the write never settles. **Open in app** only navigates to the scheme URL. There are no timers before the tap, and the same beacon as the interstitial fires on load. Without JavaScript the page shows an **Open the App Store** link.

### Client hints and hint-less Chromium

Modern Chrome freezes its Android user agent, so the device model only arrives through the `Sec-CH-UA-Model` client hint. Every engine response except the bot, 404, 410 and unknown-user ones carries `Accept-CH: Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Arch`, so later taps on the same subdomain arrive with hints. A request is "hint-less Chromium" when the model header is absent (an empty value counts as present), the user agent has no `Build/` token and no in-app marker, and `Sec-CH-UA` is present with `Sec-CH-UA-Mobile: ?1`. Such a request is answered with `Critical-CH`, which makes Chrome repeat the navigation with the hints; only the repeat records the click. A client that never retries leaves no web click, but an install can still be attributed through the store referrer, which names the link.

## Desktop and the shared tail

Desktop visitors, and mobile visitors with no destination, take this chain. The first non-null entry wins:

| # | Candidate |
|---|---|
| 1 | `dec_redirect_macos`, `dec_redirect_windows` or `dec_redirect_linux` for the visitor's OS, else `dec_redirect` |
| 2 | `dec_fallback` |
| 3 | The link's **If the app can't open the link (desktop) > Custom URL** (`fallback_url`) |
| 4 | The app's Fallback URL |
| 5 | The branded QR page |

Desktop never redirects to the link's target automatically. The target only appears on the QR page as the "Continue to {host} on desktop" link, and only when a target exists. The QR page encodes the canonical link URL, lists the store buttons and the "Open in app" buttons, and is described in [Social previews and the QR page](/links/social-previews-and-qr/).

## Error pages

| Status | Page | When |
|---|---|---|
| 404 | "Link not found" / "This DecTog link does not exist." | Unknown slug, or unknown username when `UNKNOWN_HOST_REDIRECT` is unset |
| 410 | "Link expired" / "This temporary link has expired and is no longer available." | Expired temporary link, until the daily purge removes it (after that: 404) |

Both pages carry `noindex`, a status chip, a **Go to DecTog** button pointing at `https://dectog.com/` and the footer "Check the link for typos, or ask whoever shared it for a new one." Two or more path segments on a tenant host return JSON `404 {"error":{"code":"not_found","message":"Not found"}}` instead.

## When the click is recorded

| Path | Click |
|---|---|
| `HEAD`, bot user agent, or Cloudflare bot score below 30 | None |
| 404, 410, unknown username | None |
| `x-dectog-no-track: 1` header or `?dtg_nt=1` on the link | None. Routing is exactly that of a real tap; use it for QA taps and uptime monitors. The parameter never reaches the destination. |
| Tap-to-store page, interstitial page, intent bounce | Written before the response is sent |
| Hint-less Chromium plain redirect | None on the first request; the hinted retry writes it |
| Every other redirect and the QR page | Written in the background after the response |
| A verified Universal Link or App Link opening the installed app | The browser never contacts the server. The SDK reports the open as a click with `source: mobile_app` and as an app open. |

Each tap nets at most one click: when the SDK reports a click that carries a `dtg_click` id the server already has, the existing web row is converted to `source: mobile_app` instead of inserting another. A web click that was never written can still be recreated from the store referrer at install time; see [How attribution works](/start/how-attribution-works/).
