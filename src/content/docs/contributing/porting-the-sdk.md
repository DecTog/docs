---
title: Porting the SDK to React Native
description: The draft guide for recreating the Flutter SDK as a React Native or Expo library, with the list of behaviors a port must add today because the draft predates them.
sidebar:
  order: 2
---

:::caution[This is a draft, and it is behind the Flutter SDK]
This guide was written before the Flutter SDK gained its native install-referrer readers, the pasteboard button, request signing, late claims and Apple Search Ads support. It is published as a starting point, not as a specification. Where the draft and the current server contract disagree, the server wins: check every request against [API overview](/api/overview/), [Clicks and installs](/api/clicks-and-installs/) and [Events and attribution](/api/events-and-attribution/) before you ship.
:::

## What a port must also cover today

The draft below describes a pure-TypeScript library. A port that wants parity with `flutter_dectog` 1.0 also needs these, most of which require native code:

- **Request signing.** Every authenticated `/api/v1` call carries `x-dectog-timestamp` and `x-dectog-signature: v1=<hex>`, where the hex is `HMAC-SHA256(apiKey, "<ts>.<sha256hex(rawBody)>")` and `GET` signs the empty string. Unsigned requests get 401 `SDK request signature required (upgrade flutter_dectog)`. The draft's HTTP client has no signature and will not work as written.
- **The install contract, version 2.** One registration per install with a persisted `install_attempt_id` (the server replays the stored verdict for a retried attempt), an `install_state` of `install`, `reinstall` or `update` classified on the device, and state kept in a backup-excluded directory (`noBackupFilesDir` on Android, `NSURLIsExcludedFromBackupKey` on iOS) validated against the package's first-install time. The Flutter SDK's sentinel is `.dectog_install.json`, not the `.dectog_install_tracked` file the draft uses.
- **Retries.** Two in-process attempts with jittered backoff; `Retry-After` honored up to 10 seconds, longer waits deferred to the next launch; 401 and other 4xx not retried in-process.
- **Install referrer readers.** Google Play through the Install Referrer client with up to three connection attempts, 3 seconds apart, on transient errors, plus the Huawei AppGallery, Galaxy Store, Xiaomi GetApps and vivo readers, and Meta's on-device referrer when the app passes its Facebook App ID to the SDK (`fbAppId` in `DectogConfig`; the field on the Apps page alone does not enable it). Both the device-clock and the store's server-side timestamps are sent. The first-launch registration waits a bounded time (5 seconds in Flutter), and a referrer that arrives later is sent as a **late claim** to `POST /api/v1/app-installs/{id}/claim`; the verdict stream emits again when the claim upgrades it.
- **The iOS pasteboard.** A silent `hasURLs` check on first launch, a read only when a URL is present, domain validation so that only a DecTog link is ever sent (`clipboard_url`), clearing after use, a `willShowPasteboardPrompt()` helper for the iOS 16 paste alert, and a `UIPasteControl` button whose paste is sent as a claim with `claim_source: "paste_control"`.
- **Apple Search Ads.** Optionally read the AdServices attribution token and send it as `asa_token` with the install or a later claim; surface `apple_search_ads` from the verdict (`pending` until Apple answers).
- **Verdict fields.** `match_confidence`, `routing` (the medium-confidence candidate), `deep_link`, `click_params` (the tapped URL's `dec_*` values), `install_state`, `is_reinstall`, `replayed`, `claim`, `claim_reason`, `apple_search_ads`, `last_open`.
- **The device tier**, on by default and switchable for consent flows: vendor-scoped device ID (IDFV persisted in the Keychain, `ANDROID_ID`), model, manufacturer, CPU, OS build, screen metrics, connectivity, carrier MCC/MNC. See [Device data and privacy](/sdk/device-data-and-privacy/).
- **Opens and pings.** `POST /api/v1/app-opens` when a link opens the installed app, `POST /api/v1/device-ping` on initialization, `GET /api/v1/attribution` by `device_id` or by `install_id`.
- **Link handling details.** Four URL forms (`https://{username}.{root}/{slug}`, `{base}/r/{username}/{slug}`, `?user={username}/{slug}`, and any custom scheme carrying `dtg_l={username}/{slug}`), the cold-start link consumed once per process, launches from the Android recents screen ignored, OAuth and social-login callback URLs never logged or emitted, and `dec_*` click parameters parsed from the tapped URL.
- **Events.** The queue semantics in section 9b, plus the server limits: at most 100 events per batch (413 above that) and one invalid event rejects the whole batch.

The Flutter sources are the reference for each item: `lib/src/dectog_impl.dart`, `lib/src/services/`, `android/src/main/kotlin/app/dectog/flutter_dectog/InstallReferrers.kt` and `ios/flutter_dectog/Sources/`. See [Contributing](/contributing/) for the layout.

## The draft

What follows is the original port guide, lightly edited for this site. It explains how to recreate the Flutter plugin as a TypeScript library for React Native (bare or Expo).

### Target experience

- A `DecTog` singleton that developers initialize once with their API key.
- Methods for link CRUD, temporary links, link resolution and deletion.
- Event streams for link clicks and deferred install attribution.
- Automatic deep-link ingestion through `Linking`.
- Automatic click logging and one-time install tracking with device and app metadata.

### High-level architecture

| Concern | React Native component |
|---|---|
| Configuration and lifecycle | `DecTog.ts` singleton exposing `initialize`, `dispose`, `createLink`, and so on |
| HTTP layer | Fetch-based client with DecTog-specific serializers and error helpers |
| Data models | TypeScript interfaces mirroring the backend responses (links, clicks, install payloads) |
| Deep-link handling | Wrapper around `Linking` or `expo-linking` plus a parser that extracts username and slug |
| Events | A small event bus (`mitt`, Node `EventEmitter` or an RxJS Subject) for link clicks and install events |
| Device info | `expo-device`, `expo-application`, `react-native-device-info` or similar |
| Install sentinel | `expo-file-system` or `AsyncStorage` to make sure install tracking fires once |

:::note
The draft's goal of "no custom native modules" no longer holds. The install referrer readers, the pasteboard read, the paste control, the Keychain-persisted device ID and the carrier fields all need native code.
:::

### 1. Scaffold the package

```bash
npx create-react-native-library react-native-dectog --namespace dectog
# or start from an Expo library template when targeting managed apps
```

Inside the new library:

- Enable TypeScript (`tsconfig.json`, `.ts` extensions).
- Add dependencies:

  ```bash
  yarn add cross-fetch mitt
  expo install expo-linking expo-device expo-application expo-file-system expo-localization
  yarn add -D jest @testing-library/react-native @types/node
  ```

  Replace the Expo packages with bare equivalents such as `react-native-device-info` outside the Expo ecosystem.

### 2. Define config and error types

Create `src/config.ts`:

```typescript
export interface DectogConfig {
  apiKey: string;
  baseUrl?: string;
  linkRootDomain?: string;
  enableDebugLogging?: boolean;
}

// Hosted DecTog: the API lives on app.dectog.com, links on {username}.dectog.com.
export const DEFAULT_BASE_URL = 'https://app.dectog.com';
export const DEFAULT_LINK_ROOT_DOMAIN = 'dectog.com';

export class DectogError extends Error {
  constructor(
    message: string,
    readonly type: 'api' | 'network' | 'config' | 'link',
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
```

:::note
The original draft set `DEFAULT_BASE_URL` to `https://dectog.com`. The API base is `https://app.dectog.com`; the apex host only redirects. `linkRootDomain` was added to match `DectogConfig` in Flutter, where it defaults to `dectog.com` when `baseUrl` is unset and to the `baseUrl` host otherwise.
:::

Add a guard (`src/utils/assertInitialized.ts`) that throws `DectogError` when methods run before `initialize`.

### 3. Mirror the backend models

Create `src/models/index.ts` with interfaces:

- `DectogLink` (`slug`, `target`, `url`, `clickCount`, `createdAt`, `updatedAt?`, `metadata?`, plus the routing, social and tracking fields).
- `DectogTempLink` (`slug`, `target`, `url`, `expiresAt`, `createdAt`, `ttlSeconds?`).
- `DectogLinkResolution` (`id`, `slug`, `target`, `url`, `type`, `createdAt`, `clickCount?`, `expiresAt?`, `ttlSeconds?`, `metadata?`, the deep-link paths). A paused or expired link answers 410 (`link_paused`, `link_expired`), which surfaces as a `DectogError`.
- `DectogLinkClick` (`originalUrl`, `slug`, `username`, `receivedAt`, `error?`, `linkResolution?`).
- `DectogAppInstallRequest` and `DectogAppInstallResponse`.

Export helpers that convert API JSON to these interfaces (`serializers.ts`). Keep dates as ISO strings to avoid time-zone surprises. The exact JSON shapes are on [Links API](/api/links/) and [Clicks and installs](/api/clicks-and-installs/).

### 4. Build the HTTP client

Create `src/api/client.ts`:

```typescript
import fetch from 'cross-fetch';
import { DEFAULT_BASE_URL, DectogConfig, DectogError } from '../config';

export class DectogHttpClient {
  constructor(private config: DectogConfig) {}

  private url(path: string) {
    return `${this.config.baseUrl ?? DEFAULT_BASE_URL}${path}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        // TODO: add x-dectog-timestamp and x-dectog-signature (see above).
        ...(init?.headers ?? {}),
      },
    });

    const body = await res.text();
    const json = body ? JSON.parse(body) : undefined;
    if (!res.ok) {
      // Error envelope: {"error": {"code", "message", "request_id", ...}}
      throw new DectogError(json?.error?.message ?? 'DecTog API error', 'api', res.status, json?.error);
    }
    return json as T;
  }

  // expose createLink, createTempLink, getLinks, getLink, getTempLink,
  // resolveLink, updateLink, deleteLink, deleteTempLink, logClick, logAppInstall
}
```

Each method mirrors the REST endpoints the Flutter SDK uses: `/api/v1/links`, `/api/v1/temp-links`, `/api/v1/resolve/:username/:slug`, `/api/v1/clicks`, `/api/v1/app-installs`.

:::caution
Build the body string first, sign it, then send exactly that string. A body re-serialized after signing fails with `Invalid SDK request signature`. `DELETE` returns 200 with `{"success": true}`, not 204.
:::

### 5. Event bus

In `src/utils/EventBus.ts`, wrap `mitt`:

```typescript
type Events = {
  linkClick: DectogLinkClick;
  appInstall: DectogAppInstallResponse;
};

const bus = mitt<Events>();

export const onLinkClick = (fn: (c: DectogLinkClick) => void) => bus.on('linkClick', fn);
export const emitLinkClick = (payload: DectogLinkClick) => bus.emit('linkClick', payload);
export const onAppInstall = (fn: (a: DectogAppInstallResponse) => void) => bus.on('appInstall', fn);
export const emitAppInstall = (payload: DectogAppInstallResponse) => bus.emit('appInstall', payload);
```

Store the latest install response in memory so late subscribers can read `getCurrentAppInstall()`. Expect more than one `appInstall` emission per install: a late claim re-emits the upgraded verdict.

### 6. Deep-link listener

Create `src/deepLinks/LinkListener.ts`:

```typescript
import * as Linking from 'expo-linking';
import { AppState, AppStateStatus } from 'react-native';

type Handler = (url: string) => Promise<void>;

export class LinkListener {
  private subscription?: { remove(): void };
  private appStateListener?: (state: AppStateStatus) => void;

  constructor(private handler: Handler) {}

  async start() {
    this.subscription = Linking.addEventListener('url', (event) => this.handler(event.url));
    const initial = await Linking.getInitialURL();
    if (initial) await this.handler(initial);
    this.appStateListener = (state) => {
      if (state === 'active') {
        Linking.getInitialURL().then((url) => url && this.handler(url));
      }
    };
    AppState.addEventListener('change', this.appStateListener);
  }

  stop() {
    this.subscription?.remove();
    if (this.appStateListener) {
      AppState.removeEventListener('change', this.appStateListener);
    }
  }
}
```

Pair it with a `parser.ts` that extracts `{ username, slug }`. If parsing fails, emit a `DectogLinkClick` with an embedded error so apps can log or ignore it.

```typescript
export const parseDectogUrl = (url: string) => {
  const uri = new URL(url);
  const hostParts = uri.host.split('.');

  // Production: username.dectog.com/slug
  if (hostParts.length >= 3 && hostParts.slice(1).join('.') === 'dectog.com') {
    const slug = uri.pathname.replace(/^\//, '').split('/')[0];
    if (slug) return { username: hostParts[0], slug };
  }

  // Dev: https://localhost:3000?user=username/slug
  const userParam = uri.searchParams.get('user');
  if (uri.host.startsWith('localhost') && userParam?.includes('/')) {
    const [username, slug] = userParam.split('/');
    if (username && slug) return { username, slug };
  }

  return null;
};
```

:::note
The Flutter SDK accepts four forms: `https://{username}.{linkRootDomain}/{slug}`, `{baseHost}/r/{username}/{slug}` (path mode), `?user={username}/{slug}` on any host, and any custom-scheme URL whose query carries `dtg_l={username}/{slug}` (the host and path are then the app's own route). The untagged `dectog://{username}/{slug}` is accepted as a development convenience; no other untagged scheme URL is a DecTog link. It also drops the cold-start URL after the first delivery, ignores launches from the Android recents screen, and never logs or emits OAuth callback URLs (schemes like `fb<id>`, `com.googleusercontent.apps.<id>-…`, anything carrying `access_token` or `id_token`).
:::

### 7. Link resolution and click logging

In the main singleton (`DecTog.ts`):

1. When a link event arrives, parse username and slug.
2. Call `httpClient.resolveLink(username, slug)` to enrich the click.
3. Emit the `DectogLinkClick` event regardless of success.
4. Fire and forget `httpClient.logClick` with the original URL, username and slug, `app_platform: 'react_native'`, a session ID, the `utm_*` parameters and the device info. Report the open to `POST /api/v1/app-opens` as well.

```typescript
private async handleIncomingUrl(url: string) {
  const parsed = parseDectogUrl(url);
  if (!parsed) {
    emitLinkClick({
      originalUrl: url,
      slug: 'unknown',
      username: 'unknown',
      receivedAt: new Date().toISOString(),
      error: { message: 'Invalid DecTog URL' },
    } as DectogLinkClick);
    return;
  }

  let resolution;
  try {
    resolution = await this.http!.resolveLink(parsed.username, parsed.slug);
  } catch (err) {
    if (this.config?.enableDebugLogging) console.warn('Resolve failed', err);
  }

  emitLinkClick({
    originalUrl: url,
    slug: parsed.slug,
    username: parsed.username,
    receivedAt: new Date().toISOString(),
    linkResolution: resolution,
  });

  this.http!.logClick(parsed.username, parsed.slug, { url, resolution }).catch(() => {});
}
```

### 8. Device metadata helpers

In `src/telemetry/deviceInfo.ts`:

```typescript
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Localization from 'expo-localization';

export const collectDeviceInfo = () => ({
  platform: Device.osName ?? 'unknown',
  osVersion: Device.osVersion ?? 'unknown',
  deviceModel: Device.modelName ?? 'unknown',
  language: Localization.locale,
  timezone: Localization.timezone,
  appVersion: Application.nativeApplicationVersion ?? 'unknown',
  buildNumber: Application.nativeBuildVersion ?? 'unknown',
});
```

The click logger and the install tracker both use this helper so payloads stay consistent. The Flutter SDK also sends a device-data tier the port should mirror:

- `device_id`: on iOS `identifierForVendor`, persisted through `expo-secure-store` (Keychain, survives reinstall); on Android `Settings.Secure.ANDROID_ID` (`react-native-device-info` `getAndroidId()`).
- Hardware: `expo-device` exposes `manufacturer` and `deviceType` (`phone` or `tablet`); CPU and OS build need native code or can be omitted.
- Screen: send the display's physical pixels, `Dimensions.get('screen')` multiplied by `PixelRatio.get()` and rounded, with `screen_density` as `PixelRatio.get().toFixed(3)`, all as strings, omitted when null. The display is the contract: the browser side of the attribution match records the display, and the server compares the short side only.
- Network: `connectivity_type` from `@react-native-community/net-info`; carrier MCC/MNC through a small native module (Android `TelephonyManager`).
- Advertising identifiers: the Flutter SDK does not read GAID or IDFA. A port should not either.
- No WebView probe: client hints are unavailable in React Native, and the server does not expect them from the app.

### 9. App-install tracking

Create `src/telemetry/installTracker.ts`:

```typescript
import * as FileSystem from 'expo-file-system';
const SENTINEL = `${FileSystem.documentDirectory}.dectog_install_tracked`;

export const hasTrackedInstall = async () => {
  try {
    await FileSystem.getInfoAsync(SENTINEL);
    return true;
  } catch {
    return false;
  }
};

export const markInstallTracked = () =>
  FileSystem.writeAsStringAsync(SENTINEL, JSON.stringify({ trackedAt: new Date().toISOString() }));
```

During `initialize`:

1. Check the sentinel. If absent, build `DectogAppInstallRequest` (device info plus `app_platform: 'react_native'`, the plugin version and a timestamp).
2. `POST /api/v1/app-installs`.
3. Emit the response on the event bus so subscribers learn immediately whether the install matched a deferred click.
4. Write the sentinel even if the request fails, to avoid hammering the endpoint, with retry logic for the next launch.

Bare React Native: replace `expo-file-system` with `@react-native-async-storage/async-storage` and a key such as `dectog_install_tracked`.

:::caution
This section is the part of the draft that has aged most. Today's contract needs a persisted `install_attempt_id` generated before the first POST and reused on every retry, an `install_state` classification, the sentinel in a backup-excluded directory (not the documents directory), validation against the package's first-install time, and the late-claim path for referrers and pastes that arrive after the POST. The Flutter implementation is `lib/src/services/install_state_store.dart` and the install section of `lib/src/dectog_impl.dart`.
:::

### 9b. Post-install events (wire contract)

The Dart SDK queues identify, lead, conversion and custom events on disk (flush at 20 events or 30 seconds, cap 1000, batches of 100) and delivers them to:

```json
POST /api/v1/events
{
  "device_id": "optional, only when the app collects it",
  "install_id": "optional, from the install response",
  "events": [
    { "type": "identify", "customer_id": "u42", "name": "…", "email": "…", "phone": "…", "client_timestamp": "…" },
    { "type": "lead", "event_name": "signup", "customer_id": "u42", "metadata": {} },
    { "type": "conversion", "event_name": "purchase", "revenue": 9.99, "currency": "USD", "customer_id": "u42" },
    { "type": "custom", "event_name": "level_up", "metadata": { "level": 3 } }
  ]
}
```

The response is `{ "accepted": n }`. More than 100 events returns 413; one invalid event rejects the whole batch. `GET /api/v1/attribution?device_id=` (or `?install_id=`) re-pulls the stored verdict and `POST /api/v1/device-ping` records an initialization. The server stamps each event with the install's matched slug, so the client does no attribution work. Port the queue semantics: durable, FIFO, at-least-once, events over 32 KB serialized dropped.

### 10. Public facade

`src/DecTog.ts` ties everything together:

```typescript
export class DecTog {
  private static instance: DecTog;
  static getInstance() {
    if (!DecTog.instance) DecTog.instance = new DecTog();
    return DecTog.instance;
  }

  private config?: DectogConfig;
  private http?: DectogHttpClient;
  private linkListener?: LinkListener;

  async initialize(config: DectogConfig) {
    if (this.config) throw new DectogError('Already initialized', 'config');
    this.config = config;
    this.http = new DectogHttpClient(config);
    this.linkListener = new LinkListener((url) => this.handleIncomingUrl(url));
    await this.linkListener.start();
    await this.trackInstallIfNeeded();
  }

  dispose() {
    this.linkListener?.stop();
    this.config = undefined;
    this.http = undefined;
  }

  // createLink, createTempLink, getLinks, ... call this.http
  // onLinkClick / onAppInstalled proxy to the EventBus helpers
}
```

### 11. Usage walkthrough

```typescript
import DecTog from 'react-native-dectog';
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    const dectog = DecTog.getInstance();
    dectog.initialize({
      apiKey: process.env.EXPO_PUBLIC_DECTOG_API_KEY!,
      enableDebugLogging: __DEV__,
    });

    const sub = dectog.onLinkClick((link) => {
      if (link.linkResolution) navigateTo(link.linkResolution.target);
    });

    const installSub = dectog.onAppInstalled((event) => {
      if (event.matched) showAttributedWelcome(event);
    });

    dectog.getInitialLink().then((link) => link && handleLink(link));

    return () => {
      sub.remove();
      installSub.remove();
      dectog.dispose();
    };
  }, []);

  return <NavigationContainer>{/* ... */}</NavigationContainer>;
}
```

### 12. Build and release tasks

- Add npm scripts: `lint`, `test`, `typecheck`, `prepublishOnly` (lint, test, build).
- Point `package.json` `main`, `module` and `types` at the built artifacts in `dist/`.
- Add `babel.config.js` for Metro and `tsconfig.build.json` for declaration files.
- Publish: `yarn lint && yarn test && yarn build && npm publish --access public`.

## Integration checklist for app teams

1. Configure Universal Links and App Links in `app.json` (Expo) or `AndroidManifest.xml` and the entitlements, for `https://{username}.dectog.com`. The server serves the AASA and `assetlinks.json`; see [Platform setup](/sdk/platform-setup/).
2. Initialize the SDK before showing the main navigation so the first link can be handled.
3. Subscribe to events right after initialization and unsubscribe on unmount.
4. Handle cold-start links by calling `getInitialLink()` immediately and processing the result with the same handler as live events.
5. Check `getCurrentAppInstall()` during onboarding to decide whether to show the content the user tapped.
6. Catch promise rejections from the CRUD methods and log the status code and message.

## Testing strategy

- Unit tests: mock `fetch`, `Linking` and the telemetry helpers to verify serialization, error mapping and URL parsing edge cases.
- Integration tests: use Jest or Detox to simulate incoming deep links and check that the events fire.
- Manual validation: run the sample app, open `https://{username}.dectog.com/{slug}` from Safari or Chrome, confirm that `onLinkClick` fires, and check that the install appears on the dashboard. See [Testing](/sdk/testing/) for the device-level checklist.
