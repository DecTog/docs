---
title: Device data and privacy
description: What the SDK sends in each data tier, how collectDeviceData and persistDeviceId gate it, what the bundled iOS privacy manifest declares, what to declare in the stores, and how opt-out and local storage work.
sidebar:
  order: 6
---

The SDK sends data in tiers. The device tier is on by default and can be turned off with `collectDeviceData: false`. The core package never reads an advertising identifier.

## What is sent

### Always, with the install registration

| Field group | Fields | Source |
|---|---|---|
| App | `app_platform` (`flutter`), `app_version`, `app_build_number`, `package_name`, `installer_package`, `install_time`, `update_time`, `first_install_ts`, `install_state` | `package_info_plus`, the package manager (Android), the container and Keychain dates (iOS) |
| OS | `os`, `os_version`, `language`, `timezone` | `dart:io` and `device_info_plus` |
| Referrer | `install_referrer`, `referrer_store`, `referrer_status`, `referrer_attempts`, `referrer_wait_ms`, the device and server timestamps, `install_version`, `google_play_instant` | The native referrer readers (Android) |
| Reliability | `install_attempt_id`, `attempt`, `created_at_client`, `sent_at_client` | The SDK's sentinel |
| Metadata | plugin version, Dart version, platform, `build_signature` (the Android signing-key hex, when available), every store's raw referrer read status | The SDK |

Optional signals ride along when enabled: `meta_referrer` (with `fbAppId`), `clipboard_url` (the pasteboard read), `asa_token` (with `collectAppleSearchAdsToken`). See [Deterministic attribution](/sdk/deterministic-attribution/).

### The device tier (`collectDeviceData`, default `true`)

| Tier | Fields | Source | Server use |
|---|---|---|---|
| Device ID | `device_id`: `ANDROID_ID` on Android, the IDFV on iOS (Keychain-persisted by default, see below) | the plugin's platform channel | install dedupe, reinstall detection, the device ping, event batches, attribution re-pulls |
| Hardware | `device_model`, `device_manufacturer`, `device_kind` (`phone` or `tablet`), `cpu_type`, `os_build`, `is_physical_device` | `device_info_plus` | device breakdowns, fingerprint inputs, the emulator fraud rule |
| Screen | `screen_width`, `screen_height` (physical pixels of the Flutter view), `screen_density` (device pixel ratio) | `PlatformDispatcher`, no WebView | the fingerprint's screen-profile comparison |
| Network | `connectivity_type` (`wifi`, `cellular`, `ethernet`, `vpn`, `bluetooth`, `none`), `carrier_mcc` and `carrier_mnc` (Android only; iOS hides carrier identity) | `connectivity_plus`, `TelephonyManager` | connectivity and carrier breakdowns, the fingerprint windows |
| Web UA | `web_user_agent` (Android only) | `WebSettings.getDefaultUserAgent` | fingerprint input |

With `collectDeviceData: false`:

- none of the fields above is sent, with the install or with in-app clicks;
- the device ping (`POST /api/v1/device-ping`, one row per app start for retention curves) is not sent;
- event batches and app-open reports carry the `install_id` only, and `getAttributionData()` re-pulls by `install_id` instead of `device_id`;
- reinstalls cannot be detected by device id, and the fingerprint has fewer signals to corroborate a candidate, so more installs come back as `routing` only or organic.

:::caution[Decide before initialize]
`DectogConfig` is read once. The SDK cannot be initialized twice in one process, so the value of `collectDeviceData` holds for the life of the process. For an opt-in consent flow, initialize after consent, or initialize with `collectDeviceData: false` and accept the reduced tier until the next launch. Deterministic signals (store referrers, the pasteboard) are not time-limited, but a fingerprint match only works inside the server's attribution windows (24 hours, or 2 hours for low-entropy clicks and cellular installs), so a long delay before `initialize` costs fingerprint matches.
:::

### Post-install events

`identify`, `trackConversion` and `trackEvent` send what you pass: `customer_id`, `name`, `email`, `phone`, revenue, currency, event names and metadata. The server stores the customer's name, email and phone **in plain text** on the customer record until the retention cutoff. See [Events](/sdk/events/).

### In-app clicks and opens

Every recognized link open sends the slug, the opened URL (in metadata), its `utm_*` and `dec_*` values, platform, OS version, language, the device id and model (device tier only) and, on Android, the launching package. See [Initialize and handle links](/sdk/initialize-and-handle-links/).

## The device identifier

The device id is vendor-scoped: `Settings.Secure.ANDROID_ID` on Android, `identifierForVendor` (IDFV) on iOS. Neither is an advertising identifier.

`persistDeviceId` (default `true`) keeps the first IDFV the SDK reads in the iOS Keychain (service `app.dectog.flutter_dectog`, account `device_id`, accessibility `AfterFirstUnlockThisDeviceOnly`, so it never migrates to another device through a backup). Later reads return the stored value, which is how a reinstall keeps its device id and is reported as a reinstall. When the Keychain is locked (before the first unlock after a reboot) the plain IDFV is returned and nothing is written. With `persistDeviceId: false` the plain IDFV is sent and changes on reinstall; a reinstall then looks like a new device unless a deterministic signal attributes it. The setting has no effect on Android, where `ANDROID_ID` already survives reinstall for the same signing key, and no effect at all when `collectDeviceData` is off.

The iOS plugin also keeps two install dates in the Keychain (`first_install_time`, `latest_install_time`) to classify reinstalls and updates. They are timestamps, not identifiers.

## No advertising identifiers

The core SDK does not read or send the Google Advertising ID or the IDFA. It depends on no Play services artifact and declares no `AD_ID` permission on Android; on iOS it links neither `AdSupport` nor `AppTrackingTransparency`, and the privacy manifest sets `NSPrivacyTracking` to `false`.

The server's install body does accept `ad_id` and `ad_tracking_limited` and stores them in a separate table that is never joined to the device id. The plugin's native sides reserve this path for a companion package (`flutter_dectog_adid`). That package is not part of this release, the core SDK exposes no API for it, and nothing in the core SDK sends `ad_id`.

The Apple Search Ads token (`collectAppleSearchAdsToken`, off by default) is not an identifier and shows no prompt.

## The iOS privacy manifest

`PrivacyInfo.xcprivacy` ships with the plugin (as a package resource with Swift Package Manager, as the `flutter_dectog_privacy` resource bundle with CocoaPods). It declares:

| Key | Value |
|---|---|
| `NSPrivacyTracking` | `false` |
| `NSPrivacyTrackingDomains` | empty |
| Collected data types | Device ID (linked to the user), Other usage data (not linked), User ID, Purchase history, Email address, Phone number (linked). Every type is for the Analytics purpose and not used for tracking. |
| Accessed API types | `NSPrivacyAccessedAPICategoryFileTimestamp`, reason `C617.1`: the install and update dates are read from the creation timestamps of the app's own executable, Library and Documents directories. No user defaults, disk space or boot time APIs. |

The User ID, purchase, email and phone entries cover the event tier. If your app never calls `identify` with contact fields, those types are declared but never sent.

## Store declarations

Declare the collection in your privacy policy and in both store forms (Google Play Data safety, App Store privacy labels) with the purpose "analytics / install attribution":

- Device or other IDs: the vendor-scoped device id, persisted across reinstall on iOS when `persistDeviceId` is on.
- App info and performance / usage data: install and open events, app version, OS, device model, screen, connectivity, carrier (Android).
- User IDs, purchase history, contact info: only if you pass them through `identify` and `trackConversion`.
- Location: none. The SDK sends no location; the server derives country and ASN from the request's network address.

If your consent regime is opt-in, pass `collectDeviceData: false` until the user consents.

## Opt-out

```dart
await dectog.optOut(true);           // persisted across launches
final off = await dectog.isOptedOut();
await dectog.optOut(false);          // resume
```

`optOut(true)` is persisted in the SDK state file. While it is on, new events are discarded, the on-disk queue is cleared, the event sender stops, the device ping is not sent and app opens are not reported. It does not cancel an install registration or the in-app click report for an opened link. `optOut(false)` restarts the event sender.

## Local storage

Everything the SDK persists lives in one private, backup-excluded directory:

| Platform | Directory |
|---|---|
| Android | `Context.getNoBackupFilesDir()/dectog/` |
| iOS | Application Support `/dectog/`, flagged `NSURLIsExcludedFromBackupKey` |
| Fallback | Application Support, or the documents directory when `path_provider` fails |

| File | Contents |
|---|---|
| `.dectog_install.json` | The install sentinel: attempt id, status, attempts, timestamps, server install id, referrer and Apple Search Ads delivery flags |
| `.dectog_sdk_state.json` | Customer id, the last identify fingerprint, the opt-out flag, the install id |
| `.dectog_event_queue.jsonl` | Queued events, one JSON object per line |

Uninstalling the app removes all three. A restored backup never contains them, so a restored app registers as a fresh install.

## Transport

Every authenticated call carries the API key as a Bearer token plus an HMAC-SHA256 signature over the timestamp and the body (`x-dectog-timestamp`, `x-dectog-signature: v1=<hex>`), a `User-Agent` of `DectogSDK/<version> (<platform>)`, and a 30-second timeout. The server rejects unsigned requests and timestamps more than 30 minutes off. Requests are plain HTTPS to `effectiveBaseUrl`; the public resolve call is the only unsigned one.

## Retention on the server

The server anonymizes device fields, hashed and raw IPs, user agents and customer contact details after the retention window (400 days by default on the hosted service). What is kept and when it is removed is listed under [Privacy and data](/self-hosting/privacy-and-data/).
