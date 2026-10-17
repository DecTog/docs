---
title: Create links from the app
description: Create, read, update and delete permanent and temporary links from the SDK, resolve any link, and handle the 409 and 400 errors the server returns.
sidebar:
  order: 8
---

The SDK wraps the link endpoints of the REST API with the key you initialized it with. Reading links and temporary links works with any SDK key; creating, changing and deleting permanent links needs an SDK key created with **Allow creating and changing links (links:write)** in Settings, otherwise those calls fail with `DectogError.code == 'insufficient_scope'`. Everything here is authenticated and signed automatically; see [Links](/api/links/) for the wire format and the full validation rules.

## Permanent links

```dart
final link = await dectog.createLink(
  slug: 'spring-sale',
  target: 'https://example.com/spring',   // optional: null inherits the app's fallback URL
  iosDeepLinkPath: 'products/42',
  androidDeepLinkPath: 'products/42',
  ogTitle: 'Spring sale',
  campaign: 'spring',
  metadata: {'promo': 'spring-2026'},
);
print(link.url); // https://{username}.dectog.com/spring-sale
```

Only `slug` is required. Every other parameter is optional and omitted from the request when `null`:

| Parameter | Server rule |
|---|---|
| `slug` | Letters, digits, `-` and `_`, 1 to 128 characters. Unique across your permanent **and** temporary links. |
| `target` | An `http(s)` URL. `null` or `''` means the link inherits the app's fallback URL (or the QR page when that is unset). |
| `appId` | The id of one of your apps. Omit it to bind the link to your oldest app. App ids come from the dashboard's admin API, see [Admin API](/api/admin-api/). |
| `iosDeepLinkPath`, `androidDeepLinkPath` | A relative route such as `products/42?color=black`: at most 512 characters, no `:`, whitespace, `#` or `;`; a leading `/` is stripped. The link opens `{scheme}://{path}` on that platform. |
| `redirectUrl` | `http(s)` URL used instead of the stores when the app is not installed on a mobile device. |
| `fallbackUrl` | `http(s)` URL for desktop visitors. |
| `ogTitle`, `ogDescription` | At most 150 characters. |
| `ogImageUrl` | An `http(s)` URL. |
| `label`, `campaign`, `adgroup`, `creative` | At most 255 characters, no control characters. Stored on every click of the link unless a `dec_*` parameter on the tapped URL overrides it. |
| `metadata` | Any JSON map. It comes back as `customParameters` on attributed installs. |

The call returns the created `DectogLink` (HTTP 201). Its `url` is the link to share, `clickCount` starts at 0.

### Update

```dart
await dectog.updateLink('spring-sale', campaign: 'summer', ogTitle: '');
```

A `null` argument keeps the stored value; `''` clears a field (for `target`, clearing means "inherit the app's fallback URL"). `updateLink` takes every `createLink` parameter except `slug` and `appId`. `metadata` is sent only when you pass a map; to replace it pass the full map, there is no way to clear it to `null` from the SDK.

### Read and delete

```dart
final page = await dectog.getLinks(limit: 50); // newest first
final next = page.hasMore ? await dectog.getLinks(cursor: page.nextCursor) : null;
final one = await dectog.getLink('spring-sale');
await dectog.deleteLink('spring-sale');
```

`deleteLink` stops the link and hides it: it answers 404 and leaves the lists, while its clicks and the installs, events and app opens attributed to it stay, and the dashboard can restore it. `deleteLink(slug, permanently: true)` also deletes that history, so the dashboard totals drop with it; that cannot be undone. An unknown or deleted slug answers 404 (`Link not found`) for `getLink`, `updateLink` and `deleteLink`. Pausing, expiring and archiving are done from the dashboard, the REST API or the MCP server; `DectogLink` reports them in `disabledAt`, `expiresAt`, `expiredUrl` and `archivedAt`.

## Temporary links

```dart
final temp = await dectog.createTempLink(
  target: 'https://example.com/live/42',
  ttlSeconds: 3600,                 // default 900
  ogTitle: 'Live now',
);
print(temp.url);
print(temp.expiresAt);

await dectog.updateTempLink(temp.slug, ogTitle: 'Replay available');
final again = await dectog.getTempLink(temp.slug);
await dectog.deleteTempLink(temp.slug);
```

- `ttlSeconds` is clamped to 60 seconds to 30 days; `0` becomes 900. The SDK always sends an integer.
- `slug` is optional. Without one the server generates `t_` followed by 10 hex characters. A given slug follows the permanent-link rules and shares the same namespace.
- Temporary links take `target`, `ogTitle`, `ogDescription` and `ogImageUrl` only. They use the default app's routing and fallback, have no deep-link paths and no click counter.
- After `expiresAt` a tap shows the 410 "Link expired" page (or goes to the link's expired URL), and `resolveLink` throws `DectogError` with code `link_expired`. A daily job deletes links expired for more than 24 hours that have no expired URL; their clicks are kept and the slug becomes free again, after which the link answers 404.

`DectogTempLink` has `isExpired` and `timeUntilExpiration` getters computed on the device clock. See [Temporary links](/links/temporary-links/) for the dashboard side.

## Resolve any link

```dart
final res = await dectog.resolveLink('acme', 'spring-sale');
print(res.type);         // 'permanent' or 'temporary'
print(res.target);       // null when the link inherits the app's fallback URL
print(res.deepLinkPath); // the in-app route for this platform, else the other's
```

`resolveLink` calls the public `GET /api/v1/resolve/{username}/{slug}` endpoint without authentication, so it works for any account's links. The SDK uses it for every link open. Unknown links answer 404 (`Link not found`). The result is a `DectogLinkResolution`; `toDectogLink()` and `toDectogTempLink()` convert it when the type matches.

## Errors

Every method throws a `DectogError`:

```dart
try {
  await dectog.createLink(slug: 'spring-sale', target: 'https://example.com');
} on DectogError catch (e) {
  switch (e.code) {
    case 'conflict':
      // Slug already exists; e.details?['slug'] names it.
      break;
    case 'invalid_request':
      // Validation: e.message is the server's message, e.g. 'Unknown app_id'.
      break;
    default:
      // e.type: api, network, configuration or linkResolution.
      // Log e.requestId with API errors: it finds the request in the server logs.
      break;
  }
}
```

| Status | `message` | When |
|---|---|---|
| 400 | `slug is required` | `createLink` with an empty slug |
| 400 | `Invalid slug: only letters, numbers, hyphens and underscores are allowed` | A slug outside `[A-Za-z0-9_-]{1,128}` (`Invalid slug` for temporary links) |
| 400 | `Unknown app_id` | `appId` is not one of your apps |
| 400 | `Invalid target: must be a valid http(s) URL`, `Invalid ios_deep_link_path: …`, `Invalid campaign: max 255 characters`, `og_title must be at most 150 characters`, … | A field failed validation |
| 400 | `ttlSeconds must be a number` | A non-numeric TTL (the SDK cannot produce this) |
| 404 | `Link not found`, `Temporary link not found` | Unknown slug on get, update or delete |
| 409 | `Slug already exists` | The slug is taken by a permanent or temporary link; `details` carries `slug` |
| 429 | | Rate limited; `details['retry_after_ms']` carries the `Retry-After` value |

For API errors `e.type` is `DectogErrorType.api`, `e.statusCode` is the HTTP status, `e.code` the server's error code, `e.requestId` the request id, and `e.details` every field of the server's `error` object. Network failures and timeouts (30 seconds per request) throw `DectogErrorType.network` with no status code. Calling any of these methods before `initialize` throws `DectogErrorType.configuration`.

:::note[Invalid social fields]
`createLink`, `createTempLink`, `updateLink` and `updateTempLink` answer 400 for an `ogTitle` or `ogDescription` over 150 characters or a non-`http(s)` `ogImageUrl`.
:::
