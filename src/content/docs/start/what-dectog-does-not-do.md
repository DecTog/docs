---
title: What DecTog does not do
description: The limits of DecTog's attribution and analytics, stated plainly, so you can decide whether it fits before you integrate.
sidebar:
  order: 4
---

DecTog does deep linking and install attribution for your own links, on your own infrastructure. It is not a mobile measurement partner. This page lists what it does not do, so nobody finds out after integrating.

## Ad networks and Apple's frameworks

- **No SKAdNetwork or AdAttributionKit.** No conversion values, no postbacks, no ad-network attribution on iOS.
- **No ad-network integrations.** DecTog does not talk to Meta Ads, Google Ads, TikTok Ads or any other network, and sends no postbacks to them. It attributes installs to DecTog links, not to ads.
- **Two ad-platform signals only.** The Apple Search Ads token (AdServices, resolved with Apple) and Meta's on-device install referrer from the Facebook and Instagram apps, which the SDK reads only when your app sets `fbAppId` in `DectogConfig`. The referrer credits the DecTog link it names, not an ad.
- **No advertising identifiers.** The SDK never reads GAID or IDFA and never shows the App Tracking Transparency prompt. There is no identity graph and no cross-app or cross-account identity: device ids are vendor-scoped and stay inside one account.

## Probabilistic matching

DecTog tries deterministic signals first: the store install referrer on Android, the pasteboard and the paste button on iOS, Meta's referrer, and Apple Search Ads. Only when none of them names a click does it fall back to a **probabilistic match**: a scored comparison of the install with recent mobile web clicks from the same hashed IP address and device family. See [How attribution works](/start/how-attribution-works/).

- **It can be wrong.** Two phones of the same model on one Wi-Fi network look alike. DecTog credits a probabilistic match only at high confidence and credits nobody on a tie, but a confident match is still a guess, not proof.
- **It is time-bound.** Candidates are clicks from the last 24 hours when the click carried a device model, and the last 2 hours otherwise.
- **Apple's rules.** Apple's user-privacy rules for developers prohibit fingerprinting, meaning deriving data from a device to identify it, whatever the user consented to. DecTog's match uses a salted IP hash and coarse device attributes inside one account, never a cross-app identifier, but whether a probabilistic match is acceptable for your app is your call, and the App Store review risk is yours. On iOS the pasteboard read, the paste button and Apple Search Ads are the deterministic paths; prefer them.
- **There is no switch to turn the probabilistic match off yet.** Strict fraud mode refuses credit to installs that trip a fraud rule, not to probabilistic matches. A per-app switch is on the roadmap.

## Attribution model

- **No re-attribution windows and no multi-touch.** An install is credited at most once, to the one click that matched. A user who reinstalls is matched again like any install and carries `is_reinstall: true`.
- **No re-engagement attribution.** Opens of an installed app through a link are counted, and the latest one is returned on the attribution pull, but events are not credited to the link that re-engaged the user.
- **No uninstall tracking.**

## Analytics and data

- **No cohort, LTV or retention reports yet.** The SDK sends a ping per app start for them, but no dashboard or API reads it today. The Overview covers 7, 30 and 90-day windows; per-link numbers are lifetime. See [Overview](/dashboard/overview/).
- **Revenue is summed as sent.** Conversion revenue is added up without converting currencies, and a refund cannot be recorded. Send one currency until this changes.
- **No raw-data export API.** `GET /api/v1/links` returns click counts; everything else is on the dashboard, whose admin API uses a cookie session.
- **No raw IP addresses unless you ask.** Matching uses a salted hash. A self-hosted deployment can store raw IPs with `STORE_RAW_IP=1`; the hosted service does not. See [Privacy and data](/self-hosting/privacy-and-data/).

## Platform and hosting

- **Flutter only.** There are no iOS, Android, React Native or web SDKs yet. See [Porting the SDK](/contributing/porting-the-sdk/).
- **No web SDK or pixel.** Web clicks exist only through the link redirect.
- **No custom link domain on the hosted service.** Self-host to serve links on your own domain.
- **One user per account.** There are no teams or roles beyond the owner of the deployment.
- **Pre-release.** The API and the SDK may still change without a deprecation period until the first public release.

The design choices behind several of these limits, and the alternatives that were rejected, are in [Design decisions](/start/design-decisions/).
