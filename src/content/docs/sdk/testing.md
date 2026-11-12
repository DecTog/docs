---
title: Testing
description: Run the SDK against a local worker, fire deep links at the emulator and simulator, test install attribution end to end on a real device, and check the list before shipping.
sidebar:
  order: 9
---

## A test environment for debug builds

Create a test environment in the dashboard (Settings → [Test environment](/dashboard/settings/#test-environment)): a second account, `t-<username>`, with the same apps. Give debug builds its SDK key, and its link host in their associated domains (`applinks:t-acme.adto.app` and the Android intent filter), so nothing you test reaches your live numbers:

```dart
await adto.initialize(AdtoConfig(
  apiKey: kReleaseMode ? liveSdkKey : testSdkKey,
));
```

The key alone decides which account gets the data: there is nothing else to set. `AdtoConfig(environment:)` (`live` or `test`) is an optional check, not a switch, and changes nothing at runtime: when the app calls `diagnostics()`, it warns if the key belongs to the other environment. Without it, `diagnostics()` still warns when a release build carries a test key. In the dashboard, the **Live** / **Test** switch at the top of the sidebar shows either account.

## Testing link handling

Three delivery paths need to work, and each exercises different code:

| Scenario | How to test | What to expect |
|---|---|---|
| Cold start | Kill the app, open a link | `onLinkClick` emits once and `getInitialLink()` returns the same click. A second `getInitialLink()` returns the same object without a second click report. |
| Warm start | Background the app, open a link | `onLinkClick` emits; the open is reported with `POST /api/v1/app-opens`. |
| Running | Open a link while the app is in the foreground | Same as warm start. The same URL delivered twice within 10 seconds counts once. |

Also check an OAuth-style URL (any scheme ending in a `fb<digits>` form, or a URL carrying `access_token`): nothing is emitted and nothing is reported.

## End-to-end install attribution

Install attribution only works for a build that was installed the way your users install it. Simulators and emulators cannot install from a store, and a build installed with `flutter run` or `adb install` has no campaign referrer (the Play read ends `organic` or `not_available`).

1. In **Dashboard → Apps**, save the real App Store and Play Store URLs and the SHA-256 fingerprint of the certificate the installed build is signed with (the Play App Signing key for a store build). Turn on **iOS tap-to-store** under Advanced if you want the deterministic pasteboard path on iPhone.
2. Create a link in **Dashboard → Links**.
3. Uninstall the app from a physical device. On Android, `adb shell pm clear <package>` also resets the SDK's state without uninstalling.
4. Tap the link on that device. Android lands in Play with `referrer=dtg_click=…&dtg_l=…` on the store URL. iOS lands on the tap-to-store page; "Get the app" copies the link with its click id and opens the App Store.
5. Install from the store and open the app once. `onAppInstalled` fires with `matched: true`, `matchConfidence: 'guaranteed'`, `slug` naming the link, and `matchSource` `referrer` (Android, `referrerSource: 'google_play'`) or `clipboard` (iOS). On iOS 16 and newer the first launch shows the "Allow paste" alert; decline it to test the `AdtoPasteButton` recovery path.
6. Without a deterministic signal (pasteboard declined, referrer unavailable) the server falls back to the fingerprint: the install must come from the same network as the tap, within 24 hours (2 hours for cellular installs, or clicks with neither a device model nor a screen profile to compare with the install). Expect `matchConfidence` `high` with `matched: true`, or `medium` with `routing` only.
7. Check the **Overview**: the install appears in the Installs number and in the attribution-quality panel, whose referrer-status chips show how the Android read ended.

To retest, uninstall and repeat. Each test consumes its click: a click already credited to an install is never credited again, so tap a fresh link each time.

Things that look like failures and are not:

- The verdict is `matched: false` with `installState: 'update'`: the device already had the app before this build. Updates are never fingerprint-matched. Uninstall first.
- `isReinstall: true`: the server has seen this device id on an earlier install of your account. Reinstalls still attribute; the dashboard counts them under Reinstalls, next to Installs, which counts first installs.
- `appleSearchAds.status` stays `pending` in the first-launch process. Call `getAttributionData()` on a later launch.
- `fraudFlags` contains `install_velocity_ip` after many test installs from one network, `emulator` on a simulator or emulator, and `signing_cert_mismatch` on a debug build whose key the app's SHA-256 fingerprints do not list. When the app blocks one of those rules (Apps, **Fraud rules**), those installs count as organic: untick the rule while you test. See [Fraud rules](/start/fraud-rules/).

## Ship checklist

- [ ] App record complete: bundle ID and Team ID (iOS), package and the **release / Play App Signing** fingerprint (Android), real store URLs. Both **Verify** buttons on the Apps page report your app IDs and packages with fingerprints present.
- [ ] `applinks:{username}.adto.app` in every entitlements file your build configurations use; an `autoVerify` intent filter for `{username}.adto.app` in the manifest; `adb shell pm get-app-links <package>` reports `verified`.
- [ ] Custom scheme registered on both platforms if you saved one in the app record.
- [ ] SDK key (`dtg_pub_…`, not the account key) injected at build time, not committed.
- [ ] `collect`, `advertisingIdProvider` and `persistDeviceId` chosen deliberately, and the privacy policy, Play Data safety form and App Store privacy labels updated for what you send. See [Device data and privacy](/sdk/device-data-and-privacy/).
- [ ] If you ship through the Galaxy Store or GetApps, their referrer libraries added to the app module. See [Installation](/sdk/installation/).
- [ ] `identify` called after signup and login, `trackConversion` on purchases, so leads and revenue reach the dashboard.
- [ ] `onAppInstalled` handled as a stream that can emit more than once; routing taken from `routing` or `deepLink`, credit only from `matched`.
- [ ] At least one attributed install verified on a real device per platform.
- [ ] `enableDebugLogging` off in release builds.

More symptoms and their causes are collected on [Troubleshooting](/guides/troubleshooting/).
