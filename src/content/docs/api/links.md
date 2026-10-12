---
title: Links
description: Create, read, update and delete permanent and temporary links over the REST API, and resolve any link without an API key.
sidebar:
  order: 2
---

A link is a short URL on your account's host, `https://<username>.dectog.com/<slug>`. Permanent links live until you delete them and carry routing, social-preview and tracking settings. Temporary links expire after a TTL and carry only a target and a social preview.

Every route on this page except `resolve` needs the Bearer key and the request signature described in [API overview](/api/overview/). All routes are scoped to the account that owns the key: you can only see and change your own links.

## The Link object

Every permanent-link route returns the full object, including fields you never set (they come back as `null`).

```json title="Link"
{
  "id": "6f1c2a0e-3b7d-4c8e-9a11-2f5d8c0b4e77",
  "slug": "spring-sale",
  "target": "https://shop.example.com/sale",
  "url": "https://acme.dectog.com/spring-sale",
  "app_id": "0d4e5f66-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
  "click_count": 0,
  "created_at": "2026-10-12T09:00:00.000Z",
  "updated_at": null,
  "metadata": { "screen": "sale", "campaign": "spring" },
  "og_title": null,
  "og_description": null,
  "og_image_url": null,
  "ios_deep_link_path": "sale",
  "android_deep_link_path": "sale",
  "redirect_url": null,
  "fallback_url": null,
  "label": null,
  "campaign": "spring",
  "adgroup": null,
  "creative": null
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID, assigned by the server. |
| `slug` | string | The path segment of the link. |
| `target` | string or null | The web destination. `null` means "inherit the app's fallback URL at tap time". |
| `url` | string | The public link URL in this deployment's URL mode (subdomain on the hosted service, `<PUBLIC_BASE_URL>/r/<username>/<slug>` in path mode). |
| `app_id` | string or null | The app whose store URLs, schemes and fallback apply to this link. `null` means the account's default app (its oldest app). |
| `click_count` | number | Lifetime counter. It grows on web taps, on SDK-reported clicks and on clicks synthesized from a store referrer. It never goes down. |
| `created_at`, `updated_at` | string or null | ISO 8601 UTC. `updated_at` stays `null` until the first `PUT`. |
| `metadata` | JSON or null | Your own data. Delivered to the app on attributed installs as `custom_params` and inside `link.metadata`. |
| `og_title`, `og_description`, `og_image_url` | string or null | Social preview overrides for bots and unfurlers. Fall back to the app's values. See [Social previews and QR](/links/social-previews-and-qr/). |
| `ios_deep_link_path`, `android_deep_link_path` | string or null | Route appended after `scheme://<username>/<slug>/` when the app opens from a tap. Stored without a leading slash. |
| `redirect_url` | string or null | Mobile visitors without the app go here instead of the store. A store URL here is still tagged with the click id. |
| `fallback_url` | string or null | Where desktop visitors go instead of the QR page, and the last mobile fallback. |
| `label`, `campaign`, `adgroup`, `creative` | string or null | Tracking defaults copied onto every click of this link. A `dec_<field>` query parameter on the tapped URL wins for that tap. See [URL parameters](/links/url-parameters/). |

## Slug rules

- Allowed characters: `A-Z`, `a-z`, `0-9`, `_` and `-`. Length 1 to 128.
- The slug is used exactly as sent. Leading or trailing whitespace makes it invalid. Slugs are case-sensitive: `Sale` and `sale` are two different links.
- One namespace per account for permanent **and** temporary links. Creating either kind with a slug the other kind holds returns `409 {"error": "Slug already exists", "slug": "<slug>"}`.
- A slug becomes free again when the link is deleted, or when an expired temporary link is purged.

## Create a link

`POST /api/v1/links` returns `201` with the Link.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slug` | string | yes | See the slug rules above. |
| `target` | string or null | no | An http(s) URL. `null`, `""` or absent stores `null` (inherit the app's fallback URL). |
| `app_id` | string | no | The id of one of your apps. Default: your oldest app, or `null` when the account has no app yet. |
| `metadata` | JSON | no | Any JSON value; an object is the intended use. Falsy values (`""`, `0`, `false`, `null`) store `null`. |
| `og_title`, `og_description` | string | no | Trimmed; at most 150 characters each. `""` stores `null`. |
| `og_image_url` | string | no | An http(s) URL. `""` stores `null`. |
| `ios_deep_link_path`, `android_deep_link_path` | string | no | A relative route such as `products/42?color=black`. At most 512 characters; no `:`, whitespace, `#`, `;` or control characters. A leading `/` is stripped. `""` stores `null`. |
| `redirect_url`, `fallback_url` | string | no | http(s) URLs. `""` stores `null`. |
| `label`, `campaign`, `adgroup`, `creative` | string | no | Trimmed; at most 255 characters; no control characters. `""` stores `null`. |

Checks run in this order and stop at the first failure:

| Status | Body |
|---|---|
| 400 | `{"error": "Invalid JSON body"}` |
| 400 | `{"error": "slug is required"}` |
| 400 | `{"error": "Invalid slug: only letters, numbers, hyphens and underscores are allowed"}` |
| 400 | `{"error": "Invalid target: must be a valid http(s) URL"}` |
| 409 | `{"error": "Slug already exists", "slug": "spring-sale"}` |
| 400 | `{"error": "Unknown app_id"}` (the id is not one of your apps) |
| 400 | `{"error": "Invalid label: max 255 characters"}`, `{"error": "Invalid campaign: control characters are not allowed"}`, `{"error": "Invalid adgroup: must be a string"}` (checked in the order `label`, `campaign`, `adgroup`, `creative`) |
| 400 | `{"error": "Invalid ios_deep_link_path: must be a relative path, not a full URL (no \":\": no scheme, no spaces, no \"#\"/\";\")"}`, `{"error": "Invalid android_deep_link_path: deep link path is too long (max 512 chars)"}` |
| 400 | `{"error": "Invalid redirect_url: must be a valid http(s) URL"}`, same for `fallback_url` |

The server also rejects `og_title` or `og_description` longer than 150 characters and an `og_image_url` that is not an http(s) URL. On `POST` the response for those is not a clean 400, so validate the three preview fields before sending them; `PUT` returns the 400 strings listed below.

```bash title="Create a link"
dectog POST /api/v1/links '{
  "slug": "spring-sale",
  "target": "https://shop.example.com/sale",
  "metadata": { "screen": "sale" },
  "ios_deep_link_path": "sale",
  "android_deep_link_path": "sale",
  "campaign": "spring"
}'
```

`dectog` is the signing helper from [API overview](/api/overview/).

## List and read links

| Route | Response |
|---|---|
| `GET /api/v1/links` | `200` with an array of Link objects, newest first. No pagination, no filters. |
| `GET /api/v1/links/:slug` | `200` with the Link, or `404 {"error": "Link not found"}`. A temporary link's slug also answers 404 here. |

## Update a link

`PUT /api/v1/links/:slug` applies a partial update and returns `200` with the full Link. Unknown slugs return `404 {"error": "Link not found"}`.

| In the body | Effect |
|---|---|
| Key absent | The stored value is kept. This includes the `og_*` fields. |
| `null` | Clears the field: `target`, `metadata`, `og_*`, the deep-link paths, `redirect_url`, `fallback_url` and the four tracking fields all become `null`. |
| `""` | Clears every field except `metadata`. `"metadata": ""` is stored as the JSON string `""` and comes back as `""`; send `null` to clear metadata. |
| `slug`, `app_id` | Ignored. Neither can be changed after creation. |

Validation is the same as on create. Errors come back as `400` with the same strings, plus `{"error": "og_title must be at most 150 characters"}`, `{"error": "og_description must be at most 150 characters"}` and `{"error": "og_image_url must be a valid http(s) URL"}`.

```bash title="Clear the target so the link inherits the app fallback"
dectog PUT /api/v1/links/spring-sale '{"target": null, "label": "launch-week"}'
```

## Delete a link

`DELETE /api/v1/links/:slug` returns `200 {"success": true}`. Unknown slugs return `404 {"error": "Link not found"}`.

Deleting a link deletes its history in one atomic batch: the events of installs it attributed and events denormalized to its slug, its app opens, the installs attributed through its clicks (customers that pointed at those installs keep their identity but lose `first_install_id`), its clicks, then the link. The dashboard's totals drop accordingly; see [Dashboard: Links](/dashboard/links/).

:::note
The dashboard's cookie-session route `DELETE /api/admin/links/:slug` answers `{"deleted": true}` even for a slug that does not exist. Only the v1 route returns 404.
:::

## Temporary links

Temporary links expire after a TTL. They have no app binding, no deep-link paths, no tracking defaults and no click counter; taps use the account's default app for store routing and fallback. See [Temporary links](/links/temporary-links/) for how they behave when tapped.

```json title="TempLink"
{
  "id": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "slug": "t_4f1e9c2b7a",
  "target": "https://example.com/build/1234",
  "url": "https://acme.dectog.com/t_4f1e9c2b7a",
  "expires_at": "2026-10-12T10:00:00.000Z",
  "created_at": "2026-10-12T09:00:00.000Z",
  "ttl_seconds": 3600,
  "og_title": null,
  "og_description": null,
  "og_image_url": null
}
```

### Create a temporary link

`POST /api/v1/temp-links` returns `201` with the TempLink.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `target` | string or null | no | Same rules as for permanent links. |
| `slug` | string | no | Same rules as for permanent links. When absent, `null` or `""`, the server generates `t_` followed by 10 lowercase hex characters, for example `t_4f1e9c2b7a`. |
| `ttlSeconds` | number | no | Lifetime in seconds. Default 900 (15 minutes). |
| `og_title`, `og_description`, `og_image_url` | string | no | Same rules as for permanent links. |

How `ttlSeconds` is interpreted:

- It must be a JSON number when present, otherwise `400 {"error": "ttlSeconds must be a number"}`.
- The value is floored to a whole number. `0`, or anything that floors to `0` (for example `0.5`), becomes `900`.
- Everything else is clamped to the range 60 to 2,592,000 (30 days): `30` becomes `60`, `-5` becomes `60`, `1e15` becomes `2592000`.
- `expires_at` is `created_at` plus the resulting `ttl_seconds`.

Other errors: `400 {"error": "Invalid slug"}`, `400 {"error": "Invalid target: must be a valid http(s) URL"}`, `409 {"error": "Slug already exists", "slug": "…"}`. Invalid `og_*` values are rejected as on permanent-link create.

```bash title="A link for a CI build that expires in one hour"
dectog POST /api/v1/temp-links '{"target": "https://example.com/build/1234", "ttlSeconds": 3600}'
```

### Read, update and delete

| Route | Response |
|---|---|
| `GET /api/v1/temp-links/:slug` | `200` TempLink, or `404 {"error": "Temporary link not found"}`. |
| `PUT /api/v1/temp-links/:slug` | Partial update of `target` and the three `og_*` fields only; absent keeps, `null` or `""` clears. Returns `200` TempLink, or `404 {"error": "Temporary link not found"}`. The TTL and `expires_at` cannot be changed. |
| `DELETE /api/v1/temp-links/:slug` | `200 {"success": true}` after deleting the link with the same history cascade as a permanent link, or `404 {"error": "Temporary link not found"}` for a slug that is not yours. |

There is no list route for temporary links in the v1 API. The dashboard's `GET /api/admin/links` returns them under `temp_links`.

### Lifecycle after expiry

1. From `expires_at` on, a tap answers the `410` "Link expired" page, for bots too. The link still exists.
2. `resolve` keeps answering `200` with `"is_expired": true` and `GET /api/v1/temp-links/:slug` keeps answering `200`.
3. The daily job (03:17 UTC) deletes temporary links whose `expires_at` is more than 24 hours in the past. Their clicks and installs are kept, and the slug is free again. From then on the link URL answers 404 and the API answers `404`.
4. The dashboard's "Delete expired" button (`DELETE /api/admin/temp-links/expired`) removes every expired temporary link of the account immediately, also keeping their history.

## Resolve a link (public)

`GET /api/v1/resolve/:username/:slug` needs no API key, no signature and is not rate limited. It is what the SDK calls when it opens a link, and it works for any account's links. CORS allows every origin.

```json title="GET /api/v1/resolve/acme/spring-sale"
{
  "id": "6f1c2a0e-3b7d-4c8e-9a11-2f5d8c0b4e77",
  "slug": "spring-sale",
  "target": "https://shop.example.com/sale",
  "url": "https://acme.dectog.com/spring-sale",
  "type": "permanent",
  "is_expired": false,
  "created_at": "2026-10-12T09:00:00.000Z",
  "click_count": 12,
  "expires_at": null,
  "ttl_seconds": null,
  "metadata": { "screen": "sale", "campaign": "spring" },
  "ios_deep_link_path": "sale",
  "android_deep_link_path": "sale"
}
```

Every key is always present. Which ones carry values depends on the kind of link:

| Field | Permanent link | Temporary link |
|---|---|---|
| `type` | `"permanent"` | `"temporary"` |
| `is_expired` | always `false` | `true` once `expires_at` has passed |
| `click_count` | number | `null` |
| `expires_at`, `ttl_seconds` | `null` | values |
| `metadata` | JSON or `null` | `null` |
| `ios_deep_link_path`, `android_deep_link_path` | string or `null` | `null` |

`id`, `slug`, `target`, `url` and `created_at` are filled for both kinds. An unknown username or slug answers `404 {"error": "Link not found"}`. The `og_*`, routing and tracking fields are not exposed here.
