---
title: Migrate from Firebase Dynamic Links
description: How Firebase Dynamic Links concepts, URL parameters, the REST API and the Flutter plugin map onto AdTo links, apps, adto_* parameters and the install verdict.
sidebar:
  order: 1
---

Google shut down Firebase Dynamic Links on August 25, 2025. This guide maps what you had in Firebase Dynamic Links (FDL) onto AdTo and ends with a migration checklist. It assumes the hosted service: the API at `https://api.adto.app` and links at `https://{username}.adto.app/{slug}`.

Still deciding whether AdTo fits? The [Firebase Dynamic Links alternative](https://adto.app/firebase-dynamic-links-alternative) page compares the two job by job and says when another tool fits better.


## Concepts

| Firebase Dynamic Links | AdTo | Notes |
|---|---|---|
| Firebase project | Account: one username, an account key for servers and SDK keys for apps | The username is the link subdomain. See [Concepts](/start/concepts/). |
| Dynamic link domain (`*.page.link` or your own) | `https://{username}.adto.app`, or a subdomain of your own as a [custom domain](/links/custom-domains/), where the deployment offers it | One subdomain per account, and at most one custom domain. |
| Short dynamic link | Link: `slug` plus stored routing | You choose the slug (`[A-Za-z0-9_-]`, up to 128 characters). Slugs are unique across permanent and temporary links. |
| `suffix.option: UNGUESSABLE` | Temporary link with an automatic slug `t_<10 hex>` | Temporary links expire after `ttlSeconds` (60 seconds to 30 days). See [Temporary links](/links/temporary-links/). |
| Long dynamic link (every parameter in the URL) | No equivalent. Every link is stored. Per-tap overrides go in `adto_*` query parameters. | See [URL parameters](/links/url-parameters/). |
| App registered in Firebase | App on the Apps page | Package, SHA-256 fingerprints, bundle ID, Team ID, store URLs, custom schemes. See [Apps](/dashboard/apps/). |
| Automatic `assetlinks.json` and AASA | Generated from the registered apps and served on `https://{username}.adto.app/.well-known/` | See [Platform setup](/sdk/platform-setup/). |
| Link analytics (`getLinkStats`) | Overview and Links in the dashboard; `click_count` on `GET /api/v1/links`; installs, opens, leads and revenue per link from the MCP `analytics` tool or the raw export | See [Overview](/dashboard/overview/) and [Export raw data](/api/export/). |
| Deferred deep link on first open | Install verdict: `onAppInstalled` with `matched`, `routing`, `deepLink`, `link` and `customParameters` | See [Install attribution](/sdk/install-attribution/). |

## URL parameters

FDL encoded routing in the URL. AdTo stores routing on the link and on the app and reads a small set of `adto_*` overrides at tap time.

| FDL parameter | AdTo | Where it lives |
|---|---|---|
| `link` (the deep link and the web fallback) | Two things. In the app the SDK hands you the `slug`, the link's `metadata` and the `deep_link` route, not a URL. On the web the link's `target` is the last mobile fallback and the "Continue to" destination on the desktop QR page. | Link `target`, `metadata`, `ios_deep_link_path`, `android_deep_link_path` |
| `apn` | `android_package`, plus the SHA-256 fingerprints for App Links | App |
| `afl` (Android fallback) | `adto_redirect_android` on the shared URL, or the link's `redirect_url` for both platforms | URL, link |
| `amv` (minimum Android version) | No equivalent | |
| `ibi` | `ios_bundle_id` and `ios_team_id` (both are needed for Universal Links) | App |
| `ifl` (iOS fallback) | `adto_redirect_ios` on the shared URL, or the link's `redirect_url` | URL, link |
| `ius` (iOS custom scheme) | `ios_app_scheme` | App |
| `ipfl`, `ipbi` (iPad fallback and bundle) | No equivalent. An iPad with a mobile user agent is routed as iOS. iPadOS Safari in desktop mode is routed as desktop. | |
| `isi` (App Store ID) | `ios_store_url`, for example `https://apps.apple.com/app/id<isi>` | App |
| `imv` (minimum iOS version) | No equivalent | |
| `efr` (skip the app preview page) | Nothing to skip. Mobile taps get a plain 302 unless you turn on the mobile interstitial or the iOS tap-to-store page. | App, Advanced |
| `ofl` (other platforms fallback) | The link's `fallback_url`, or `adto_fallback` on the shared URL. Without either, desktop visitors get the branded QR page. | Link, URL |
| `st`, `sd`, `si` (social meta tags) | `og_title`, `og_description`, `og_image_url` on the link; the app's values are the defaults. Titles and descriptions are limited to 150 characters. | Link, app |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Same names. Stored on every click as given. `utm_campaign` and `utm_source` feed the Overview campaign and source charts. | URL |
| `at`, `ct`, `mt`, `pt` (App Store analytics) | AdTo sets `ct=adto_click=<id>` on every App Store redirect itself. The other tags have no equivalent. | |
| `d=1` (debug view) | `GET /api/v1/resolve/{username}/{slug}`, public, no key | API |

Two routing differences to plan for:

- On a phone without the app, the app's `fallback_url` outranks the link's `target`. The order is custom redirect, store URL, app fallback, link target. See [How a tap is routed](/links/how-a-tap-is-routed/).
- Desktop visitors are never redirected to the target automatically. Without a `fallback_url` or `adto_fallback` they get the QR page, which offers "Continue to <host>" as a button.

## The REST API

| FDL REST API | AdTo |
|---|---|
| `POST https://firebasedynamiclinks.googleapis.com/v1/shortLinks` | `POST /api/v1/links` (permanent), `POST /api/v1/links/bulk` (up to 100 at once) or `POST /api/v1/temp-links` (temporary) |
| `dynamicLinkInfo.domainUriPrefix` | Implicit: `https://{username}.adto.app` |
| `dynamicLinkInfo.link` | `target` (web fallback) plus `ios_deep_link_path` and `android_deep_link_path` (in-app route) |
| `androidInfo.androidPackageName`, `iosInfo.iosBundleId`, `iosInfo.iosAppStoreId` | Set once on the app, not per link |
| `androidInfo.androidFallbackLink`, `iosInfo.iosFallbackLink` | `redirect_url` on the link, or `adto_redirect_android` and `adto_redirect_ios` per tap |
| `socialMetaTagInfo` | `og_title`, `og_description`, `og_image_url` |
| `analyticsInfo.googlePlayAnalytics` | The link's own `utm_*` fields (added to its web destinations), or `utm_*` on the URL you share |
| `suffix.option` | Your own `slug`; temporary links get `t_<10 hex>` when you omit it |
| API key in the query string | `Authorization: Bearer adto_…` plus the request signature |
| `GET …/v1/{shortLink}/linkStats` | `GET /api/v1/links` returns `click_count` per link; installs and opens per link come from the MCP [`analytics` tool](/guides/automation-and-agents/#mcp-server) or the [raw export](/api/export/), with the account key |

Every `/api/v1` call except `resolve` is signed with an HMAC of the key it sends. The [Automation and agents](/guides/automation-and-agents/) guide has a verified shell helper; the [API overview](/api/overview/) has the scheme. Field names and validation are on [Links API](/api/links/).

## The Flutter plugin

| `firebase_dynamic_links` | `flutter_adto` |
|---|---|
| `FirebaseDynamicLinks.instance.getInitialLink()` | `adto.getInitialLink()` |
| `FirebaseDynamicLinks.instance.onLink.listen(...)` | `adto.onLinkClick.listen(...)` |
| `PendingDynamicLinkData.link` (a `Uri`) | `AdtoLinkClick`: `slug`, `username`, `linkResolution?.target`, `linkResolution?.deepLinkPath`, `clickParams` |
| `PendingDynamicLinkData.utmParameters` | `click.queryParameters` and `click.queryParameter('utm_source')` on the tapped URL |
| `getDynamicLink(uri)` | `adto.resolveLink(username, slug)` |
| `buildShortLink(DynamicLinkParameters(...))` | `adto.createLink(slug: ..., target: ..., ...)` and `adto.createTempLink(...)` |
| `buildLink(...)` (long link) | No equivalent |
| First open after an install from a link | `adto.onAppInstalled`; `adto.currentAppInstall` and `adto.getAttributionData()` for later reads |

```dart title="Before: firebase_dynamic_links"
final data = await FirebaseDynamicLinks.instance.getInitialLink();
if (data != null) _open(data.link);
FirebaseDynamicLinks.instance.onLink.listen((data) => _open(data.link));
```

```dart title="After: flutter_adto"
import 'package:flutter_adto/flutter_adto.dart';

final adto = FlutterAdto();

Future<void> start() async {
  await adto.initialize(AdtoConfig(
    apiKey: const String.fromEnvironment('ADTO_API_KEY'),
  ));

  adto.onLinkClick.listen(_open);
  final initial = await adto.getInitialLink();
  if (initial != null) _open(initial);

  adto.onAppInstalled.listen((install) {
    final route = install.routing?.deepLink ?? install.deepLink;
    if (route != null) _openRoute(route);         // medium confidence or better
    if (install.matched) _creditInstall(install); // guaranteed or high only
  });
}

void _open(AdtoLinkClick click) {
  if (click.error != null) return;
  _openRoute(click.linkResolution?.deepLinkPath ?? click.slug);
}
```

The SDK resolves the link, logs the in-app click and the app open itself. The link that launched the app is delivered once per process, so you do not need the duplicate handling FDL integrations often carried. See [Initialize and handle links](/sdk/initialize-and-handle-links/).

## Deferred deep links

FDL matched a first open to a link with the Play Install Referrer on Android and, on iOS, with a link copied to the pasteboard by its app preview page.

AdTo's order is similar but broader:

1. Android: the store redirect carries `referrer=adto_click=<id>&adto_l=<username>/<slug>`. The SDK reads the Play Install Referrer (and the Huawei, Samsung, Xiaomi and vivo store referrers) on first launch, retries transient errors, and sends a referrer that arrives later as a late claim.
2. iOS: the SDK reads the pasteboard on first launch by default. The iOS tap-to-store page (Apps, Advanced) copies the link before opening the App Store. `AdtoPasteButton` covers users who declined the iOS 16 paste alert.
3. Otherwise a server-side fingerprint over recent mobile web clicks assigns a confidence. `high` is credited (`matched: true`), `medium` only returns a `routing` candidate, `low` returns nothing.

The link's `metadata` comes back as `customParameters`, the `adto_deeplink` of the tapped URL as `deepLink`. See [How attribution works](/start/how-attribution-works/) and [Deterministic attribution](/sdk/deterministic-attribution/).

## Analytics

| FDL event | AdTo |
|---|---|
| `CLICK` | Clicks on the Overview and per link. Bots and link unfurlers never count. A desktop visitor who lands on the QR page counts. |
| `REDIRECT` | Not counted separately |
| `APP_INSTALL` | Not observable; AdTo counts the SDK's first launch as the install |
| `APP_FIRST_OPEN` | Installs, split into attributed and organic. Reinstalls are excluded from the KPI. |
| `APP_RE_OPEN` | Opens: an AdTo link opened the installed app |

Per-link numbers on the Links page are lifetime totals. See [Links](/dashboard/links/).

## What has no equivalent

- Minimum app version gating (`amv`, `imv`).
- iPad-specific fallback and bundle (`ipfl`, `ipbi`).
- Long dynamic links built in the app (`buildLink`).
- More than one link domain of your own per account, and any where the deployment does not offer [custom domains](/links/custom-domains/).
- Firebase Analytics integration and the Firebase console link list.
- App Store analytics tags other than the `ct` AdTo sets itself.

## Importing an FDL export

**Import CSV** on the Links page reads a CSV in the browser, shows the first rows with notes, and creates the links 100 at a time through `POST /api/admin/links/bulk`; a row that fails (most often a slug that exists already) is listed with its line number and the others are still created. The **Firebase Dynamic Links export** preset reads these columns, matched case-insensitively with spaces or hyphens as underscores:

| Column | Becomes |
|---|---|
| `short link` (also `shortlink`, `short dynamic link`) | the slug: the URL's last path segment, `abc` for `https://acme.page.link/abc` |
| `link` (also `deep link`) | `target`, and its path and query (without the leading `/`) as the iOS and Android deep-link path |
| `ofl` | `fallback_url`, the desktop destination |
| `afl`, `ifl` | `redirect_url`, where mobile visitors without the app go. When both are set and differ, `afl` is kept and the row says so; give iOS its own with a [geo or language rule](/links/how-a-tap-is-routed/#geo-and-language-routing) or a second link. |
| `st`, `sd`, `si` | `og_title`, `og_description` (150 characters each), `og_image_url` |
| `name` (also `link name`) | `label` |
| `utm_source` … `utm_content` | the link's UTM values |
| `apn`, `ibi` | not imported: the link uses your app from the Apps page |

The **AdTo columns** preset takes headers named like the [create fields](/api/links/#create-a-link) instead (`slug`, `target`, `campaign`, `external_id`, `template_id` and so on). If your app reads the whole FDL `link` URL rather than a path, set the deep-link paths yourself after the import, or keep the URL in `metadata`.

## Migration checklist

1. Sign up at `https://dashboard.adto.app/login?tab=signup`. The username becomes your link subdomain; the SDK key and the account key are shown on the "Account created" screen. Settings lists the SDK key again; the account key is shown only that once, and **Regenerate** in Settings replaces it. See [Quickstart](/start/quickstart/).
2. Register the app on the Apps page: package and SHA-256 fingerprints (include the Play App Signing key), bundle ID and Team ID, both store URLs, your custom scheme. Use the Verify buttons.
3. Add `applinks:{username}.adto.app` to Associated Domains and an `autoVerify` intent filter for `{username}.adto.app`. Reinstall the app. See [Platform setup](/sdk/platform-setup/).
4. Replace `firebase_dynamic_links` with `flutter_adto` using the table above. Inject the SDK key (`adto_pub_…`) at build time with `--dart-define`.
5. Recreate your links. If you exported them before the shutdown (Firebase's export came from [Google Takeout](https://firebase.google.com/support/guides/export-dynamic-links), one CSV per domain), the quickest way is to import that file: on the Links page, **Import CSV**, choose **Firebase Dynamic Links export** and pick it (see [Importing an FDL export](#importing-an-fdl-export)). From a script, send up to 100 links per call to `POST /api/v1/links/bulk`. Either way the old suffixes become the slugs, the former `link` destination the `target`, and its path the in-app route.
6. Replace the old `page.link` URLs wherever they are published: those domains belong to Google and cannot be pointed at AdTo. A subdomain of your own that served FDL links, such as `links.yourbrand.com`, can move to AdTo as a [custom domain](/links/custom-domains/), where the deployment offers it.
7. Test on a physical device: tap a link, install from the store, open the app, and check Overview and `onAppInstalled`. See [Testing](/sdk/testing/).
8. Update your privacy declarations for the device data the SDK collects by default. See [Device data and privacy](/sdk/device-data-and-privacy/).
