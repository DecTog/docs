---
title: What DecTog does not do
description: The limits of DecTog's attribution and analytics, stated plainly, so you can decide whether it fits before you integrate.
sidebar:
  order: 4
---

DecTog does deep linking and install attribution for your own links, on your own infrastructure. It is not a mobile measurement partner. This page lists what it does not do, so nobody finds out after integrating.

## Ad networks and Apple's frameworks

- **No SKAdNetwork or AdAttributionKit.** No conversion values, no postbacks, no ad-network attribution on iOS.
- **No ad-network clicks and no postbacks.** Ad networks cannot send DecTog their clicks or impressions server to server, and DecTog sends no postbacks to Meta Ads, Google Ads, TikTok Ads or any other network. An install from an ad is attributed only when the ad's tap went through a DecTog link. Why, and when this would change: [Design decisions](/start/design-decisions/) (27).
- **Two ad-platform signals only.** The Apple Search Ads token (AdServices, resolved with Apple) and Meta's on-device install referrer from the Facebook and Instagram apps, which the SDK reads on Android when the app has a Facebook App ID (`DectogConfig.fbAppId`, else the one saved on the Apps page). The referrer credits the DecTog link it names, not an ad.
- **Advertising identifiers only on request, and never matched on.** The core SDK never reads the GAID or the IDFA and never shows the App Tracking Transparency prompt; an app that wants them adds the separate `flutter_dectog_adid` package and asks for tracking itself. The server stores the id per install and joins it to nothing: attribution never uses it. There is no identity graph and no cross-app or cross-account identity: device ids are vendor-scoped and stay inside one account.

## Probabilistic matching

DecTog tries deterministic signals first: the store install referrer on Android, the pasteboard and the paste button on iOS, Meta's referrer, and Apple Search Ads. Only when none of them names a click does it fall back to a **probabilistic match**: a scored comparison of the install with recent mobile web clicks from the same hashed IP address and device family. See [How attribution works](/start/how-attribution-works/).

- **It can be wrong.** Two phones of the same model on one Wi-Fi network look alike. DecTog credits a probabilistic match only at high confidence and credits nobody when taps on different links tie, but a confident match is still a guess, not proof.
- **It is time-bound.** Candidates are clicks from the last 24 hours when both the click and the install carry a device model and the install is not on a cellular network, and from the last 2 hours otherwise. Both windows are deployment settings, and the short one can be set per app.
- **Apple's rules.** Apple's user-privacy rules for developers prohibit fingerprinting, meaning deriving data from a device, its configuration included, to identify it, whatever the user consented to. DecTog's match compares a salted IP hash, the device model, OS version, language, screen size and network inside one account. By default it also records the device's text size, dark mode, Increase Contrast and Reduce Motion settings and its UTC offset, on the tap and on the install, and compares them for no points, together with the language's region and, on Android, the WebView build in the user agent. Those are device configuration, read to tell phones apart, which is what Apple's rule names. Nothing is combined into an identifier and nothing is matched across accounts, but whether this is acceptable for your app is your call, and the App Store review risk is yours. On iOS the pasteboard read, the paste button and Apple Search Ads are the deterministic paths; prefer them.
- **Accessibility settings can be health data.** Increase Contrast, Reduce Motion and a large text size can suggest a disability, which EU data-protection law may treat as health data. An app that cannot carry that leaves the SDK's device tier out (the app then sends none of the four settings, but still sends its UTC offset, like its time zone) or turns **Probabilistic match** off (the fingerprint never runs, nothing is compared, and the app's interstitial and tap-to-store pages stop reading the settings). Leaving out the device tier alone does not change the link pages: they still record the settings on the tap. See [Device data and privacy](/sdk/device-data-and-privacy/#device-settings).
- **The probabilistic match can be turned off per app.** On the Apps page, Advanced, **Probabilistic match** off means the app's installs are matched by deterministic signals only (store referrer, copied link, Meta referrer) and the comparison never runs, not even as a shadow. The [fraud rules](/start/fraud-rules/) an app blocks are a different setting: they refuse credit to installs that trip them.

## Attribution model

- **No multi-touch.** Each install is credited to at most one click, and each event to one link: the link that last re-opened the app, inside its app's re-engagement window (7 days by default), else the install's link. A user who reinstalls is matched again like any install, carries `is_reinstall: true` and is left out of the Installs count.
- **No uninstall tracking.**
- **Only `dec_*` parameters survive an install.** Other query parameters on a shared link are not stored, so they do not come back after a deferred install; carry an in-app route in `dec_deeplink`. See [URL parameters](/links/url-parameters/#your-own-parameters).

## Analytics and data

- **Detail is kept for the retention window only.** Per-link totals survive it in the daily rollups, but raw taps, installs, opens and events older than `RETENTION_DAYS` (400 by default) are deleted once the rollups hold their day, so breakdowns by country, referrer, campaign or device model cover that window. See [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).
- **Revenue is the app's word unless a store confirms it.** A purchase the app reports is stored as sent, unless it carries a StoreKit 2 transaction (`appStoreJws`) or arrives through the App Store's or Google Play's notifications. Google Play renewals are not recorded from Play's notifications, which carry no price. Amounts are converted to the account's base currency with the ECB's daily rates.
- **Breakdowns take at most two dimensions at a time,** and the raw export leaves out IP addresses and user agents. See [Export](/api/export/).

## Platform and hosting

- **No native iOS (Swift) or Android (Kotlin) SDK.** The SDKs are for [Flutter](/sdk/installation/) and [React Native and Expo](/react-native/), plus `dectog.js` for your own web pages ([Web pixel](/sdk/web/)); an app written in Swift or Kotlin calls the [REST API](/api/overview/) itself. Neither SDK is on a package registry yet: they are published with the first release.
- **Custom link domains need the deployment's support,** one per account: Cloudflare for SaaS on its zone and three settings. Until then the Settings card says it is not set up. See [Custom domains](/links/custom-domains/).
- **Three roles, no single sign-on.** A team has owners, members and viewers; everyone signs in with their own email and password or Google. There is no SAML, SCIM or per-app permission.
- **Pre-release.** The API and the SDK may still change without a deprecation period until the first public release.

The design choices behind several of these limits, and the alternatives that were rejected, are in [Design decisions](/start/design-decisions/).
