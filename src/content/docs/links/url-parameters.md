---
title: URL parameters
description: The adto_* query parameters that change routing, set the in-app route or tag a click per share, the utm_* parameters the Overview charts use, and the parameters AdTo reserves.
sidebar:
  order: 2
---

Any link can be shared with query parameters that change what happens on that tap. Only keys prefixed `adto_` are read for routing and tracking; `utm_*` keys are stored for analytics. The parameters are not stored on the link, so the same link can be shared many ways:

```text
https://acme.adto.app/welcome?adto_campaign=newsletter&adto_deeplink=products/42&utm_source=email
```

The same parsing applies to clicks the SDK reports when a link opens the installed app: the SDK sends the opened URL's `adto_*` keys as `link_params`, and the server validates them exactly as it does for a browser tap.

## `adto_deeplink`: the in-app route

`adto_deeplink` replaces the link's **iOS deep link path** and **Android deep link path** for this tap, on both platforms.

| Accepted value | Example | Stored as |
|---|---|---|
| A bare route with an optional query | `products/42?color=black` | `products/42?color=black` |
| The route behind one of the app's own schemes (case-insensitive) | `myapp://products/42` | `products/42` |
| Any other scheme | `https://example.com/x` | Dropped |

The route may be at most 512 characters and may not contain `:`, whitespace, `#`, `;` or control characters. A leading `/` is stripped. The app the value is checked against is the link's app, or the default app.

Where the route is used:

- the Android `intent://` bounce (`intent://products/42?color=black&adto_click=<id>`);
- the interstitial's **Open app** button and the tap-to-store page's **Open in app** button (`myapp://products/42?color=black&adto_click=<id>`);
- the QR page's "Open in app" buttons (without `adto_click`).

The value is stored on the click as `link_params.deep_link` and returned to the app after an attributed install as `deep_link` (`AdtoAppInstallResponse.deepLink`, also on `routing.deepLink` for medium-confidence routing). On a warm open the SDK exposes it as `AdtoLinkClick.clickParams.deepLink`. Without a path, scheme links take the form `myapp://acme/welcome`.

## Redirect and fallback parameters

These override the destination for one tap. Each value must be an http(s) URL of at most 2048 characters; it is normalized and used as is. They are never stored.

| Parameter | Applies to | Effect |
|---|---|---|
| `adto_redirect_ios`, `adto_redirect_android` | That mobile platform | Replaces the store as the destination for a visitor without the app. If the URL's host is a store (`apple.com` and subdomains on iOS; `play.google.com` or a Huawei, Samsung or Xiaomi store host on Android), the attribution tag is added; otherwise the URL is used verbatim. |
| `adto_redirect_macos`, `adto_redirect_windows`, `adto_redirect_linux` | That desktop OS | The destination, ahead of `adto_fallback`, the link's desktop fallback, the app fallback and the QR page. |
| `adto_redirect` | Every platform without its own `adto_redirect_<platform>` | Same as above for the platform it lands on. |
| `adto_fallback` | Desktop, and mobile visitors with no destination at all | Used after the platform redirects and before the link's desktop fallback. Ignored on a mobile tap that has a store, custom redirect, app fallback or target. |

The platform is derived from the user agent:

| Visitor | Platform key |
|---|---|
| User agent contains `iPhone`, `iPad` or `iPod`, or an iPad asking for desktop sites (see [How a tap is routed](/links/how-a-tap-is-routed/)) | `ios` |
| User agent contains `Android` | `android` |
| macOS | `macos` |
| Windows | `windows` |
| Linux | `linux` |
| Anything else | None: only `adto_redirect` applies |

The full order in which these compete with the link's and the app's own settings is in [How a tap is routed](/links/how-a-tap-is-routed/).

## Tracking parameters

Five free-form values are stored on the click and handed back to the app after an attributed install:

| Parameter | Falls back to |
|---|---|
| `adto_label` | The link's **Label** |
| `adto_campaign` | The link's **Campaign** |
| `adto_adgroup` | The link's **Adgroup** |
| `adto_creative` | The link's **Creative** |
| `adto_tracker` | Nothing; it has no link-level default |

Each value is trimmed; an empty value or one with control characters is dropped; longer values are truncated to 255 characters. The link's defaults are the Tracking fields of a permanent link (temporary links have none). The six stored values (`deep_link` plus the five above) live in the click's `link_params` and come back as `click_params` on the verdict and on the webhook, and as `AdtoClickParams` in the SDK, with `deepLink`, `label`, `campaign`, `adgroup`, `creative` and `tracker`.

## `adto_referrer`: who shared the link

`adto_referrer` names the customer who shared this link, by the id your app passes to `identify`:

```
https://acme.adto.app/invite?adto_referrer=1042&adto_label=spring
```

It is stored on the click, not in `click_params`. An install credited to the tap gets it as `install.link?.referrerCustomerId`, and the new user's first `identify` records a referral and sends `referral.converted`, exactly as a [referral link](/guides/referral-programs/) does. On a referral link the link's own customer wins and `adto_referrer` is ignored. The value is trimmed; one longer than 200 characters or with control characters is dropped, never cut. Anyone can edit the URL to name another customer, so when that matters, give each customer a referral link instead.

:::caution[Tracking values do not feed the Overview charts]
The Overview's **Installs by campaign** and **Installs by source** charts group installs by the `utm_campaign` and `utm_source` of the matched click, not by `adto_campaign` or the link's Tracking fields. Use `utm_*` for dashboard charts and `adto_*` for values your app needs at runtime.
:::

## `utm_*` parameters

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` are stored on the click verbatim. A key the tapped URL does not carry is taken from the link's own UTM values, or its template's, when it has them (see below). They are kept as long as the click (the retention window) and drive two Overview charts: installs grouped by the matched click's `utm_campaign` (`(direct)` when the click had none, `Organic` when the install matched nothing) and by its `utm_source`. The SDK sends the same five keys when it reports a click from an opened URL.

### Link-level UTM values

A link can carry its own `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` (API fields of the same names; **Tracking** in the link drawer), directly or from its [template](/api/links/#templates). They do two things:

- A click whose URL has no value for a key stores the link's.
- Every web destination of a tap gets the link's values added as query parameters, each only when the destination URL has none of its own: the desktop fallback, the custom redirect, the app's Fallback URL, the link's target, and a `adto_redirect` or `adto_fallback` URL. Store URLs never get them, and neither do scheme and `intent://` URLs.

So `https://shop.example.com/sale` behind a link with `utm_source=newsletter` opens as `https://shop.example.com/sale?utm_source=newsletter`, and the shop's web analytics name the same campaign as AdTo.

## Your own parameters

Keys without the `adto_` or `utm_` prefix are not read. A browser tap stores only its `adto_*` and `utm_*` values, so after a deferred install those are all that come back on the verdict: `?productId=42` on a shared link does not survive the trip through the store. On a warm open the SDK gives the app the whole opened URL, so `click.queryParameters['productId']` (`AdtoLinkClickX`) works there, but only there, and the SDK reports none of those keys to the server.

To send a route that works on both paths, put it in `adto_deeplink`: `?adto_deeplink=products/42`. The prefix also keeps AdTo's keys apart from your website's own parameters. The reasons are in [Design decisions](/start/design-decisions/).

## Reserved parameters

| Parameter | Set by | Meaning |
|---|---|---|
| `adto_click` | AdTo | The click id, added to store URLs (inside `referrer` or `ct`), to scheme and `intent://` URLs and to the copied link. Do not add it to links you share; a reported click with an unknown id gets a fresh id. |
| `_ch` | AdTo | The marker of the one-shot client-hints redirect in front of the interstitial. |
| `_ipad` | AdTo | The answer of the touch check in front of a Mac Safari tap: `1` for an iPad asking for desktop sites, `0` for a Mac. |
| `_ref` | AdTo | The origin of the page that linked to a Mac Safari tap, carried past the touch check (whose own page would otherwise be the referrer). |

## Validation and what reaches the destination

Each invalid parameter is dropped on its own; the rest still apply, and routing continues as if the dropped one were absent. Parameters are never forwarded: the visitor is sent to the destination URL as configured, and the only additions AdTo makes are the store tags (`ct` on the App Store, `referrer` on Google Play and the OEM stores), `adto_click` on scheme and intent URLs, and the link's own UTM values on web destinations, plus `adto_click` on web destinations for a link with **Add the click id to website destinations** on (see [Web pixel](/sdk/web/)). Social-preview bots and the QR code ignore parameters entirely; see [Social previews and the QR page](/links/social-previews-and-qr/).
