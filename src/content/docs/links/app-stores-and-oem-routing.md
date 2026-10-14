---
title: App stores and OEM routing
description: Which store a visitor without the app is sent to, how the store URL is tagged with the click id, how Huawei, Samsung, Xiaomi and vivo devices are detected, and how the SDK reads the referrer back.
sidebar:
  order: 3
---

When a mobile visitor does not have the app, DecTog sends them to a store with the click id attached. On Android the store hands that id back to the app through the install referrer, which makes the install deterministic. This page covers the store URLs, the tagging and the device detection. The order in which the store competes with custom redirects and fallbacks is in [How a tap is routed](/links/how-a-tap-is-routed/).

## Store URLs per app

Each app on the **Apps** page can hold six store URLs. The server checks the host when you save:

| Field | Accepted hosts | Used for |
|---|---|---|
| **App Store URL** | Exactly `apps.apple.com` | Every iOS tap |
| **Play Store URL** | Exactly `play.google.com` | Android taps not sent to an OEM store |
| **Huawei AppGallery URL** | `appgallery.huawei.com`, `appgallery.cloud.huawei.com`, `url.cloud.huawei.com`, or a subdomain of one | Huawei and Honor devices |
| **Samsung Galaxy Store URL** | `galaxystore.samsung.com`, `apps.samsung.com`, `galaxy.store`, or a subdomain | Samsung devices |
| **Xiaomi GetApps URL** | `global.app.mi.com`, `app.mi.com`, or a subdomain | Xiaomi, Redmi and POCO devices |
| **vivo store URL** | Any http(s) URL | vivo devices |

The four OEM fields sit under **Other Android stores**. They are optional; leave them empty to send every Android visitor to Google Play. The **Store routing** chip on an app card turns green once an App Store or Play Store URL is set.

## Which store a visitor gets

- **iOS**: the App Store URL. Without one, there is no store destination.
- **Android**: the device's brand is detected from the user agent and, on modern Chrome whose user agent is frozen, from the `Sec-CH-UA-Model` client hint. If the brand has a configured store URL, that store is used; otherwise the Play Store URL. An OEM URL works even when no Play Store URL is set. With neither, there is no store destination.

Brand detection takes the first match in this order:

| Brand | User-agent tokens | Model-hint patterns | Store field |
|---|---|---|---|
| apple | `iPhone`, `iPad`, `iPod` | | App Store |
| huawei | `HUAWEI`, `HONOR`, `HarmonyOS`, `HuaweiBrowser`, `HMSCore` | starts with `HUAWEI` or `HONOR` | Huawei AppGallery URL |
| samsung | `SamsungBrowser`, `SM-` plus a letter and three digits, `GT-I`/`GT-N` plus four digits, `SAMSUNG` | starts with `SM-` plus a letter and three digits | Samsung Galaxy Store URL |
| xiaomi | `Xiaomi`, `MIUI`, `HyperOS`, `Redmi`, `POCO`, `MiuiBrowser` | starts with `Xiaomi`, `Redmi`, `POCO`, `Mi`, `M` plus four digits, or `2` plus six or more digits | Xiaomi GetApps URL |
| vivo | the word `vivo`, `VivoBrowser` | `V` plus four digits and an optional letter | vivo store URL |
| oppo | `OPPO`, `ColorOS`, `HeyTapBrowser`, `CPH` plus four digits | starts with `CPH` plus four digits | None: Play Store (detected for analytics only) |
| google | `Pixel` | starts with `Pixel` | None: Play Store |

Matching is case-insensitive. A device with no recognizable brand goes to Google Play.

## How the store URL is tagged

| Store | Parameter added | Value |
|---|---|---|
| App Store | `ct` | `dtg_click=<click id>` |
| Google Play and every OEM store | `referrer` | `dtg_click=<click id>&dtg_l={username}/{slug}`, URL-encoded as one value |

Tagging replaces any `ct` or `referrer` parameter already present on the configured URL. The `dtg_l` part names the link, so an install can be attributed from the referrer alone even when the web click was never recorded.

A custom mobile redirect (`dec_redirect_<platform>`, `dec_redirect`, or the link's **If the app isn't installed (mobile) > Custom URL**) is tagged the same way, but only when its host is a store: `apple.com` or a subdomain on iOS; `play.google.com` or one of the Huawei, Samsung or Xiaomi hosts above on Android. Any other URL is used verbatim. Because the vivo store has no host list, a custom vivo URL is never tagged; only the app's **vivo store URL** field is.

:::note[The App Store tag is not an attribution path]
Apple's `ct` parameter is an App Store Connect campaign token. It only works when paired with a `pt` provider token, and even then the data lands in App Store Connect, never in DecTog. iOS installs become deterministic through [iOS tap-to-store](/links/how-a-tap-is-routed/) and the SDK's pasteboard read, or through Apple Search Ads; otherwise the fingerprint decides. See [How attribution works](/start/how-attribution-works/).
:::

## How the SDK reads the referrer back

On the first launch the Flutter SDK reads the install referrer natively and sends it with the install registration. Google Play URL-decodes the `referrer` value and returns the exact string `dtg_click=<id>&dtg_l=acme/welcome`.

| Store | Reader | What the host app adds |
|---|---|---|
| Google Play | Google's Install Referrer library 2.2, bundled. Up to three connection attempts 3 seconds apart on `SERVICE_UNAVAILABLE`, `SERVICE_DISCONNECTED` and `DEVELOPER_ERROR`; `FEATURE_NOT_SUPPORTED`, a missing Play Store and Play's own organic marker are final answers. | Nothing |
| Huawei AppGallery | Built in, no library | Nothing |
| vivo | Built in, no library | Nothing |
| Samsung Galaxy Store | Reached by reflection | `store.galaxy.samsung.installreferrer:samsung_galaxystore_install_referrer:4.0.0` in the app's Gradle dependencies |
| Xiaomi GetApps | Reached by reflection | `com.miui.referrer:homereferrer:1.0.0.7` in the app's Gradle dependencies |

The OEM readers are on by default (`DectogCollection.oemReferrers`). When more than one store returns a referrer, the one whose install began last wins. The first-launch registration waits at most `installReferrerTimeout` (default 5 seconds); a referrer that arrives later is sent as a claim and upgrades the verdict. The verdict's `referrer_source` names the store: `google_play`, `huawei`, `samsung`, `xiaomi` or `vivo` (`meta` is the Meta on-device referrer, read on Android when `DectogConfig(fbAppId:)` is set). The Overview's **Install referrer reads** chips show how often each outcome occurred. SDK details are in [Deterministic attribution](/sdk/deterministic-attribution/).

:::caution[Confirm each OEM store with a real install]
Only Google Play documents its `referrer` parameter. The OEM stores are tagged the same way, and the SDK reads each store's referrer API, but whether a given store passes the value through end to end has to be confirmed with a real install from that store before you rely on it.
:::

## What is not tagged

- The store buttons on the desktop QR page link to the plain App Store and Play Store URLs. A scan of the QR code is a new tap on the link and gets its own tag; a click on those buttons does not.
- The "Open in app" buttons on the QR page carry no `dtg_click`; the interstitial, tap-to-store and intent-bounce URLs do.
- A verified Universal Link or App Link never reaches the server, so nothing is tagged; the SDK reports the open directly.
