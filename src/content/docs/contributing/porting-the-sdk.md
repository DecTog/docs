---
title: Porting the SDK
description: How an AdTo SDK is built on the shared contract, the shared fixtures and the shared native code, using the React Native SDK as the worked example.
sidebar:
  order: 2
---

AdTo has two app SDKs on one contract: `flutter_adto`, the reference implementation, and `react-native-adto`, a port of it. A new SDK (a native Swift or Kotlin one, say) follows the same route. Nothing below is a specification of its own: the server's [API overview](/api/overview/) and its `docs/API_CONTRACT.md` are the contract, and the Flutter SDK's behaviour is the reference.

## What a port shares, byte for byte

| What | Source | Why |
|---|---|---|
| Golden wire fixtures | `adto/apps/worker/test/fixtures/wire/` | Every v1 response the server sends, held to its shape by the server's own test. Each SDK parses all of them in a test that fails when a new fixture appears unparsed. |
| Link-URL cases | `flutter_adto/test/fixtures/url-cases.json` | Which URLs are AdTo links and which are not: subdomain, path and custom-domain forms, `dtg_l` scheme links, development forms, and the shapes that must be rejected. Each SDK runs every case. |
| Native reads | `flutter_adto/android/src/main/kotlin/app/adto/core/`, and `AdtoDevice.swift`, `AdtoKeychain.swift`, `AdtoInstallDates.swift`, `AdtoPasteTargetView.swift` | The store install referrers, the pasteboard, the paste control, the Keychain device id, the install dates. They import no framework, so an SDK maps its own bridge onto them instead of rewriting them (design decision R19: shared native code stays source, never an opaque binary). |
| The iOS privacy manifest | `flutter_adto/ios/.../PrivacyInfo.xcprivacy` | The same reads, so the same declarations. |

`react-native-adto` copies these with `tool/sync_shared.sh`, and its CI fails when a copy differs. A change to a native read lands in `flutter_adto` first.

## What a port reimplements

The SDK logic itself, against the Flutter SDK's code and tests: the install registration (one per install, a persisted `install_attempt_id`, the backup-excluded sentinel checked against the package's first-install time, bounded retries with `Retry-After`, late claims, recovery when the server lost the install), link handling (the cold start once per process, relaunches from recents ignored, OAuth callbacks never reported), the durable event queue with `client_event_id`s, consent mode, request signing (`v1=HMAC-SHA256(key, "<ts>.<sha256(body)>")` over the exact bytes sent), and the server's error envelope. `react-native-adto` carries its own SHA-256 and HMAC, because Hermes has no WebCrypto, checked against the NIST and RFC 4231 vectors.

Each behaviour the Flutter SDK's harness test (`test/sdk_harness_test.dart`) checks has a counterpart in the port's (`test/sdk.test.ts` in React Native), run against a fake native layer and a recording network.

## Identity

A port sends `x-dectog-sdk: <name>/<version>` on every signed call (`react-native-adto/1.0.0`); the server stores it on installs, events and clicks, the Overview lists the builds in use, and `MIN_SDK_VERSION` can name a minimum per SDK. It sends `app_platform` on the install (`flutter`, `react_native`).

## Where to start

Read `react-native-adto`: `src/Adto.ts` is the port of `flutter_adto/lib/src/adto_impl.dart`, `src/internal/` of `lib/src/services/`, and `ios/AdtoModule.swift` and `android/.../AdtoModule.kt` show how little a bridge needs once the native reads are shared. See [Contributing](/contributing/) for each repository's layout and checks.
