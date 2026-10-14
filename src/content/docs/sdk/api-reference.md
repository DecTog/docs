---
title: API reference
description: Every public class, method, field, stream and enum of flutter_dectog with its type, default and HTTP endpoint.
sidebar:
  order: 10
---

<!-- Generated from flutter_dectog/doc/api-reference.md by npm run sync:sdk-reference. Edit it there. -->

Everything below is exported by `package:flutter_dectog/flutter_dectog.dart`. Nullable types are marked with `?`. Methods on `FlutterDectog` throw `DectogError` on failure; a method called before `initialize` throws a `configuration` error.

## FlutterDectog

`abstract interface class FlutterDectog`. The factory `FlutterDectog()` returns the process-wide singleton.

### Lifecycle

| Member | Signature | Notes |
|---|---|---|
| `initialize` | `Future<void> initialize(DectogConfig config)` | Once per process. Throws `configuration` when called twice; a failed call can be retried. Resolves after the cold-start link and, on the first launch, the install registration. |
| `dispose` | `Future<void> dispose()` | Cancels link listening, closes both streams, flushes the event queue, closes the HTTP client. The SDK cannot be initialized again afterwards. |

### Links

| Member | Signature | Endpoint |
|---|---|---|
| `onLinkClick` | `Stream<DectogLinkClick> get onLinkClick` | Broadcast stream. Emits for links opened while running and for the cold-start link. |
| `getInitialLink` | `Future<DectogLinkClick?> getInitialLink()` | The link that launched the app, consumed once per process; `null` without one or after a relaunch from the Android recents screen. |
| `resolveLink` | `Future<DectogLinkResolution> resolveLink(String username, String slug)` | `GET /api/v1/resolve/{username}/{slug}`, public, unsigned. |

### Link management

| Member | Signature | Endpoint |
|---|---|---|
| `createLink` | `Future<DectogLink> createLink({required String slug, String? target, Map<String, dynamic>? metadata, String? appId, String? iosDeepLinkPath, String? androidDeepLinkPath, String? redirectUrl, String? fallbackUrl, String? ogTitle, String? ogDescription, String? ogImageUrl, String? label, String? campaign, String? adgroup, String? creative})` | `POST /api/v1/links`, expects 201 |
| `updateLink` | `Future<DectogLink> updateLink(String slug, {String? target, Map<String, dynamic>? metadata, String? iosDeepLinkPath, String? androidDeepLinkPath, String? redirectUrl, String? fallbackUrl, String? ogTitle, String? ogDescription, String? ogImageUrl, String? label, String? campaign, String? adgroup, String? creative})` | `PUT /api/v1/links/{slug}`. `null` keeps, `''` clears. |
| `getLinks` | `Future<DectogLinkPage> getLinks({int? limit, String? cursor})` | `GET /api/v1/links`; one page, newest first. `DectogLinkPage` has `links`, `nextCursor` (pass it back as `cursor`) and `hasMore`. |
| `getLink` | `Future<DectogLink> getLink(String slug)` | `GET /api/v1/links/{slug}` |
| `deleteLink` | `Future<void> deleteLink(String slug)` | `DELETE /api/v1/links/{slug}`. Also deletes the link's clicks and the installs, events and app opens attributed to it. |
| `createTempLink` | `Future<DectogTempLink> createTempLink({String? target, String? slug, int ttlSeconds = 900, String? ogTitle, String? ogDescription, String? ogImageUrl})` | `POST /api/v1/temp-links`, expects 201. TTL clamped to 60 seconds to 30 days. |
| `updateTempLink` | `Future<DectogTempLink> updateTempLink(String slug, {String? target, String? ogTitle, String? ogDescription, String? ogImageUrl})` | `PUT /api/v1/temp-links/{slug}` |
| `getTempLink` | `Future<DectogTempLink> getTempLink(String slug)` | `GET /api/v1/temp-links/{slug}` |
| `deleteTempLink` | `Future<void> deleteTempLink(String slug)` | `DELETE /api/v1/temp-links/{slug}` |

### Install attribution

| Member | Signature | Notes |
|---|---|---|
| `onAppInstalled` | `Stream<DectogAppInstallResponse> get onAppInstalled` | Replays the latest verdict to late subscribers. Emits the first-launch verdict and every claim that upgraded it. |
| `currentAppInstall` | `DectogAppInstallResponse? get currentAppInstall` | The latest emitted verdict, or `null`. |
| `getAttributionData` | `Future<DectogAppInstallResponse?> getAttributionData()` | The cached verdict, else `GET /api/v1/attribution?device_id=` (device tier on) or `?install_id=`. Organic installs come back with `matched: false`; `null` when the server knows no install for this device, or when neither id is available. |
| `willShowPasteboardPrompt` | `Future<bool> willShowPasteboardPrompt({bool? readClipboardOnInstall})` | Whether this launch's pasteboard read would show the iOS 16 alert. Callable before `initialize`. Always `false` on Android. |

### Events

| Member | Signature | Notes |
|---|---|---|
| `identify` | `Future<void> identify({required String customerId, String? name, String? email, String? phone})` | Queues an `identify` event unless identical to the previous one; persists the customer id. |
| `trackConversion` | `Future<void> trackConversion({required double revenue, String? currency, String? eventName, String? productId, String? transactionId, Map<String, dynamic>? metadata})` | Queues a `conversion` event; `eventName` defaults to `purchase`. |
| `trackEvent` | `Future<void> trackEvent(String eventName, {Map<String, dynamic>? data})` | Queues a `custom` event. |
| `flush` | `Future<void> flush()` | Sends up to 100 queued events now (`POST /api/v1/events`). |
| `logout` | `Future<void> logout()` | Flushes, then forgets the customer id. |
| `setEnabled` | `Future<void> setEnabled(bool enabled)` | Persisted, default `true`. `false` records nothing: no click, app-open, install, claim, pasteboard or device-ping reports; new events are discarded and the queue cleared. `true` restarts the sender and registers the install if it never was. Links are still delivered. |
| `isEnabled` | `Future<bool> isEnabled()` | The persisted flag. |

Background calls the SDK makes on its own: `POST /api/v1/clicks` and `POST /api/v1/app-opens` for every recognized link open, `POST /api/v1/app-installs` on the first launch, `POST /api/v1/app-installs/{id}/claim` for late signals, `POST /api/v1/device-ping` on every initialize with the device tier on.

## DectogConfig

```dart
const DectogConfig({
  required String apiKey,
  String? baseUrl,
  String? linkRootDomain,
  bool enableDebugLogging = false,
  InstallReferrerProvider? installReferrerProvider,
  Duration installReferrerTimeout = const Duration(seconds: 5),
  bool oemStoreReferrers = true,
  bool collectDeviceData = true,
  bool? readClipboardOnInstall,
  String? fbAppId,
  bool persistDeviceId = true,
  bool collectAppleSearchAdsToken = false,
})
```

| Member | Type | Meaning |
|---|---|---|
| `apiKey` | `String` | An SDK key (`dtg_pub_…`); also the HMAC key for request signing. |
| `baseUrl` | `String?` | Self-hosted API base. `null` means `https://app.dectog.com`. |
| `linkRootDomain` | `String?` | Root domain of tenant links. `null` means `dectog.com` when `baseUrl` is unset, else the host of `baseUrl`. |
| `enableDebugLogging` | `bool` | Print SDK logs. |
| `installReferrerProvider` | `InstallReferrerProvider?` | Custom Play referrer source, Android only. |
| `installReferrerTimeout` | `Duration` | First-launch wait for the Android referrer. |
| `oemStoreReferrers` | `bool` | Read Huawei, Samsung, Xiaomi and vivo referrers too. |
| `collectDeviceData` | `bool` | Send the device, hardware, screen and network tier. |
| `readClipboardOnInstall` | `bool?` | Pasteboard read at first launch; `null` means iOS on, Android off. |
| `fbAppId` | `String?` | Enables Meta's on-device referrer on Android. |
| `persistDeviceId` | `bool` | Keep the first IDFV in the iOS Keychain. |
| `collectAppleSearchAdsToken` | `bool` | Read the AdServices token on iOS 14.3 and newer. |
| `defaultBaseUrl` | `static const String` | `'https://app.dectog.com'` |
| `defaultLinkRootDomain` | `static const String` | `'dectog.com'` |
| `effectiveBaseUrl` | `String get` | `baseUrl` with trailing slashes removed, or the default. |
| `effectiveLinkRootDomain` | `String? get` | `linkRootDomain` with trailing dots removed; `dectog.com` when both are unset; `null` (use the API host) when only `baseUrl` is set. |
| `resolveReadClipboard` | `static bool resolveReadClipboard(bool? value, {required bool isIOS})` | `value ?? isIOS`. |
| `readClipboardFor` | `bool readClipboardFor({required bool isIOS})` | The read decision for this config on the given platform. |
| `toString` | | Masks the key to its first 8 characters. |

`typedef InstallReferrerProvider = Future<String?> Function();` returns the raw Play referrer string, or `null` when unavailable.

## Link models

### DectogLink

A permanent link as the API returns it. All fields are `final`; `DectogLink.fromJson(Map<String, dynamic>)` parses the API shape. Equality compares `id`, `slug`, `target` and `url`.

| Field | Type | Meaning |
|---|---|---|
| `id` | `String` | Server id |
| `slug` | `String` | |
| `target` | `String?` | Web target; `null` inherits the app's fallback URL |
| `url` | `String` | The shareable URL |
| `appId` | `String?` | Owning app; `null` means the account's oldest app |
| `clickCount` | `int` | Lifetime clicks |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime?` | |
| `metadata` | `Map<String, dynamic>?` | Returned as `customParameters` on attributed installs |
| `ogTitle`, `ogDescription`, `ogImageUrl` | `String?` | Social preview overrides |
| `iosDeepLinkPath`, `androidDeepLinkPath` | `String?` | In-app route per platform |
| `redirectUrl` | `String?` | Mobile destination when the app is not installed |
| `fallbackUrl` | `String?` | Desktop destination |
| `label`, `campaign`, `adgroup`, `creative` | `String?` | Tracking defaults for every click |

### DectogLinkPage

One page of `getLinks`, newest first. `DectogLinkPage.fromJson` parses the API's `{"data": [...], "next_cursor": ...}` envelope.

| Field | Type | Meaning |
|---|---|---|
| `links` | `List<DectogLink>` | The links on this page |
| `nextCursor` | `String?` | Pass to `getLinks(cursor:)` for the next page; `null` on the last one |
| `hasMore` | `bool get` | `nextCursor != null` |

### DectogTempLink

| Field | Type | Meaning |
|---|---|---|
| `id`, `slug`, `url` | `String` | |
| `target` | `String?` | `null` inherits the app's fallback URL |
| `expiresAt`, `createdAt` | `DateTime` | |
| `ttlSeconds` | `int?` | |
| `ogTitle`, `ogDescription`, `ogImageUrl` | `String?` | |
| `isExpired` | `bool get` | `DateTime.now()` is after `expiresAt` |
| `timeUntilExpiration` | `Duration get` | Zero once expired |

`DectogTempLink.fromJson` parses the API shape. Equality compares `id`, `slug`, `target` and `url`.

### DectogLinkResolution

The public resolve result, for permanent and temporary links.

| Field | Type | Meaning |
|---|---|---|
| `id`, `slug`, `url` | `String` | |
| `target` | `String?` | |
| `type` | `String` | `'permanent'` or `'temporary'` |
| `isExpired` | `bool` | Always `false` for permanent links |
| `createdAt` | `DateTime` | |
| `clickCount` | `int?` | Permanent links only |
| `expiresAt` | `DateTime?` | Temporary links only |
| `ttlSeconds` | `int?` | Temporary links only |
| `metadata` | `Map<String, dynamic>?` | Permanent links only |
| `iosDeepLinkPath`, `androidDeepLinkPath` | `String?` | Permanent links only |
| `deepLinkPathFor` | `String? deepLinkPathFor(String platform)` | `'ios'` returns the iOS path, anything else the Android path |
| `isPermanent`, `isTemporary` | `bool get` | |
| `timeUntilExpiration` | `Duration? get` | `null` without `expiresAt` |
| `toDectogLink` | `DectogLink? toDectogLink()` | `null` for temporary links |
| `toDectogTempLink` | `DectogTempLink? toDectogTempLink()` | `null` for permanent links or without `expiresAt` |

### DectogLinkClick

| Field | Type | Meaning |
|---|---|---|
| `originalUrl` | `String` | The URL that opened the app (`'unknown'` when the platform reported an error) |
| `slug`, `username` | `String` | Parsed from the URL; `'unknown'` when parsing failed |
| `receivedAt` | `DateTime` | |
| `error` | `DectogError?` | Set for non-DecTog URLs, processing failures and calls before `initialize` |
| `linkResolution` | `DectogLinkResolution?` | Set when the resolve call succeeded |
| `isResolved` | `bool get` | `linkResolution != null && error == null` |
| `targetUrl` | `String? get` | `linkResolution?.target` |
| `linkType` | `String? get` | `linkResolution?.type` |
| `clickParams` | `DectogClickParams? get` | The `dec_*` parameters of `originalUrl`, or `null` |

Extension `DectogLinkClickX` on `DectogLinkClick`: `Map<String, String>? get queryParameters`, `String? queryParameter(String key)`, `String? get path`, `String? get host`, `String? get scheme`, `String? get fragment`, all read from `originalUrl`.

### DectogClickParams

The per-click `dec_*` overrides.

| Field | Type | Query parameter |
|---|---|---|
| `deepLink` | `String?` | `dec_deeplink` (the route without a scheme on verdicts; the raw value on opened URLs) |
| `label` | `String?` | `dec_label` |
| `campaign` | `String?` | `dec_campaign` |
| `adgroup` | `String?` | `dec_adgroup` |
| `creative` | `String?` | `dec_creative` |
| `tracker` | `String?` | `dec_tracker` |

`bool get isEmpty`, `DectogClickParams.fromJson(Map<String, dynamic>)` (the server's `click_params` shape), `static DectogClickParams? fromUri(Uri uri)` (`null` when the URL carries none), `Map<String, dynamic> toJson()`.

## Install models

### DectogAppInstallResponse

The verdict on `onAppInstalled`, `currentAppInstall`, `getAttributionData()` and claim responses. `DectogAppInstallResponse.fromJson` and `toJson` use the server's snake_case keys.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `matched` | `bool` | | Attribution credit, granted at `guaranteed` or `high` confidence |
| `type` | `String` | | `'organic'` or `'non-organic'` |
| `matchSource` | `String?` | | `'referrer'`, `'clipboard'`, `'fingerprint'` or `null` |
| `referrerSource` | `String?` | | `'google_play'`, `'huawei'`, `'samsung'`, `'xiaomi'`, `'vivo'`, `'meta'` or `null` |
| `matchConfidence` | `String?` | | `'guaranteed'`, `'high'`, `'medium'`, `'low'` or `null` |
| `routing` | `DectogDeferredRoute?` | | Deferred-routing candidate at `medium` or better |
| `fraudFlags` | `List<String>` | `[]` | Fraud rules the install tripped |
| `username`, `slug` | `String?` | | Set when credited |
| `installId` | `String?` | | The server's install id |
| `clickedAt` | `DateTime?` | | The credited click's time |
| `link` | `DectogAppInstallLink?` | | The credited permanent link |
| `customParameters` | `Map<String, dynamic>?` | | The credited link's metadata |
| `clickParams` | `DectogClickParams?` | | The credited click's `dec_*` values |
| `deepLink` | `String?` | | `clickParams?.deepLink`, the route to open |
| `replayed` | `bool` | `false` | The server returned a stored verdict for a known attempt id |
| `isReinstall` | `bool` | `false` | Server or client reinstall detection |
| `installState` | `String?` | | `'install'`, `'reinstall'` or `'update'` |
| `claim` | `String?` | | `'upgraded'`, `'unchanged'` or `'rejected'` on claim responses |
| `claimReason` | `String?` | | `'click_reuse'`, `'click_not_found'`, `'no_signal'`, `'already_deterministic'` or `'stale_click'` |
| `appleSearchAds` | `DectogAppleSearchAds?` | | `null` until a token was ever sent |
| `lastOpen` | `DectogAppOpen?` | | Only on attribution re-pulls |

### DectogDeferredRoute

| Field | Type |
|---|---|
| `username`, `slug` | `String?` |
| `deepLink` | `String?` |
| `clickParams` | `DectogClickParams?` |
| `confidence` | `String?` (`'guaranteed'`, `'high'` or `'medium'`) |
| `clickedAt` | `DateTime?` |

### DectogAppInstallLink

| Field | Type |
|---|---|
| `slug`, `url` | `String` |
| `target` | `String?` |
| `createdAt` | `DateTime` |
| `metadata` | `Map<String, dynamic>?` |

### DectogAppOpen

| Field | Type |
|---|---|
| `username`, `slug` | `String` |
| `clickId` | `String?` |
| `openedAt` | `DateTime` |

### DectogAppleSearchAds

| Field | Type | Meaning |
|---|---|---|
| `status` | `String` | `'pending'`, `'resolved'`, `'no_attribution'`, `'invalid'`, `'expired'` or `'failed'` |
| `attribution` | `bool?` | Apple's verdict once answered |
| `resolvedAt` | `DateTime?` | |
| `orgId`, `campaignId`, `adGroupId`, `keywordId`, `adId` | `int?` | Apple Ads ids |
| `conversionType` | `String?` | `'Download'`, `'Redownload'` or `'PreOrder'` |
| `claimType` | `String?` | `'Click'` or `'Impression'` |
| `clickDate`, `impressionDate` | `String?` | Apple's timestamps as sent |
| `countryOrRegion`, `supplyPlacement` | `String?` | |
| `isPending` | `bool get` | `status == 'pending'` |
| `isAttributed` | `bool get` | `attribution == true` |

### DectogAppInstallRequest and AppInfo

`DectogAppInstallRequest` is the wire model of the install registration (every field the SDK can send, all optional, `toJson` emits only non-null values). `AppInfo` carries the `package_info_plus` values the SDK reads (`appName`, `packageName`, `version`, `buildNumber`, `buildSignature`, `installerStore`, `installTime`, `updateTime`, with `installTimeMs` and `updateTimeMs` getters). Both are exported so the payload is inspectable, but the SDK builds them itself; you never construct them.

## Errors

### DectogError

`class DectogError implements Exception`.

| Field | Type | Meaning |
|---|---|---|
| `message` | `String` | The server's `error.message` for API errors, else the SDK's description |
| `statusCode` | `int?` | HTTP status for API errors |
| `code` | `String?` | The server's `error.code` for API errors, such as `conflict`, `invalid_request`, `rate_limited` or `invalid_signature` ([Errors](/api/overview/#errors)); null otherwise |
| `requestId` | `String?` | The server's `error.request_id`, else the `x-request-id` header; quote it when reporting a problem |
| `type` | `DectogErrorType` | |
| `details` | `Map<String, dynamic>?` | Every field of the server's `error` object (for example `slug` on a 409); `retry_after_ms` is added when the response carried `Retry-After` |

Factories: `DectogError.apiError({required String message, required int statusCode, Map<String, dynamic>? details, String? code, String? requestId})`, `DectogError.fromResponse({required int statusCode, required String body, required String fallbackMessage, String? headerRequestId, Map<String, dynamic> extraDetails})` (parses the server's error envelope), `DectogError.networkError(String message)`, `DectogError.configError(String message)`, `DectogError.linkError(String message)`. `toString()` renders `DectogError: <message> (Status: <status>, <code>) [request <requestId>] Details: <details>`.

### DectogErrorType

`api` (HTTP error from the server), `network` (connectivity or the 30-second timeout), `configuration` (not initialized, initialized twice, failed initialization), `linkResolution` (a URL that is not a DecTog link, or link processing failed), `unknown` (reserved).

## Widgets

### DectogPasteButton

```dart
const DectogPasteButton({
  Key? key,
  Size size = const Size(200, 44),
  DectogPasteDisplayMode displayMode = DectogPasteDisplayMode.iconAndLabel,
  DectogPasteCornerStyle cornerStyle = DectogPasteCornerStyle.capsule,
  Color? backgroundColor,
  Color? foregroundColor,
})
```

A `StatelessWidget` hosting Apple's `UIPasteControl` on iOS 16 and newer; it builds an empty `SizedBox` elsewhere. A tap reads the pasteboard without the system alert and, when it holds a DecTog link, sends a late claim (`paste_control`). Statics: `String viewType` (`'dectog_paste_control'`), `bool get isSupported` (iOS 16 or newer, never on web), and `debugIsSupportedOverride` for tests.

`enum DectogPasteDisplayMode { iconAndLabel, iconOnly, labelOnly }`

`enum DectogPasteCornerStyle { capsule, dynamic, fixed, large, medium, small }`

## Package version

`flutter_dectog` sends `x-dectog-sdk: flutter_dectog/<version>` on every signed call, and also reports its version in the `User-Agent` header (`DectogSDK/<version> (<platform>)`) and in the `flutter_plugin_version` metadata of clicks and installs. The version constants are internal (`lib/src/version.dart`) and match `pubspec.yaml`.
