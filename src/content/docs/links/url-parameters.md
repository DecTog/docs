---
title: URL parameters
description: The dec_* query parameters that change routing, set the in-app route or tag a click per share, the utm_* parameters the Overview charts use, and the parameters DecTog reserves.
sidebar:
  order: 2
---

Any link can be shared with query parameters that change what happens on that tap. Only keys prefixed `dec_` are read for routing and tracking; `utm_*` keys are stored for analytics. The parameters are not stored on the link, so the same link can be shared many ways:

```text
https://acme.dectog.com/welcome?dec_campaign=newsletter&dec_deeplink=products/42&utm_source=email
```

The same parsing applies to clicks the SDK reports when a link opens the installed app: the SDK sends the opened URL's `dec_*` keys as `link_params`, and the server validates them exactly as it does for a browser tap.

## `dec_deeplink`: the in-app route

`dec_deeplink` replaces the link's **iOS deep link path** and **Android deep link path** for this tap, on both platforms.

| Accepted value | Example | Stored as |
|---|---|---|
| A bare route with an optional query | `products/42?color=black` | `products/42?color=black` |
| The route behind one of the app's own schemes (case-insensitive) | `myapp://products/42` | `products/42` |
| Any other scheme | `https://example.com/x` | Dropped |

The route may be at most 512 characters and may not contain `:`, whitespace, `#`, `;` or control characters. A leading `/` is stripped. The app the value is checked against is the link's app, or the default app.

Where the route is used:

- the Android `intent://` bounce (`intent://products/42?color=black&dtg_click=<id>`);
- the interstitial's **Open app** button and the tap-to-store page's **Open in app** button (`myapp://products/42?color=black&dtg_click=<id>`);
- the QR page's "Open in app" buttons (without `dtg_click`).

The value is stored on the click as `link_params.deep_link` and returned to the app after an attributed install as `deep_link` (`DectogAppInstallResponse.deepLink`, also on `routing.deepLink` for medium-confidence routing). On a warm open the SDK exposes it as `DectogLinkClick.clickParams.deepLink`. Without a path, scheme links take the form `myapp://acme/welcome`.

## Redirect and fallback parameters

These override the destination for one tap. Each value must be an http(s) URL of at most 2048 characters; it is normalized and used as is. They are never stored.

| Parameter | Applies to | Effect |
|---|---|---|
| `dec_redirect_ios`, `dec_redirect_android` | That mobile platform | Replaces the store as the destination for a visitor without the app. If the URL's host is a store (`apple.com` and subdomains on iOS; `play.google.com` or a Huawei, Samsung or Xiaomi store host on Android), the attribution tag is added; otherwise the URL is used verbatim. |
| `dec_redirect_macos`, `dec_redirect_windows`, `dec_redirect_linux` | That desktop OS | The destination, ahead of `dec_fallback`, the link's desktop fallback, the app fallback and the QR page. |
| `dec_redirect` | Every platform without its own `dec_redirect_<platform>` | Same as above for the platform it lands on. |
| `dec_fallback` | Desktop, and mobile visitors with no destination at all | Used after the platform redirects and before the link's desktop fallback. Ignored on a mobile tap that has a store, custom redirect, app fallback or target. |

The platform is derived from the user agent:

| Visitor | Platform key |
|---|---|
| User agent contains `iPhone`, `iPad` or `iPod` | `ios` |
| User agent contains `Android` | `android` |
| macOS, including iPadOS Safari in desktop mode | `macos` |
| Windows | `windows` |
| Linux | `linux` |
| Anything else | None: only `dec_redirect` applies |

The full order in which these compete with the link's and the app's own settings is in [How a tap is routed](/links/how-a-tap-is-routed/).

## Tracking parameters

Five free-form values are stored on the click and handed back to the app after an attributed install:

| Parameter | Falls back to |
|---|---|
| `dec_label` | The link's **Label** |
| `dec_campaign` | The link's **Campaign** |
| `dec_adgroup` | The link's **Adgroup** |
| `dec_creative` | The link's **Creative** |
| `dec_tracker` | Nothing; it has no link-level default |

Each value is trimmed; an empty value or one with control characters is dropped; longer values are truncated to 255 characters. The link's defaults are the Tracking fields of a permanent link (temporary links have none). The six stored values (`deep_link` plus the five above) live in the click's `link_params` and come back as `click_params` on the verdict and on the webhook, and as `DectogClickParams` in the SDK, with `deepLink`, `label`, `campaign`, `adgroup`, `creative` and `tracker`.

:::caution[Tracking values do not feed the Overview charts]
The Overview's **Installs by campaign** and **Installs by source** charts group installs by the `utm_campaign` and `utm_source` of the matched click, not by `dec_campaign` or the link's Tracking fields. Use `utm_*` for dashboard charts and `dec_*` for values your app needs at runtime.
:::

## `utm_*` parameters

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` are stored on the click verbatim. A key the tapped URL does not carry is taken from the link's own UTM values, or its template's, when it has them (see below). They are kept as long as the click (the retention window) and drive two Overview charts: installs grouped by the matched click's `utm_campaign` (`(direct)` when the click had none, `Organic` when the install matched nothing) and by its `utm_source`. The SDK sends the same five keys when it reports a click from an opened URL.

### Link-level UTM values

A link can carry its own `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` (API fields of the same names; **Tracking** in the link drawer), directly or from its [template](/api/links/#templates). They do two things:

- A click whose URL has no value for a key stores the link's.
- Every web destination of a tap gets the link's values added as query parameters, each only when the destination URL has none of its own: the desktop fallback, the custom redirect, the app's Fallback URL, the link's target, and a `dec_redirect` or `dec_fallback` URL. Store URLs never get them, and neither do scheme and `intent://` URLs.

So `https://shop.example.com/sale` behind a link with `utm_source=newsletter` opens as `https://shop.example.com/sale?utm_source=newsletter`, and the shop's web analytics name the same campaign as DecTog.

## Your own parameters

Keys without the `dec_` or `utm_` prefix are not read. A browser tap stores only its `dec_*` and `utm_*` values, so after a deferred install those are all that come back on the verdict: `?productId=42` on a shared link does not survive the trip through the store. On a warm open the SDK gives the app the whole opened URL, so `click.queryParameters['productId']` (`DectogLinkClickX`) works there, but only there, and the SDK reports none of those keys to the server.

To send a route that works on both paths, put it in `dec_deeplink`: `?dec_deeplink=products/42`. The prefix also keeps DecTog's keys apart from your website's own parameters. The reasons are in [Design decisions](/start/design-decisions/).

## Reserved parameters

| Parameter | Set by | Meaning |
|---|---|---|
| `dtg_click` | DecTog | The click id, added to store URLs (inside `referrer` or `ct`), to scheme and `intent://` URLs and to the copied link. Do not add it to links you share; a reported click with an unknown id gets a fresh id. |
| `_ch` | DecTog | The marker of the one-shot client-hints redirect in front of the interstitial. |

## Validation and what reaches the destination

Each invalid parameter is dropped on its own; the rest still apply, and routing continues as if the dropped one were absent. Parameters are never forwarded: the visitor is sent to the destination URL as configured, and the only additions DecTog makes are the store tags (`ct` on the App Store, `referrer` on Google Play and the OEM stores), `dtg_click` on scheme and intent URLs, and the link's own UTM values on web destinations, plus `dtg_click` on web destinations for a link with **Add the click id to website destinations** on (see [Web pixel](/sdk/web/)). Social-preview bots and the QR code ignore parameters entirely; see [Social previews and the QR page](/links/social-previews-and-qr/).
