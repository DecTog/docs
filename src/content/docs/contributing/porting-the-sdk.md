---
title: Porting the SDK
description: How a DecTog SDK is built on the shared contract, the shared fixtures and the shared native code, using the React Native SDK as the worked example.
sidebar:
  order: 2
---

DecTog has two app SDKs on one contract: `flutter_dectog`, the reference implementation, and `react-native-dectog`, a port of it. A new SDK (a native Swift or Kotlin one, say) follows the same route. Nothing below is a specification of its own: the server's [API overview](/api/overview/) and its `docs/API_CONTRACT.md` are the contract, and the Flutter SDK's behaviour is the reference.

## What a port shares, byte for byte

| What | Source | Why |
|---|---|---|
| Golden wire fixtures | `dectog/apps/worker/test/fixtures/wire/` | Every v1 response the server sends, held to its shape by the server's own test. Each SDK parses all of them in a test that fails when a new fixture appears unparsed. |
| Link-URL cases | `flutter_dectog/test/fixtures/url-cases.json` | Which URLs are DecTog links and which are not: subdomain, path and custom-domain forms, `dtg_l` scheme links, development forms, and the shapes that must be rejected. Each SDK runs every case. |
| Native reads | `flutter_dectog/android/src/main/kotlin/app/dectog/core/`, and `DectogDevice.swift`, `DectogKeychain.swift`, `DectogInstallDates.swift`, `DectogPasteTargetView.swift` | The store install referrers, the pasteboard, the paste control, the Keychain device id, the install dates. They import no framework, so an SDK maps its own bridge onto them instead of rewriting them (design decision R19: shared native code stays source, never an opaque binary). |
| The iOS privacy manifest | `flutter_dectog/ios/.../PrivacyInfo.xcprivacy` | The same reads, so the same declarations. |

`react-native-dectog` copies these with `tool/sync_shared.sh`, and its CI fails when a copy differs. A change to a native read lands in `flutter_dectog` first.

## What a port reimplements

The SDK logic itself, against the Flutter SDK's code and tests: the install registration (one per install, a persisted `install_attempt_id`, the backup-excluded sentinel checked against the package's first-install time, bounded retries with `Retry-After`, late claims, recovery when the server lost the install), link handling (the cold start once per process, relaunches from recents ignored, OAuth callbacks never reported), the durable event queue with `client_event_id`s, consent mode, request signing (`v1=HMAC-SHA256(key, "<ts>.<sha256(body)>")` over the exact bytes sent), and the server's error envelope. `react-native-dectog` carries its own SHA-256 and HMAC, because Hermes has no WebCrypto, checked against the NIST and RFC 4231 vectors.

Each behaviour the Flutter SDK's harness test (`test/sdk_harness_test.dart`) checks has a counterpart in the port's (`test/sdk.test.ts` in React Native), run against a fake native layer and a recording network.

## Identity

A port sends `x-dectog-sdk: <name>/<version>` on every signed call (`react-native-dectog/1.0.0`); the server stores it on installs, events and clicks, the Overview lists the builds in use, and `MIN_SDK_VERSION` can name a minimum per SDK. It sends `app_platform` on the install (`flutter`, `react_native`).

## Where to start

Read `react-native-dectog`: `src/Dectog.ts` is the port of `flutter_dectog/lib/src/dectog_impl.dart`, `src/internal/` of `lib/src/services/`, and `ios/DectogModule.swift` and `android/.../DectogModule.kt` show how little a bridge needs once the native reads are shared. See [Contributing](/contributing/) for each repository's layout and checks.
