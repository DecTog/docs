---
title: Contributing
description: Repository layout of the Flutter and React Native SDKs and these docs, how to run their checks, how to propose changes, and the licenses.
sidebar:
  order: 1
---

AdTo is a hosted service. Its server, dashboard and website (`ad-to/adto`) are proprietary and not open to outside changes. The SDKs and these docs are open, under [github.com/ad-to](https://github.com/ad-to):

| Repository | Contents | License |
|---|---|---|
| `ad-to/flutter_adto` | The Flutter SDK, the `flutter_adto` package ([on pub.dev](https://pub.dev/packages/flutter_adto)) | MIT |
| `ad-to/react-native-adto` | The React Native and Expo SDK, the `react-native-adto` package (not yet published on npm) | MIT |
| `ad-to/docs` | This site | Content CC BY 4.0, site code MIT |

## Repository layout

### `flutter_adto` (SDK)

| Path | What it is |
|---|---|
| `lib/flutter_adto.dart` | The public entry point |
| `lib/src/adto_impl.dart` | `FlutterAdto`: initialization, link handling, install registration, claims, events, link CRUD |
| `lib/src/models/` | `AdtoConfig`, `AdtoLink`, `AdtoTempLink`, `AdtoLinkResolution`, `AdtoLinkClick`, `AdtoAppInstallRequest`, `AdtoAppInstallResponse`, `AdtoClickParams`, `AdtoError` |
| `lib/src/services/` | Device identity and hardware, the install referrer service, the install state store (the `.dectog_install.json` sentinel), the event queue, request signing, the retry policy, the sensitive-URL filter, the link deduper |
| `lib/src/widgets/adto_paste_button.dart` | `AdtoPasteButton` |
| `android/src/main/kotlin/app/adto/core/` | The framework-free Android reads every AdTo SDK shares as source: `AdtoDevice.kt` (device id, carrier, package and launch info, Meta referrer, App Links state), `InstallReferrers.kt` (Play, Huawei, Samsung, Xiaomi and vivo readers), `Pasteboard.kt` |
| `android/src/main/kotlin/app/adto/flutter_adto/` | `AdtoIdentifiersPlugin.kt`, which maps the method channel onto `app.adto.core` |
| `ios/flutter_adto/` | The Swift package. Framework-free, shared as source: `AdtoDevice.swift`, `AdtoInstallDates.swift`, `AdtoKeychain.swift`, `AdtoPasteTargetView.swift`; Flutter glue: `AdtoIdentifiersPlugin.swift`, `AdtoPasteControl.swift`. `ios/flutter_adto.podspec` for CocoaPods hosts |
| `example/` | Trails, the example app: shared links, invites and referrals, onboarding, `identify`, a demo purchase, screen views. Reads `env/dev.json` for `ADTO_API_KEY`, `ADTO_BASE_URL`, `ADTO_LINK_ROOT_DOMAIN`; `example/site/` is its store-badges page |
| `test/` | Unit tests for the models, the referrer service, the state store, the event queue, signing, the retry policy, the URL parser and the paste button |
| `doc/api-reference.md`, `llms.txt` | The API reference this site syncs, and the agent index generated from it (`dart run tool/gen_llms.dart`) |

### `react-native-adto` (SDK)

A port of `flutter_adto` on the same contract and fixtures; [Porting the SDK](/contributing/porting-the-sdk/) explains what it shares and what it reimplements.

| Path | What it is |
|---|---|
| `src/Adto.ts` | `AdtoSdk` and the `Adto` singleton: initialization, link handling, install registration, claims, events, link CRUD (the port of `lib/src/adto_impl.dart`) |
| `src/internal/` | The services: install state, event queue, request signing with its own SHA-256 and HMAC, the retry policy, the URL parser, the link filter and deduper, the referrer and pasteboard gates |
| `src/models/`, `src/config.ts`, `src/errors.ts` | The public types, `AdtoConfig` and `AdtoError` |
| `src/navigation.ts`, `src/PasteButton.tsx` | `trackNavigation` for React Navigation and Expo Router, and `AdtoPasteButton` |
| `ios/Shared/`, `android/src/main/java/app/adto/core/` | Copies of the shared native reads; `tool/sync_shared.sh --check` fails on any difference from `flutter_adto` |
| `ios/AdtoModule.swift`, `android/.../reactnative/AdtoModule.kt` | The Expo module: the bridge onto the shared reads |
| `plugin/src/` | The config plugin: associated domains, URL types, intent filters; `app.plugin.js` loads it |
| `test/` | Jest suites against a fake native layer and a recording network; `test/fixtures/` are the shared wire fixtures and URL cases |
| `example/` | An Expo app with the plugin configured; `expo prebuild` generates its native projects |
| `doc/api-reference.md`, `llms.txt` | The API reference this site syncs, and the agent index (`npm run llms`) |

### `docs` (this site)

| Path | What it is |
|---|---|
| `src/content/docs/<group>/<slug>.md` | One page per file; the sidebar groups are fixed in `astro.config.mjs` and pages are ordered by `sidebar.order` |
| `src/components/Footer.astro` | The footer with the version note (the SDK versions) and the license split |
| `render.yaml` | The Render static site that serves `dist/` at docs.adto.app |
| `.github/workflows/build.yml` | Builds every push and pull request; deploys nothing |

## Running the checks

```bash
# SDKs
cd flutter_adto && flutter pub get && flutter analyze && flutter test
cd react-native-adto && npm ci && npm test && npm run typecheck && npm run sync:check

# Docs
cd docs && npm ci && npm run build            # fails on broken internal links
```

To try an SDK change end to end, run its example app against AdTo with an SDK key of your account's [test environment](/sdk/testing/#a-test-environment-for-debug-builds), so nothing you test reaches your live numbers.

## Design decisions to keep

- API keys are stored as a SHA-256 hash plus a prefix. The account key is shown once and kept no other way; SDK and site keys also keep an AES-GCM encrypted copy (keyed from `JWT_SECRET`) so Settings can show them again. Every SDK call is also HMAC-signed with the key.
- Attribution: deterministic signals first (store referrers, Meta, pasteboard), then a scored, tenant-scoped fingerprint; one install per click; 24-hour window for candidates with a device model or a screen profile to compare with the install and 2 hours otherwise; credit only at high confidence, routing at medium, nothing on a tie between different links. See [Attribution internals](/start/attribution-internals/).
- Privacy: hashed IPs (IPv6 at /64), raw rows deleted (or their personal columns blanked) on the retention schedule, ad identifiers in their own table and never joined to device data, and a vendor-scoped device id that survives a reinstall by default (`persistDeviceId` on iOS). See [Privacy and data](/guides/privacy-and-data/).
- The name: AdTo means "Ads to app". Prose writes AdTo, one word with a capital A and a capital T; domains and packages use `adto` (`flutter_adto`, `react-native-adto`), and identifiers keep their language's casing (`FlutterAdto`, `AdtoConfig`).

## Proposing a change

1. Open an issue on the repository the change belongs to. For behavior changes, describe the current behavior and the one you want before writing code.
2. Fork, branch, and keep the checks above green. An SDK change needs a test in `test/`.
3. Keep the prose in step with the code. The pages of this site and each SDK's `doc/api-reference.md` and `llms.txt` describe the same behavior; update the ones your change affects, and bump the version note in `src/components/Footer.astro` when an SDK version changes.
4. Never commit secrets. `env/dev.json` and OAuth client secret files stay out of commits.
5. Open a pull request. The docs site builds every pull request; a merged change reaches docs.adto.app with the next deploy.

Documentation fixes are the quickest contribution: every page has an "Edit page" link that opens the file on GitHub.

## Licenses

- The server, dashboard and website (`ad-to/adto`) are proprietary: all rights reserved.
- The Flutter and React Native SDKs (`ad-to/flutter_adto`, `ad-to/react-native-adto`) are licensed under the MIT License.
- These docs: the content under `src/content` is licensed under CC BY 4.0 (reuse it with attribution); the site code (configuration, components, styles) is MIT.
