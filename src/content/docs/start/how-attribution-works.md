---
title: How attribution works
description: The signals that connect an install to a link tap, in order, what each confidence level means, the matching windows, reinstalls, fraud flags and Apple Search Ads.
sidebar:
  order: 3
---

Install attribution answers one question: which link tap, if any, led to this first launch? DecTog answers it with a ladder of signals. Deterministic signals, which carry the click id itself, come first. A scored fingerprint comes last, and it only credits an install when it is sure. This page describes the behavior in user terms; the scoring details are in [Attribution internals](/self-hosting/attribution-internals/).

## What happens at the tap

A tap on `https://acme.dectog.com/welcome` records a click with a 16-character id and sends the visitor on. Where the click id goes next depends on the platform:

| Platform | Carrier of the click id |
|---|---|
| Android, to Google Play or an OEM store | The store URL's `referrer` parameter: `dtg_click=<id>&dtg_l=acme/welcome`. The store hands the string back to the app after the install. |
| iOS, with **iOS tap-to-store** on | The "Get the app" tap copies `https://acme.dectog.com/welcome?dtg_click=<id>` to the pasteboard, then opens the App Store. |
| iOS, without tap-to-store | Nothing. Apple's `ct` tag is set on the store URL for App Store Connect, but it never reaches DecTog. |
| Any mobile tap, through the interstitial or tap-to-store page | The page also beacons the screen profile onto the click, which sharpens the fingerprint. |

If the app is already installed and the OS opens it directly, there is no install to attribute; the SDK reports an app open instead.

## What the SDK gathers on first launch

On the first launch the SDK registers the install once (an idempotent `install_attempt_id` makes retries safe) with every deterministic signal it can read:

- the Google Play install referrer, or the Huawei, Samsung, Xiaomi or vivo one, waiting at most 5 seconds (`installReferrerTimeout`);
- the pasteboard, on iOS by default (`readClipboardOnInstall`), only when it holds a URL and only if that URL is a DecTog link for this deployment;
- Meta's on-device install referrer on Android, when `DectogConfig.fbAppId` is set;
- the device tier (model, OS, language, screen, connectivity, carrier) when `collectDeviceData` is on, which the fingerprint needs;
- the Apple Search Ads token when `collectAppleSearchAdsToken` is on.

A signal that arrives later, in the same process or on a later launch, is sent as a claim. See [Late claims](#late-claims) below.

## The ladder

The server walks the signals in this order and stops at the first one that names a click nobody else has used:

| Step | Signal | `match_source` | `match_confidence` | Result |
|---|---|---|---|---|
| 1 | Install referrer from Google Play or an OEM store (`referrer_source` names the store) | `referrer` | `guaranteed` | Credited |
| 2 | Copied link or paste: the pasteboard URL carries `dtg_click` | `clipboard` | `guaranteed` | Credited |
| 3 | Meta on-device referrer | `referrer` (`referrer_source: meta`) | `guaranteed` | Credited |
| 4 | Fingerprint over recent mobile web clicks from the same hashed IP and device family | `fingerprint` | `high` | Credited |
| 4 | Same, with a unique but weak best candidate | `null` | `medium` | Routed, not credited |
| 4 | Same, with a tie or a contradiction | `null` | `low` | Nothing |
| | No signal and no candidate | `null` | `null` | Organic |

Two rules hold throughout:

- **One install per click.** A click credited to another device's install is skipped, and the ladder moves on to the next signal. Only when nothing later matches does the install end up organic with the fraud flag `click_reuse`. A click credited to an earlier install of the *same* device returns that install's verdict instead of creating a new one.
- **A referrer is proof of the tap.** If the click row never existed (a tap whose click was lost, see [when the click is recorded](/links/how-a-tap-is-routed/)), the server creates it from the `dtg_l=username/slug` part of the referrer and still credits the install deterministically.

When a deterministic signal decides, the fingerprint still runs in the background and records whether it would have picked the same click. That shadow match is the "Fingerprint accuracy" figure on the Overview.

## Confidence levels

The dashboard's **Match confidence & referrer health** panel explains each level with a tooltip. The meanings are exactly these:

| Level | Tooltip | `matched` | `routing` |
|---|---|---|---|
| Guaranteed | install referrer, copied link or paste | `true` | present |
| High | fingerprint, corroborated and unique — credited | `true` | present |
| Medium | routed to the link, not credited | `false` | present, with `confidence: medium` |
| Low | ambiguous or contradicted — nothing | `false` | absent |
| No candidate | no click from this network in the window | `false` | absent |

In fingerprint terms: *unique* means the best candidate leads the runner-up by at least 10 points or is the only one; *corroborated* means a device-model match, a screen-profile agreement together with an OS-major agreement, or any score of 15 or more; *medium* is a unique best candidate scoring 0 to 14, for example an OS-major agreement cancelled by a language mismatch; *low* is a tie or a negative score. A device-model mismatch excludes a candidate outright.

Use `matched` for credit and `routing` for navigation. Routing a new user to the content they tapped is cheap to get wrong; crediting a campaign is not.

## Matching windows

Only mobile web clicks of your account, from the same hashed IP (IPv6 at /64) and the same device family, that no install has claimed yet, are candidates. How far back the server looks depends on how much the click and the install carry:

| Case | Window |
|---|---|
| The click carries a device model, the install carries one too, and the install is not on cellular data | 24 hours (`ATTRIBUTION_WINDOW_HOURS`) |
| Everything else: a click without a model (iOS Safari sends none), or an install on cellular data | 2 hours (`ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS`), or the app's **Low-entropy attribution window** (1 to 720 hours), never longer than the 24-hour window |

The per-app window is read from the account's default (oldest) app. The deterministic ladder has no window: a referrer older than 30 days still matches, with the fraud flag `stale_referrer`.

## Reinstalls and app updates

| Case | How it is detected | What happens |
|---|---|---|
| App update | The SDK sees that the app was installed before this build (`install_state: update`) | Registered, never fingerprint-matched. The Overview's quality panel counts these as "kept out of matching". A deterministic signal still applies. |
| Reinstall | The server has seen the device id before, or the SDK classifies it from the iOS Keychain dates (`install_state: reinstall`) | Registered with `is_reinstall: true`. It still runs the ladder, but the Installs KPI and the per-link install counts exclude it. The quality panel includes it. |

The device id survives a reinstall by default (`ANDROID_ID` on Android, the first IDFV kept in the Keychain on iOS with `persistDeviceId`). Repeated test installs on one device therefore show as reinstalls.

## Late claims

The verdict can change once, from organic or fingerprint to deterministic:

- The SDK re-reads a non-definitive Play referrer on up to five later launches and sends it as a claim when it arrives.
- A link pasted through `DectogPasteButton` (iOS 16 and later, no system alert) is sent as a claim.
- A late Meta read is sent as a claim.

Claims never run the fingerprint and never downgrade: a deterministic verdict is final, including a strict-mode verdict that was zeroed. The response carries `claim: upgraded | unchanged | rejected` with a `claim_reason` (`click_reuse`, `click_not_found`, `no_signal`, `already_deterministic`), and the SDK re-emits an upgraded verdict on `onAppInstalled`.

## Fraud flags and strict mode

Every install is checked against explainable rules. The hits ride on the verdict as `fraud_flags`, on the webhook and in the dashboard:

| Flag | Fires when |
|---|---|
| `emulator` | The SDK reports a non-physical device, the model name looks like an emulator, or an Android phone reports an x86 CPU |
| `impossible_speed` | The deterministic click happened less than 10 seconds before the install report |
| `install_velocity_ip` | The same hashed IP already produced 5 installs in 24 hours (25 on cellular data) |
| `click_storm_ip` | The matched click's IP produced more than 100 clicks in the hour before it |
| `stale_referrer` | The referrer or clipboard click is older than 30 days |
| `click_reuse` | A deterministic signal named a click another device's install already consumed |

With **Strict fraud mode** off (the default) attribution stands and the flags are evidence. With it on, a flagged install is stored with `matched: false` and `match_source: null` and counts as organic; the record keeps `referrer_source`, `match_confidence` and the matched slug (the app's verdict and the install webhook show the first two but never the slug), and the click stays consumed so nobody else can claim it. Strict mode is read from the default app.

## Apple Search Ads

Apple Search Ads is a separate signal and never changes `matched`. When `collectAppleSearchAdsToken` is on, the SDK sends Apple's AdServices token with the install (or with a later claim). The server exchanges it with Apple: three attempts 5 seconds apart during the request, then one attempt per cron run, until the token's 24-hour lifetime ends. The verdict's `apple_search_ads` object reports the status:

| Status | Meaning |
|---|---|
| `pending` | Waiting for Apple |
| `resolved` | Apple matched the install to a campaign; the record (campaign, ad group, keyword and ad ids, tap-through or view-through) is included and the webhook fires again |
| `no_attribution` | Apple found no record |
| `invalid` | Apple rejected the token |
| `expired` | 24 hours passed without an answer |
| `failed` | No token was present when the lookup ran |

The field is always present on the verdict and is `null` until a token was ever sent. The Overview's Apple Search Ads card appears once the window contains a result.

## Where you see the verdict

- In the app: `onAppInstalled` on first launch and on upgrades; `getAttributionData()` later, re-pulled from the server when the cache is empty.
- On your server: the install webhook.
- In the dashboard: the Installs and Conversion cards, the **Attribution quality** card, the **Match confidence & referrer health** panel (confidence per platform, Android referrer coverage, fingerprint accuracy, click-to-install latency) and each customer's attribution block.
