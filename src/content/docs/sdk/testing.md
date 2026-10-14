---
title: Testing
description: Run the SDK against a local worker, fire deep links at the emulator and simulator, test install attribution end to end on a real device, and check the list before shipping.
sidebar:
  order: 9
---

## Local loop with a self-hosted worker

The quickest way to exercise every SDK path is the local worker plus the bundled example app. The worker's local quick start (demo seed, bootstrap, URLs) is on [Local quick start](/self-hosting/local-quick-start/).

1. Start the worker so that link URLs are reachable from the Android emulator:

   ```bash
   cd dectog/apps/worker
   npm run dev:android   # wrangler dev on :8787 with PUBLIC_BASE_URL=http://10.0.2.2:8787
   ```

   `10.0.2.2` is the emulator's alias for the host machine. The iOS simulator shares the host's network and uses `http://localhost:8787`. The local worker runs in path mode, so links look like `http://10.0.2.2:8787/r/demo/welcome`.

2. Configure the example app. It reads three `dart-define` values from a JSON file:

   ```json title="example/env/dev.json"
   {
     "DECTOG_API_KEY": "dtg_paste_your_key_here",
     "DECTOG_BASE_URL": "http://localhost:8787",
     "DECTOG_LINK_ROOT_DOMAIN": ""
   }
   ```

   `env/dev.json` is gitignored; copy `env/dev.json.example`. The example app substitutes `http://10.0.2.2:8787` on Android when `DECTOG_BASE_URL` is empty. Leave `DECTOG_LINK_ROOT_DOMAIN` empty against a path-mode worker.

   ```bash
   cd flutter_dectog/example
   flutter pub get
   flutter run --dart-define-from-file=env/dev.json
   ```

   In your own app the equivalent is `DectogConfig(apiKey: ..., baseUrl: 'http://10.0.2.2:8787')` on Android and `baseUrl: 'http://localhost:8787'` on iOS, with no `linkRootDomain`.

3. Fire links at the running app. The example app's manifest carries intent filters for `dectog://`, `http://10.0.2.2` and `https://localhost`; its `Info.plist` registers the `dectog` scheme.

   ```bash
   # Android emulator
   adb shell am start -a android.intent.action.VIEW -d "dectog://demo/welcome"
   adb shell am start -a android.intent.action.VIEW -d "http://10.0.2.2:8787/r/demo/welcome?utm_source=test"

   # iOS simulator
   xcrun simctl openurl booted "dectog://demo/welcome"
   ```

   The custom scheme shows iOS's "Open in app?" prompt. Universal Links need a real HTTPS domain that serves the association file, so they cannot be tested against a local worker. On Android the `http://10.0.2.2` and `https://localhost` filters never pass App Links verification, so on Android 12 and newer they only open the app from explicit intents like the ones above.

With `enableDebugLogging: true` the SDK prints what it does: `Processing DecTog link: username=demo, slug=welcome`, `Mobile click logged successfully`, `First app launch detected - tracking app install`, `Install referrer: …`, and either `App install matched to deferred click: …` or `App install tracked as organic`.

## A test environment for debug builds

Create a test environment in the dashboard (Settings → [Test environment](/dashboard/settings/#test-environment)): a second account, `t-<username>`, with the same apps. Give debug builds its SDK key, and its link host in their associated domains (`applinks:t-acme.dectog.com` and the Android intent filter), so nothing you test reaches your live numbers:

```dart
await dectog.initialize(DectogConfig(
  apiKey: kReleaseMode ? liveSdkKey : testSdkKey,
  environment: kReleaseMode ? DectogEnvironment.live : DectogEnvironment.test,
));
```

`environment` is a check, not a switch: the key decides the account. `diagnostics()` warns when the key belongs to the other environment, and, without `environment`, when a release build carries a test key. In the dashboard, the **Live** / **Test** switch at the top of the sidebar shows either account.

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
5. Install from the store and open the app once. `onAppInstalled` fires with `matched: true`, `matchConfidence: 'guaranteed'`, `slug` naming the link, and `matchSource` `referrer` (Android, `referrerSource: 'google_play'`) or `clipboard` (iOS). On iOS 16 and newer the first launch shows the "Allow paste" alert; decline it to test the `DectogPasteButton` recovery path.
6. Without a deterministic signal (pasteboard declined, referrer unavailable) the server falls back to the fingerprint: the install must come from the same network as the tap, within 24 hours (2 hours for cellular installs or clicks without a device model). Expect `matchConfidence` `high` with `matched: true`, or `medium` with `routing` only.
7. Check the **Overview**: the install appears in the Installs number and in the attribution-quality panel, whose referrer-status chips show how the Android read ended.

To retest, uninstall and repeat. Each test consumes its click: a click already credited to an install is never credited again, so tap a fresh link each time.

Things that look like failures and are not:

- The verdict is `matched: false` with `installState: 'update'`: the device already had the app before this build. Updates are never fingerprint-matched. Uninstall first.
- `isReinstall: true`: the server has seen this device id on an earlier install of your account. Reinstalls still attribute, but the dashboard's Installs number excludes them.
- `appleSearchAds.status` stays `pending` in the first-launch process. Call `getAttributionData()` on a later launch.
- `fraudFlags` contains `install_velocity_ip` after many test installs from one network. With strict fraud mode on, those installs count as organic.

## Ship checklist

- [ ] App record complete: bundle ID and Team ID (iOS), package and the **release / Play App Signing** fingerprint (Android), real store URLs. Both **Verify** buttons on the Apps page report your app IDs and packages with fingerprints present.
- [ ] `applinks:{username}.dectog.com` in every entitlements file your build configurations use; an `autoVerify` intent filter for `{username}.dectog.com` in the manifest; `adb shell pm get-app-links <package>` reports `verified`.
- [ ] Custom scheme registered on both platforms if you saved one in the app record.
- [ ] SDK key (`dtg_pub_…`, not the account key) injected at build time, not committed. `baseUrl` and `linkRootDomain` set only when self-hosting.
- [ ] `collect`, `advertisingIdProvider` and `persistDeviceId` chosen deliberately, and the privacy policy, Play Data safety form and App Store privacy labels updated for what you send. See [Device data and privacy](/sdk/device-data-and-privacy/).
- [ ] If you ship through the Galaxy Store or GetApps, their referrer libraries added to the app module. See [Installation](/sdk/installation/).
- [ ] `identify` called after signup and login, `trackConversion` on purchases, so leads and revenue reach the dashboard.
- [ ] `onAppInstalled` handled as a stream that can emit more than once; routing taken from `routing` or `deepLink`, credit only from `matched`.
- [ ] At least one attributed install verified on a real device per platform.
- [ ] `enableDebugLogging` off in release builds.

More symptoms and their causes are collected on [Troubleshooting](/guides/troubleshooting/).
