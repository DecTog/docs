---
title: API reference
description: Every export, method, option and type of react-native-dectog, the React Native and Expo SDK.
sidebar:
  order: 10
---

<!-- Generated from react-native-dectog/doc/api-reference.md by npm run sync:sdk-reference. Edit it there. -->

Everything below is exported by `react-native-dectog`. The default export is `Dectog`, the SDK's single instance (a `DectogSdk`). Methods throw `DectogError` on failure; a method called before `initialize` throws a `configuration` error. Times are `Date` objects, absent values `null`.

## DectogConfig

```ts
type DectogConfig = {
  apiKey: string;
  baseUrl?: string;
  linkRootDomain?: string;
  linkDomains?: string[];
  enableDebugLogging?: boolean;
  installReferrerProvider?: () => Promise<string | null>;
  installReferrerTimeoutMs?: number;
  collect?: DectogCollection[];
  advertisingIdProvider?: () => Promise<DectogAdvertisingId | null>;
  fbAppId?: string;
  persistDeviceId?: boolean;
  enabled?: boolean;
  environment?: DectogEnvironment;
};
```

| Member | Default | Meaning |
|---|---|---|
| `apiKey` | required | An SDK key (`dtg_pub_…`, dashboard Settings → SDK keys). Never ship the account key (`dtg_…`): it can delete links. |
| `baseUrl` | `https://app.dectog.com` | A self-hosted server, e.g. `https://links.example.com`. |
| `linkRootDomain` | `dectog.com` without `baseUrl`, else the `baseUrl` host | The root tenant link hosts hang off: `{username}.<root>/{slug}`. |
| `linkDomains` | `[]` | The account's custom link domains (`go.yourbrand.com`). The SDK also learns the active one from the server. |
| `enableDebugLogging` | `false` | Log what the SDK does with `console.log`. |
| `installReferrerProvider` | none | Android: a custom source for the Play install referrer instead of the SDK's native readers. |
| `installReferrerTimeoutMs` | `5000` | Android: how long the first-launch registration waits for the store referrer; a later answer is sent as a late claim. |
| `collect` | dashboard settings | What this build collects (see `DectogCollection`). A set is exact: what it leaves out is never collected. |
| `advertisingIdProvider` | none | Reads the IDFA (after ATT) or the GAID for an app that wants it on the install; the SDK itself never reads it. |
| `fbAppId` | the dashboard's | Facebook App ID for Meta's on-device install referrer (Android). |
| `persistDeviceId` | `true` | iOS: keep the IDFV in the Keychain so a reinstall keeps its device id. |
| `enabled` | `true` | Whether collection is on before the app calls `setEnabled`. `false` waits for consent (see `setEnabled`). |
| `environment` | none | `'live'` or `'test'`: the environment this build's key should belong to; `diagnostics()` warns about the other. |

`type DectogCollection = 'deviceTier' | 'pasteboard' | 'oemReferrers' | 'appleSearchAdsToken' | 'adId'`

| Value | What it sends | Apple privacy | Google Play Data safety |
|---|---|---|---|
| `deviceTier` | Device id (IDFV / `ANDROID_ID`), model, manufacturer, CPU, OS build, screen, connectivity, carrier; the device ping | Device ID (analytics, linked); Product Interaction | Device or other IDs; App activity |
| `pasteboard` | A copied DecTog link that names a click, read once at first launch | None (no required-reason API); iOS 16+ shows the paste alert | None; Android 12+ shows the clipboard notice |
| `oemReferrers` | The Huawei, Samsung, Xiaomi and vivo store referrers (Android) | Not applicable | None of its own |
| `appleSearchAdsToken` | The AdServices attribution token (iOS 14.3+); no IDFA, no prompt | Advertising Data | Not applicable |
| `adId` | The id from `advertisingIdProvider` | Device ID used for tracking; the ATT prompt | Advertising ID; the `AD_ID` permission |

Without `collect`: the device tier on, the pasteboard and OEM referrers as set on the dashboard's Apps page (else the pasteboard on iOS only, OEM referrers on), no Apple Search Ads token, the advertising id only with a provider.

`type DectogAdvertisingId = { id: string | null; limited?: boolean }`: a limited id is never sent; the install carries `ad_tracking_limited: true` instead.

## Lifecycle

| Member | Signature | Notes |
|---|---|---|
| `initialize` | `initialize(config: DectogConfig): Promise<void>` | Reads the SDK's state, registers the install on the first launch (once per install, retried on later launches), reports the link that opened the app and starts listening for links. A second call rejects; a failed call can be retried. |
| `dispose` | `dispose(): Promise<void>` | Stops listening and flushes once; queued events stay on disk. |
| `diagnostics` | `diagnostics(): Promise<DectogDiagnostics>` | Compares this build with the dashboard's record: bundle ID or package, the iOS URL scheme in `CFBundleURLTypes`, Android App Links verification of each link host, the key's environment. Never blocks the SDK. |

## Links that open the app

| Member | Signature | Notes |
|---|---|---|
| `onLinkClick` | `onLinkClick(listener: (click: DectogLinkClick) => void): DectogSubscription` | Every DecTog link that opens the app; the cold-start link once per process. Subscribe before `initialize` to receive the cold-start link. |
| `getInitialLink` | `getInitialLink(): Promise<DectogLinkClick \| null>` | The cold-start link, processed once per process; null after a relaunch from the Android recents screen. |
| `handleUrl` | `handleUrl(url: string): Promise<DectogLinkClick \| null>` | A DecTog link tapped inside the app (a chat message, a push): reported as an open, not a click, and emitted once. Null when the URL is not a DecTog link or is an auth callback. |
| `onAppInstalled` | `onAppInstalled(listener: (verdict: DectogAppInstallResponse) => void): DectogSubscription` | The install verdict on the first launch, again when a late signal upgrades it. A late subscriber gets the current verdict at once. |
| `currentAppInstall` | `readonly currentAppInstall: DectogAppInstallResponse \| null` | The verdict this process received. |
| `getAttributionData` | `getAttributionData(): Promise<DectogAppInstallResponse \| null>` | The verdict this process received, else pulled from the server by device id (device tier) or install id. Null when the server knows no install for this device. |
| `willShowPasteboardPrompt` | `willShowPasteboardPrompt(options?: { collect?: DectogCollection[] }): Promise<boolean>` | Whether this launch's pasteboard read would show the iOS 16+ paste alert, so the app can explain it first. Callable before `initialize`. Always false on Android. |

`type DectogSubscription = { remove(): void }`

Link URLs the SDK recognises: `https://{username}.{root}/{slug}`, `{baseHost}/r/{username}/{slug}`, a custom link domain `https://{domain}/{slug}`, any custom-scheme URL carrying `dtg_l={username}/{slug}` (the host and path are then the app's own route), and, for development, `dectog://{username}/{slug}` and `https://localhost:3000?user={username}/{slug}`. OAuth and social-login callbacks (`fb<id>://`, `com.googleusercontent.apps.…`, anything carrying `access_token` or `id_token`) are never reported or emitted.

## Link management

| Member | Signature | Notes |
|---|---|---|
| `createLink` | `createLink(input: { slug: string; appId?: string } & DectogLinkFields): Promise<DectogLink>` | Needs an SDK key with links:write. |
| `updateLink` | `updateLink(slug: string, fields: DectogLinkFields): Promise<DectogLink>` | An omitted field keeps its value; `''` clears it. |
| `getLinks` | `getLinks(options?: { limit?: number; cursor?: string }): Promise<DectogLinkPage>` | One page, newest first. |
| `getLink` | `getLink(slug: string): Promise<DectogLink>` | |
| `deleteLink` | `deleteLink(slug: string, options?: { permanently?: boolean }): Promise<void>` | The link's history stays unless `permanently`. |
| `createTempLink` | `createTempLink(input?: { target?: string; slug?: string; ttlSeconds?: number; ogTitle?: string; ogDescription?: string; ogImageUrl?: string }): Promise<DectogTempLink>` | `ttlSeconds` defaults to 900. |
| `updateTempLink` | `updateTempLink(slug: string, fields: { target?: string; ogTitle?: string; ogDescription?: string; ogImageUrl?: string }): Promise<DectogTempLink>` | |
| `getTempLink` | `getTempLink(slug: string): Promise<DectogTempLink>` | |
| `deleteTempLink` | `deleteTempLink(slug: string, options?: { permanently?: boolean }): Promise<void>` | |
| `resolveLink` | `resolveLink(username: string, slug: string): Promise<DectogLinkResolution>` | Public, unsigned. A paused or expired link rejects with `link_paused` / `link_expired`. |
| `createReferralLink` | `createReferralLink(input: { customerId: string; campaign?: string }): Promise<DectogLink>` | The customer's referral link, created on first use. |

`DectogLinkFields`: `target`, `metadata`, `iosDeepLinkPath`, `androidDeepLinkPath`, `redirectUrl`, `fallbackUrl`, `ogTitle`, `ogDescription`, `ogImageUrl`, `label`, `campaign`, `adgroup`, `creative` (all optional).

## Events

| Member | Signature | Notes |
|---|---|---|
| `identify` | `identify(input: { customerId: string; name?: string; email?: string; phone?: string }): Promise<void>` | Names the user; later events carry the id until `logout()`. The first identify of a new user on a fresh install is their signup lead. An identify with the same fields as the last one is skipped. |
| `trackConversion` | `trackConversion(conversion: DectogConversion): Promise<void>` | A purchase, renewal, refund or cancel. With `transactionId` and `store`, one purchase reported twice counts once; a refund subtracts, a cancel counts nothing. |
| `trackEvent` | `trackEvent(eventName: string, data?: object): Promise<void>` | A custom event; `data` becomes its metadata. |
| `trackScreenView` | `trackScreenView(name: string, params?: Record<string, unknown>): Promise<void>` | A screen the app showed, outside every event total; the dashboard lists the screens people reached after a link opened the app, and each customer's and install's app sessions with their screens. The name is cut to 200 characters (an empty one sends nothing); `params` keeps strings (cut to 256), finite numbers and booleans. Carries the previous screen reported. |
| `trackNavigation` | `trackNavigation(ref: NavigationRefLike \| null \| undefined, options?: ScreenTrackingOptions): DectogSubscription` | Reports every screen a React Navigation or Expo Router container shows: after 350 ms on top (`debounceMs`), once per screen in a row, by route name (`nameOf`), with only the params `captureParams` names. |
| `flush` | `flush(): Promise<void>` | Sends up to 100 queued events now (otherwise at 20 events or every 30 s). |
| `logout` | `logout(): Promise<void>` | Flushes, then forgets the customer id. |
| `setEnabled` | `setEnabled(enabled: boolean): Promise<void>` | Collection consent, persisted; until the app first calls it, `DectogConfig.enabled` decides. `false`: no request of the SDK's own and no pasteboard read; events wait on the device (up to seven days), a link's click and open wait in memory, links still reach `onLinkClick` without `linkResolution`. `true`: the held events, the install registration if it never ran, and the held link reports go out. A `false` in between drops the held link reports, not the events. The app's own calls (`createLink`, `resolveLink`, …) are not affected. |
| `isEnabled` | `isEnabled(): Promise<boolean>` | The stored choice, else `DectogConfig.enabled`. |

`DectogConversion`: `revenue` (required, ≥ 0), `currency`, `eventName` (default the transaction type), `productId`, `transactionId`, `originalTransactionId` (a renewal or refund names its first purchase), `store` (`'app_store' | 'play'`), `purchaseType` (`'one_time' | 'subscription'`), `quantity`, `appStoreJws` (iOS: a StoreKit 2 `jwsRepresentation`; the server verifies it and takes the transaction id, price and currency from it), `transactionType` (`'purchase' | 'refund' | 'cancel'`, default `'purchase'`), `metadata`.

`NavigationRefLike` is structural: `addListener('state', callback)`, `getCurrentRoute()` and optionally `isReady()`, as React Navigation's and Expo Router's container refs have. The SDK depends on neither library. `ScreenTrackingOptions`: `debounceMs` (350), `captureParams` (none), `nameOf` (`route.name`; null skips the route).

The SDK queues events durably (at most 1000, batches of 100, an event over 32 KB dropped) and sends each once at least; every event carries a `client_event_id`, so a resent batch is stored once. Events also carry the customer id, the device clock, this process's session and the link that last opened the app.

## Link models

`DectogLink`: `id`, `slug`, `target` (null when the link follows its app's fallback URL), `url`, `appId`, `clickCount`, `createdAt`, `updatedAt`, `metadata`, `ogTitle`, `ogDescription`, `ogImageUrl`, `iosDeepLinkPath`, `androidDeepLinkPath`, `redirectUrl`, `fallbackUrl`, `label`, `campaign`, `adgroup`, `creative`, `referrerCustomerId`, `iosTapToStore`, `mobileInterstitial`, `appendClickId` (null follows the app's setting), `routingRules` (`DectogRoutingRule[]`: `name`, `countries`, `languages`, `percent`, `startsAt`, `endsAt`, `target`, `redirectUrl`, `fallbackUrl`, `iosDeepLinkPath`, `androidDeepLinkPath`), `templateId`, `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `externalId`, `expiresAt`, `expiredUrl`, `disabledAt`, `disabledReason`, `archivedAt`, `deletedAt`.

`DectogLinkPage`: `links`, `nextCursor` (pass to `getLinks({ cursor })`; null on the last page), `hasMore`.

`DectogTempLink`: `id`, `slug`, `target`, `url`, `expiresAt`, `createdAt`, `ttlSeconds`, `ogTitle`, `ogDescription`, `ogImageUrl`, `expiredUrl`, `disabledAt`, `disabledReason`, `archivedAt`, `deletedAt`.

`DectogLinkResolution`: `id`, `slug`, `target`, `url`, `type` (`'permanent' | 'temporary'`), `createdAt`, `clickCount`, `expiresAt`, `ttlSeconds`, `metadata`, `iosDeepLinkPath`, `androidDeepLinkPath`.

`DectogLinkClick`:

| Field | Type | Meaning |
|---|---|---|
| `originalUrl` | `string` | The URL that opened the app (`'unknown'` when the platform reported an error). |
| `slug`, `username` | `string` | The link; `'unknown'` when the URL is not a DecTog link. |
| `receivedAt` | `Date` | When it reached the SDK. |
| `error` | `DectogError \| null` | Why it could not be processed. |
| `linkResolution` | `DectogLinkResolution \| null` | The link as the server describes it, when it resolved. |
| `inApp` | `boolean` | Passed to `handleUrl`. |
| `clickParams` | `DectogClickParams \| null` | The `dec_*` values of `originalUrl`. |
| `queryParameters` | `Record<string, string>` | Every query parameter of `originalUrl`, for the app's own keys. Only `dec_*` values survive a deferred install. |

`DectogClickParams`: `deepLink` (`dec_deeplink`: the in-app route; on a warm open the raw value), `label`, `campaign`, `adgroup`, `creative`, `tracker`.

`isResolved(click)`: whether the click resolved with no error.

## Install models

`DectogAppInstallResponse`:

| Field | Type | Meaning |
|---|---|---|
| `matched` | `boolean` | A DecTog link is credited with the install. |
| `type` | `string` | `'non-organic'` or `'organic'`. |
| `matchSource` | `string \| null` | `referrer`, `clipboard`, `meta_referrer`, `apple_search_ads`, `fingerprint`, … |
| `matchConfidence` | `string \| null` | `guaranteed`, `high`, `medium` or `low`. |
| `referrerSource` | `string \| null` | The store whose referrer matched. |
| `username`, `slug` | `string \| null` | The credited link. |
| `installId` | `string \| null` | The install's id. |
| `clickedAt` | `Date \| null` | When the credited link was tapped. |
| `link` | `DectogAppInstallLink \| null` | `slug`, `target`, `url`, `createdAt`, `metadata` of a credited permanent link. |
| `customParameters` | `object \| null` | The permanent link's metadata. |
| `clickParams` | `DectogClickParams \| null` | The credited click's `dec_*` values. |
| `deepLink` | `string \| null` | The route to open. |
| `routing` | `DectogDeferredRoute \| null` | A medium-confidence candidate to route to without credit: `username`, `slug`, `deepLink`, `clickParams`, `confidence`, `clickedAt`. |
| `fraudFlags` | `string[]` | Fraud rules the install tripped. |
| `installState` | `string \| null` | `install`, `reinstall` or `update`. |
| `isReinstall` | `boolean` | |
| `replayed` | `boolean` | The server returned the stored verdict of a retried registration. |
| `claim`, `claimReason` | `string \| null` | A late claim's outcome (`upgraded`, …). |
| `appleSearchAds` | `DectogAppleSearchAds \| null` | `status` (`pending` until Apple answers), `attribution`, `campaignId`, `adGroupId`, `keywordId`, … |
| `lastOpen` | `DectogAppOpen \| null` | The link that last re-opened the app: `username`, `slug`, `clickId`, `openedAt`. |

## App settings

`DectogSdkConfig` (the dashboard's settings, as `diagnostics()` returns them): `appId`, `fbAppId`, `oemStoreReferrers`, `readClipboardOnInstall`, `iosTapToStore`, `iosAppScheme`, `androidAppScheme`, `iosBundleId`, `androidPackage`, `linkHosts`, `username`, `environment`, `cacheSeconds`.

`DectogDiagnostics`: `serverConfig` (null when the server could not be reached), `warnings` (`string[]`), `ok`.

`type DectogEnvironment = 'live' | 'test'`

## Errors

`class DectogError extends Error`: `message`, `type` (`'api' | 'network' | 'configuration' | 'linkResolution' | 'unknown'`), `statusCode`, `code` (the server's stable reason, e.g. `invalid_request`, `conflict`, `rate_limited`), `requestId` (quote it when reporting a problem), `details` (every field of the server's error object, plus `retry_after_ms` when the server asked for a back-off).

## Components

`DectogPasteButton`: Apple's `UIPasteControl` (iOS 16+). A tap reads the pasteboard without the system "Allow paste" alert (the tap is the consent); when it holds a DecTog link that names a click, the SDK sends it as a late claim and an upgraded verdict arrives on `onAppInstalled`. Renders nothing on Android, the web and iOS 15.

```ts
type DectogPasteButtonProps = {
  style?: StyleProp<ViewStyle>; // default 200 × 44
  displayMode?: 'iconAndLabel' | 'iconOnly' | 'labelOnly';
  cornerStyle?: 'capsule' | 'dynamic' | 'fixed' | 'large' | 'medium' | 'small';
  backgroundColor?: string;
  foregroundColor?: string;
  onPaste?: (url: string) => void;
};
```

## Package version

`SDK_VERSION` is the package version. Every signed call sends `x-dectog-sdk: react-native-dectog/<version>`, which the server stores on installs, events and clicks.
