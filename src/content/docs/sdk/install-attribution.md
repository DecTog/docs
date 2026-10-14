---
title: Install attribution
description: How the SDK registers the first launch, what the verdict on onAppInstalled means (matched versus routing, confidence), why it can emit more than once, and how install state, late claims and the idempotent attempt id keep installs accurate.
sidebar:
  order: 4
---

On the first launch after installation the SDK registers the install with `POST /api/v1/app-installs`, and the server answers with a verdict: did a DecTog link bring this install, and if so, which one. The verdict is a `DectogAppInstallResponse`, delivered on `onAppInstalled` and kept in `currentAppInstall`.

The server-side rules (the deterministic ladder, the fingerprint, fraud rules) are described on [How attribution works](/start/how-attribution-works/) and [Clicks and installs](/api/clicks-and-installs/). This page covers the SDK's side.

## What happens on the first launch

1. **Sentinel check.** The SDK reads `.dectog_install.json` from its backup-excluded directory. No file (or a file whose stored package first-install time differs from the current one) means a fresh install: a new `install_attempt_id` (a UUID) is generated and persisted as `pending` before anything is sent.
2. **Signal collection, concurrently.** The Android install referrer (up to `installReferrerTimeout`, 5 seconds by default), the device and hardware tier, network and carrier, the WebView user agent (Android), Meta's referrer (Android, with `fbAppId`), the pasteboard (iOS by default), and the Apple Search Ads token (iOS, opt in). Every read except the referrer and the pasteboard is capped at 1.5 seconds; the Apple Search Ads token at 0.5 seconds; the pasteboard at 6 seconds. A slow read is simply left out.
3. **Registration.** One `POST /api/v1/app-installs` with up to two in-process attempts of 15 seconds each. Network errors, timeouts, 408, 429 and 5xx are retried after a jittered backoff; a `Retry-After` header up to 10 seconds is honored, a longer one defers to the next launch. Other 4xx responses are not retried in-process.
4. **Verdict.** The response is emitted on `onAppInstalled`, the sentinel becomes `tracked` with the server's `installId`, and the install id is persisted for later event batches and app-open reports.
5. **Signals that were still in flight** when the request left (a referrer the store delivered late, a pasteboard alert the user answered late, a paste-button URL) are sent as late claims; see below.

If the request fails, the sentinel is marked `failed` and the next launch retries with the **same** `install_attempt_id`. After 10 launches without a 2xx the install is abandoned client-side. A `pending` sentinel younger than 5 minutes is treated as in flight (another isolate or a process that died mid-request) and skipped for that launch.

Later launches never register again. They may send late claims, and they do not emit on `onAppInstalled` unless a claim upgrades the verdict.

## Reading the verdict

```dart
dectog.onAppInstalled.listen((install) {
  final route = install.routing?.deepLink ?? install.deepLink;
  if (route != null) _openRoute(route);           // medium confidence or better
  if (install.matched) _creditInstall(install);   // high or guaranteed only
});
```

### Credit versus routing

`matched` is attribution **credit**. The server grants it only at `matchConfidence` `guaranteed` (a store referrer, Meta's referrer, a copied link) or `high` (a fingerprint corroborated by more than the IP and device family). A credited install carries `username`, `slug`, `clickedAt`, `clickParams`, `deepLink`, `customParameters` (the link's metadata) and, for permanent links, `link`. A match on a temporary link has `username` and `slug` but no `link`, and `customParameters` is `null`.

`routing` is the deferred-routing candidate. At `high` and `guaranteed` it mirrors the credited click. At `medium` (a unique fingerprint candidate with nothing to corroborate it) it is present while `matched` is `false`: route the new user to the content they tapped, but credit nobody. At `low` (a tie between candidates, or a contradiction) and for organic installs it is `null`.

| `matchConfidence` | `matched` | `routing` | Source |
|---|---|---|---|
| `guaranteed` | `true` | mirrors the match | `matchSource` `referrer` (with `referrerSource`: `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo` or `meta`) or `clipboard` |
| `high` | `true` | mirrors the match | `matchSource` `fingerprint` |
| `medium` | `false` | the candidate, `confidence: 'medium'` | fingerprint |
| `low` | `false` | `null` | fingerprint tie or contradiction |
| `null` | `false` | `null` | organic: no candidate at all |

`type` is `'non-organic'` when `matched` is `true`, else `'organic'`.

### Fraud flags and strict mode

`fraudFlags` lists the rules the install tripped: `emulator`, `impossible_speed`, `install_velocity_ip`, `click_storm_ip`, `stale_referrer`, `stale_clipboard`, `stale_meta`, `click_reuse`. `stale_clipboard` and `stale_meta` mark a pasted link or Meta referrer older than the app's window: the verdict routes (`routing`) but is not credited. By default the attribution stands and the flags are informational. With the app's strict fraud mode on, a flagged install comes back with `matched: false` and `matchSource: null`, while `referrerSource` and `matchConfidence` keep their values as evidence; `slug`, `link` and the other attribution fields are absent from the verdict (the server keeps the matched slug on its record and the install webhook still carries it). Strict mode is read from the app the install concerns (see [Apps](/dashboard/apps/)).

### Other fields

- `installId`: the server's id for this install. Later claims, event batches and app-open reports reference it.
- `replayed`: `true` when the server already knew this `install_attempt_id` (or a click already credited to this same device) and returned the stored verdict instead of creating a second install.
- `isReinstall`, `installState`: see below.
- `appleSearchAds`: see [Deterministic attribution](/sdk/deterministic-attribution/).
- `claim`, `claimReason`: only on verdicts that came from a late claim.

## The verdict can be emitted more than once

`onAppInstalled` emits the first-launch verdict and, later, every verdict that a late claim **upgraded** (`claim == 'upgraded'`). Handle the stream as the source of truth and keep `currentAppInstall` as the latest value. Claims that change nothing are not emitted.

A late claim is `POST /api/v1/app-installs/{installId}/claim` with a deterministic signal that was not available when the install was registered:

| `claim_source` | When the SDK sends it |
|---|---|
| `late_referrer` | The Android referrer was not definitive at registration time and became available later, in the same process (the native reader was still retrying) or on one of the next five launches. Also used for an Apple Search Ads token obtained on a later launch. |
| `clipboard` | The iOS pasteboard alert was answered after the registration request had already left. |
| `paste_control` | The user tapped a `DectogPasteButton` and the pasteboard held a DecTog link. |

Outcomes, as `claim` and `claimReason` on the returned verdict:

| `claim` | `claimReason` | Meaning |
|---|---|---|
| `upgraded` | | The signal named a click; the verdict is now `guaranteed` and is re-emitted. A fingerprint guess, if any, is released. |
| `unchanged` | `already_deterministic` | The install was already credited by a deterministic signal (a replay of the same signal, or a strict-mode zeroed verdict that kept the click as evidence). |
| `rejected` | `click_reuse` | The click is already credited to another device's install. The flag `click_reuse` is added. |
| `rejected` | `click_not_found` | The click id is unknown and the signal carried no usable `dtg_l` tag to synthesize it. |
| `rejected` | `no_signal` | The body carried no `dtg_click` at all. |
| `rejected` | `stale_click` | The pasted link or Meta referrer names a click older than the app's deterministic window (7 days by default). |

The referrer question is marked settled in the sentinel only after the server acknowledged the claim (200, or 404 for an install the server no longer knows), so a claim lost to a network error is retried on the next launch. Claims never run the fingerprint.

## Install state and app updates

The SDK classifies every registration client-side and sends it as `install_state`; the server echoes it as `installState`:

| Platform | `install` | `update` | `reinstall` |
|---|---|---|---|
| Android | `lastUpdateTime` within 24 hours of `firstInstallTime` | `lastUpdateTime` more than 24 hours after `firstInstallTime` | not detectable on the client |
| iOS | executable created within 24 hours of the Library directory | executable created more than 24 hours after the Library directory | the Keychain first-install date predates the Documents directory by more than 24 hours |

An `update` is an existing user whose app merely updated to a build that ships the SDK. The server never fingerprint-matches an update, so a stale click from the orphan pool cannot be credited to a long-time user. Deterministic signals still apply.

`isReinstall` is set when the client reported `reinstall` or when the server has seen this device id on an earlier non-reinstall install of the same account. Reinstalls are not kept out of matching: they run the full deterministic ladder and the fingerprint exactly like a fresh install and can come back `matched: true`. The flag only excludes them from the dashboard's Installs number and the per-link install counts. On iOS the reinstall detection depends on `persistDeviceId` (the Keychain-held IDFV) and the Keychain install dates; with `persistDeviceId: false` a reinstall looks like a new device unless a referrer or the pasteboard attributes it.

The SDK also sends `first_install_ts`: the package's `firstInstallTime` on Android, the Keychain first-install date (or the Documents directory's creation date) on iOS.

## The sentinel and backup exclusion

The install sentinel is the file `.dectog_install.json` (format version 2) in the SDK's private storage directory:

- Android: `Context.getNoBackupFilesDir()/dectog/`, excluded from key/value backup and Auto Backup by the platform.
- iOS: the Application Support directory, subfolder `dectog`, with `NSURLIsExcludedFromBackupKey` set on the folder.

A restored backup therefore never carries a `tracked` sentinel onto a fresh install, which would suppress the registration for good. As a second line of defense the file stores the package first-install time it was written with; a mismatch means the file came from a previous installation and it is discarded.

The sentinel records the status (`pending`, `tracked`, `failed`, `abandoned`), `install_attempt_id`, the attempt counter, timestamps, the last error, the server `install_id`, whether the referrer and the Apple Search Ads token were delivered and acknowledged, and how many launches have re-read the referrer. The same directory holds the SDK state file (`.dectog_sdk_state.json`) and the event queue (`.dectog_event_queue.jsonl`).

To make a device register again during development, uninstall the app (iOS) or run `adb shell pm clear <package>` (Android). See [Testing](/sdk/testing/).

## The idempotent attempt id

`install_attempt_id` is the SDK's idempotency key. It is generated and persisted before the first request and reused on every retry, in-process and across launches. The server keeps a unique index on it per account: a retry of a request whose response was lost returns the stored verdict with `replayed: true`, and two retries racing each other produce exactly one install. A deterministic signal that names a click already credited to an install of the **same device** also replays that install's verdict, so a device that lost its SDK state adopts its earlier install id.

## When the server lost the install

The SDK keeps the install id of its verdict. If the server no longer knows it, because the database was restored, the retention sweep removed it, or the app now points at a fresh database, the events endpoint answers `action: reregister` and the attribution pull answers `404 install_not_found`. The SDK then resets its sentinel and registers again: a new attempt id, `install_state: reinstall`, and `recovered_from` naming the lost id. The server never fingerprints that registration, because the device is not a new install; a store referrer the SDK still holds can match deterministically. The new verdict is emitted on `onAppInstalled`. Events sent in between are kept.

## Getting the verdict later

`getAttributionData()` returns the cached verdict when this process registered the install, otherwise it re-pulls `GET /api/v1/attribution` by `device_id` (when `collectDeviceData` is on) or by the persisted `install_id`. An organic install comes back as a verdict with `matched: false`; `null` means the server knows no install for this device at all. Re-pulled verdicts also carry `lastOpen`, the latest link that opened the installed app.
