---
title: Links
description: Create, read, update and delete permanent and temporary links over the REST API, and resolve any link without an API key.
sidebar:
  order: 2
---

A link is a short URL on your account's host, `https://<username>.dectog.com/<slug>`. Permanent links live until you delete them or give them an expiry, and carry routing, social-preview and tracking settings. Temporary links expire after a TTL and carry only a target and a social preview. Both kinds can be paused, archived, deleted and restored ([Pause, expire, archive and delete](#pause-expire-archive-and-delete)).

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
  "creative": null,
  "referrer_customer_id": null,
  "expires_at": null,
  "expired_url": null,
  "disabled_at": null,
  "disabled_reason": null,
  "archived_at": null,
  "deleted_at": null
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
| `ios_deep_link_path`, `android_deep_link_path` | string or null | The app route a custom-scheme open uses on that platform: `scheme://<path>?dtg_l=<username>/<slug>` instead of `scheme://<username>/<slug>?dtg_l=…`. Stored without a leading slash. |
| `redirect_url` | string or null | Mobile visitors without the app go here instead of the store. A store URL here is still tagged with the click id. |
| `fallback_url` | string or null | Where desktop visitors go instead of the QR page, and the last mobile fallback. |
| `label`, `campaign`, `adgroup`, `creative` | string or null | Tracking defaults copied onto every click of this link. A `dec_<field>` query parameter on the tapped URL wins for that tap. See [URL parameters](/links/url-parameters/). |
| `referrer_customer_id` | string or null | Set on a customer's referral link. See [Referral programs](/guides/referral-programs/). |
| `expires_at`, `expired_url` | string or null | When the link expires, and where taps go after that instead of a `410` page. |
| `disabled_at`, `disabled_reason` | string or null | Paused since, and your note on why. A paused link answers `410` and records nothing. |
| `archived_at` | string or null | Filed away in the dashboard. The link keeps working. |
| `deleted_at` | string or null | Deleted. Only listed with `include_deleted`. |

## Slug rules

- Allowed characters: `A-Z`, `a-z`, `0-9`, `_` and `-`. Length 1 to 128.
- The slug is used exactly as sent. Leading or trailing whitespace makes it invalid. Slugs are case-sensitive: `Sale` and `sale` are two different links.
- One namespace per account for permanent **and** temporary links. Creating either kind with a slug the other kind holds returns `409 {"error": {"code": "conflict", "message": "Slug already exists", "slug": "<slug>"}}`.
- A slug becomes free again when the link is deleted permanently, or when an expired temporary link is purged. A deleted link keeps its slug, because its history is filed under it: creating that slug answers `409 {"error": {"code": "conflict", "message": "Slug belongs to a deleted link: restore it, or delete it permanently to reuse the slug", "slug": "<slug>", "deleted": true}}`.

## Create a link

`POST /api/v1/links` returns `201` with the Link.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slug` | string | yes | See the slug rules above. |
| `target` | string or null | no | An http(s) URL. `null`, `""` or absent stores `null` (inherit the app's fallback URL). |
| `app_id` | string | no | The id of one of your apps. Default: your oldest app, or `null` when the account has no app yet. |
| `metadata` | JSON object | no | Your own key-value data. `null` or `""` stores `null`; any other non-object value (a string, number, boolean or array) answers `400 {"error": {"code": "invalid_request", "message": "metadata must be a JSON object"}}`. |
| `og_title`, `og_description` | string | no | Trimmed; at most 150 characters each. `""` stores `null`. |
| `og_image_url` | string | no | An http(s) URL. `""` stores `null`. |
| `ios_deep_link_path`, `android_deep_link_path` | string | no | A relative route such as `products/42?color=black`. At most 512 characters; no `:`, whitespace, `#`, `;` or control characters. A leading `/` is stripped. `""` stores `null`. |
| `redirect_url`, `fallback_url` | string | no | http(s) URLs. `""` stores `null`. |
| `label`, `campaign`, `adgroup`, `creative` | string | no | Trimmed; at most 255 characters; no control characters. `""` stores `null`. |
| `expires_at` | string | no | An ISO 8601 time such as `2026-12-31T23:59:00Z`, stored in UTC. A time in the past creates an already-expired link. |
| `expired_url` | string | no | An http(s) URL taps go to once the link has expired. |
| `disabled`, `disabled_reason` | boolean, string | no | `true` creates the link paused. The reason is at most 255 characters. |
| `archived` | boolean | no | `true` creates the link archived. |

Checks run in this order and stop at the first failure:

| Status | Body |
|---|---|
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid JSON body"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "slug is required"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid slug: only letters, numbers, hyphens and underscores are allowed"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "Slug 'healthz' is reserved"}}`: `healthz` and `readyz` (any case) are answered by the service itself on every host, so they are refused for permanent and temporary links |
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid target: must be a valid http(s) URL"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "disabled must be true or false"}}`, `"archived must be true or false"`, `"expires_at must be an ISO 8601 time, e.g. 2026-12-31T23:59:00Z"`, `"expired_url must be a valid http(s) URL"`, `"disabled_reason: max 255 characters"` |
| 409 | `{"error": {"code": "conflict", "message": "Slug already exists", "slug": "spring-sale"}}`, or the deleted-link variant above |
| 400 | `{"error": {"code": "invalid_request", "message": "Unknown app_id"}}` (the id is not one of your apps) |
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid label: max 255 characters"}}`, `{"error": {"code": "invalid_request", "message": "Invalid campaign: control characters are not allowed"}}`, `{"error": {"code": "invalid_request", "message": "Invalid adgroup: must be a string"}}` (checked in the order `label`, `campaign`, `adgroup`, `creative`) |
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid ios_deep_link_path: must be a relative path, not a full URL (no \":\": no scheme, no spaces, no \"#\"/\";\")"}}`, `{"error": {"code": "invalid_request", "message": "Invalid android_deep_link_path: deep link path is too long (max 512 chars)"}}` |
| 400 | `{"error": {"code": "invalid_request", "message": "Invalid redirect_url: must be a valid http(s) URL"}}`, same for `fallback_url` |

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
| `GET /api/v1/links?limit=&cursor=&include_deleted=` | `200 {"data": [Link, …], "next_cursor": "…" \| null}`, newest first. `limit` is 1 to 200 (default 50); pass `next_cursor` back as `cursor` for the next page until it is `null`. A `limit` out of range, or a `cursor` this API did not return, answers `400`. Paused, expired and archived links are listed; deleted ones only with `include_deleted=true`. |
| `GET /api/v1/links/:slug` | `200` with the Link, or `404 {"error": {"code": "not_found", "message": "Link not found"}}`. A temporary link's slug and a deleted link also answer 404 here. |

## Update a link

`PUT /api/v1/links/:slug` applies a partial update and returns `200` with the full Link. Unknown slugs and deleted links return `404 {"error": {"code": "not_found", "message": "Link not found"}}`. The lifecycle fields of the create body work here too; see the next section.

| In the body | Effect |
|---|---|
| Key absent | The stored value is kept. This includes the `og_*` fields. |
| `null` | Clears the field: `target`, `metadata`, `og_*`, the deep-link paths, `redirect_url`, `fallback_url` and the four tracking fields all become `null`. |
| `""` | Clears the field, `metadata` included. |
| `slug`, `app_id` | Ignored. Neither can be changed after creation. |

Validation is the same as on create. Errors come back as `400` with the same strings, plus `{"error": {"code": "invalid_request", "message": "og_title must be at most 150 characters"}}`, `{"error": {"code": "invalid_request", "message": "og_description must be at most 150 characters"}}` and `{"error": {"code": "invalid_request", "message": "og_image_url must be a valid http(s) URL"}}`.

```bash title="Clear the target so the link inherits the app fallback"
dectog PUT /api/v1/links/spring-sale '{"target": null, "label": "launch-week"}'
```

## Pause, expire, archive and delete

A link that is not live records nothing: no click row, no click count, for people and bots alike. The SDK's click and app-open reports for it are refused the same way, after the app has already opened.

| State | Set with | A tap gets | `resolve`, SDK clicks and opens |
|---|---|---|---|
| Paused | `PUT {"disabled": true, "disabled_reason": "…"}`; `{"disabled": false}` resumes and clears the reason | A `410` "Link paused" page. The reason is never shown. | `410 {"error": {"code": "link_paused", …}}` |
| Expired | `expires_at` in the past, on create or `PUT`; `null` or `""` removes it | A `302` to `expired_url`, or a `410` "Link expired" page without one | `410 {"error": {"code": "link_expired", "expired_url": "…" \| null, …}}` |
| Archived | `PUT {"archived": true}`; `false` unarchives | The usual routing: archiving only files the link away in the dashboard | As a live link |
| Deleted | `DELETE /api/v1/links/:slug` | A `404` page, as for a slug that never existed | `404 not_found` |

Pausing a paused link keeps its first `disabled_at`. A paused link that has also expired answers as paused.

```bash title="End a sale at midnight and send late taps to a page"
dectog PUT /api/v1/links/spring-sale '{"expires_at": "2026-12-31T23:59:00Z", "expired_url": "https://shop.example.com/sale-over"}'
```

### Delete, restore, delete permanently

`DELETE /api/v1/links/:slug` returns `200 {"success": true}`. Unknown slugs, and links already deleted, return `404 {"error": {"code": "not_found", "message": "Link not found"}}`.

Deleting is a soft delete. The link leaves the list (unless `include_deleted=true`), its URL answers 404, and `GET` and `PUT` answer 404. Its clicks and the installs, events and app opens attributed to it stay, so the Overview and every past verdict keep their numbers. The link keeps its slug. Thirty days after the delete, the daily job anonymises its clicks and app opens (IP hash, device id, user agent and the like), as retention would do after `RETENTION_DAYS`; installs and events keep the normal schedule.

`POST /api/v1/links/:slug/restore` brings a deleted link back and returns `200` with the Link; restoring a live link changes nothing. An unknown slug answers 404.

`DELETE /api/v1/links/:slug?permanent=true` deletes the link and its history in one atomic batch, on a live or a deleted link: the events of installs it attributed and events denormalized to its slug, its app opens and referrals, the installs attributed through its clicks (customers that pointed at those installs keep their identity but lose `first_install_id`), its clicks, then the link. The dashboard's totals drop accordingly, and the slug is free again. This cannot be undone; see [Dashboard: Links](/dashboard/links/).

:::note
The dashboard's cookie-session route `DELETE /api/admin/links/:slug` (with `?permanent=1` for the hard delete) answers `{"deleted": true}` even for a slug that does not exist. Only the v1 route returns 404.
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
  "og_image_url": null,
  "expired_url": null,
  "disabled_at": null,
  "disabled_reason": null,
  "archived_at": null,
  "deleted_at": null
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
| `expired_url`, `disabled`, `disabled_reason`, `archived` | | no | As on permanent links. The expiry is always the TTL: `expires_at` in the body answers `400`. |

How `ttlSeconds` is interpreted:

- It must be a JSON number when present, otherwise `400 {"error": {"code": "invalid_request", "message": "ttlSeconds must be a number"}}`.
- The value is floored to a whole number. `0`, or anything that floors to `0` (for example `0.5`), becomes `900`.
- Everything else is clamped to the range 60 to 2,592,000 (30 days): `30` becomes `60`, `-5` becomes `60`, `1e15` becomes `2592000`.
- `expires_at` is `created_at` plus the resulting `ttl_seconds`.

Other errors: `400 {"error": {"code": "invalid_request", "message": "Invalid slug"}}`, `400 {"error": {"code": "invalid_request", "message": "Invalid target: must be a valid http(s) URL"}}`, `409 {"error": {"code": "conflict", "message": "Slug already exists", "slug": "…"}}`. Invalid `og_*` values are rejected as on permanent-link create.

```bash title="A link for a CI build that expires in one hour"
dectog POST /api/v1/temp-links '{"target": "https://example.com/build/1234", "ttlSeconds": 3600}'
```

### Read, update and delete

| Route | Response |
|---|---|
| `GET /api/v1/temp-links/:slug` | `200` TempLink, or `404 {"error": {"code": "not_found", "message": "Temporary link not found"}}`. |
| `PUT /api/v1/temp-links/:slug` | Partial update of `target`, the three `og_*` fields and the lifecycle fields; absent keeps, `null` or `""` clears. Returns `200` TempLink, or `404 {"error": {"code": "not_found", "message": "Temporary link not found"}}`. The TTL and `expires_at` cannot be changed. |
| `DELETE /api/v1/temp-links/:slug` | `200 {"success": true}` after a soft delete, as for a permanent link; `?permanent=true` deletes the link with the same history cascade. `404 {"error": {"code": "not_found", "message": "Temporary link not found"}}` for a slug that is not yours. |
| `POST /api/v1/temp-links/:slug/restore` | `200` TempLink after restoring a deleted temporary link, or `404`. |

There is no list route for temporary links in the v1 API. The dashboard's `GET /api/admin/links` returns them under `temp_links`.

### Lifecycle after expiry

1. From `expires_at` on, a tap goes to the link's `expired_url`, or answers the `410` "Link expired" page, for bots too. No click is recorded. The link still exists.
2. `resolve` answers `410 link_expired`; `GET /api/v1/temp-links/:slug` keeps answering `200`.
3. The daily job (03:17 UTC) deletes temporary links whose `expires_at` is more than 24 hours in the past, except those with an `expired_url`, which keep sending taps there until you delete them. Their clicks and installs are kept, and the slug is free again. From then on the link URL answers 404 and the API answers `404`.
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
| `click_count` | number | `null` |
| `expires_at` | the expiry, or `null` | value |
| `ttl_seconds` | `null` | value |
| `metadata` | JSON or `null` | `null` |
| `ios_deep_link_path`, `android_deep_link_path` | string or `null` | `null` |

`id`, `slug`, `target`, `url` and `created_at` are filled for both kinds. Only a live link resolves: a paused one answers `410 {"error": {"code": "link_paused", "message": "This link is paused"}}`, an expired one `410 {"error": {"code": "link_expired", "message": "This link has expired", "expired_url": "…"}}` (`null` without one), and an unknown username or slug, or a deleted link, `404 {"error": {"code": "not_found", "message": "Link not found"}}`. The `og_*`, routing and tracking fields are not exposed here.
