---
title: Temporary links
description: Links that expire after a TTL of 60 seconds to 30 days, how they route, what happens at expiry and when they are deleted.
sidebar:
  order: 5
---

A temporary link is a slug with an expiry. It routes like a permanent link until `expires_at` passes, then sends taps to its expired URL or answers `410`, and without an expired URL is deleted a day later. Use them for one-off shares, invites, QR codes on printed material with a deadline, or links minted by a script for a campaign.

## Differences from permanent links

| | Permanent | Temporary |
|---|---|---|
| Expiry | Never | `ttl_seconds` after creation, 60 seconds to 30 days |
| Slug | Required | Optional; auto-generated as `t_` plus 10 hex characters |
| App | The link's app, else the default app | Always the account's default (oldest) app |
| Target | Optional; `null` inherits the app's fallback URL | Same |
| Deep-link paths, custom mobile redirect, custom desktop fallback, Tracking defaults | Yes | No |
| `dec_*` and `utm_*` on the shared URL | Applied | Applied the same way, except that the tracking values have no link defaults to fall back to |
| Social preview | Per link, else the app's | Per link, else the app's |
| Lifetime click counter | `click_count` | None (`null` in the resolve response) |
| Per-link numbers in the Links list | Clicks, installs, opens, leads, revenue | Only the expiry |

Slugs share one namespace: a temporary link cannot take a permanent link's slug and vice versa. The API answers `409 {"error":{"code":"conflict","message":"Slug already exists","slug":"..."}}`.

## Creating one

| Where | How |
|---|---|
| Dashboard | **Links > New link**, then pick an **Expires** value other than **Never**: **5 min**, **1 hour**, **1 day** or **7 days**. The slug box reads `auto` and may stay empty. The button becomes **Create temporary link**, and the list switches to the **Temporary** tab. |
| API | `POST /api/v1/temp-links` with `ttlSeconds` (a number; omitted means 900), an optional `slug`, an optional `target` and optional `og_*` fields. The admin route `POST /api/admin/temp-links` takes the same body. |
| SDK | `dectog.createTempLink(target: ..., slug: ..., ttlSeconds: 3600)`; `ttlSeconds` defaults to 900. |

`ttlSeconds` is floored to a whole number and clamped to the range 60 to 2,592,000 (30 days). A value of `0` becomes the default of 900 seconds. A non-numeric value is rejected with `400 {"error":{"code":"invalid_request","message":"ttlSeconds must be a number"}}`. The response carries `expires_at` and `ttl_seconds`:

```json title="POST /api/v1/temp-links → 201"
{
  "id": "…",
  "slug": "t_3f9a1c27b0",
  "target": "https://example.com/offer",
  "url": "https://acme.dectog.com/t_3f9a1c27b0",
  "expires_at": "2026-10-13T09:15:00.000Z",
  "created_at": "2026-10-12T09:15:00.000Z",
  "ttl_seconds": 86400,
  "og_title": null,
  "og_description": null,
  "og_image_url": null
}
```

## Routing

A tap follows the normal engine with the default app's store URLs, schemes, interstitial and tap-to-store settings, and its fallback URL. Because a temporary link has no deep-link paths, scheme and intent URLs open `scheme://acme/{slug}` unless the shared URL carries `dec_deeplink`. There is no per-link mobile redirect or desktop fallback, so on desktop the chain is `dec_redirect_<os>` or `dec_redirect`, then `dec_fallback`, the app's fallback URL, then the QR page. See [How a tap is routed](/links/how-a-tap-is-routed/).

Installs attribute to temporary links like to permanent ones. The verdict then carries `username` and `slug` but no `link` object, and `custom_params` is `null`, because temporary links have no metadata.

## Editing

The edit drawer on the **Temporary** tab and `PUT /api/v1/temp-links/{slug}` (SDK: `updateTempLink`) can change the target and the social preview; the drawer and the API also set the expired URL, and pause, archive or delete the link like a permanent one ([Dashboard: Links](/dashboard/links/#pausing-archiving-and-deleting)). The TTL and the expiry cannot be changed; create a new link instead.

## Expiry lifecycle

| Phase | Tap on the link | `GET /api/v1/resolve/{username}/{slug}` | Dashboard |
|---|---|---|---|
| Before `expires_at` | Routed normally | `200` with `type: "temporary"`, `expires_at`, `ttl_seconds` | Green chip with the time left, for example "3h 5m left" |
| After `expires_at`, before the daily delete | A `302` to the link's expired URL when it has one, else a `410` page "Link expired" / "This link has expired and is no longer available.", for bots too. No click is recorded. | `410 {"error":{"code":"link_expired","expired_url":…}}` | Red **Expired** chip; the **Delete expired** button appears |
| After the daily delete | `404` page "Link not found" | `404 {"error":{"code":"not_found","message":"Link not found"}}` | In the **Deleted** view |

The daily cron at 03:17 UTC deletes temporary links whose `expires_at` is more than 24 hours in the past and that have no expired URL; a link with one keeps redirecting there until you delete it. A link expires at a precise second but can therefore stay visible as an expired link for up to two days. The delete is a soft one, like the trash icon's: the link's history stays, and so does its slug, which a new link cannot take (`409`, "Slug belongs to a deleted link") until you restore the link or delete it permanently. That way a new link never inherits an old one's clicks and revenue.

## Deleting and what is kept

| Action | Removes the link | Removes its data |
|---|---|---|
| Trash icon on a row, `DELETE /api/v1/temp-links/{slug}`, `deleteTempLink` | Hides it (404 on tap), restorable from the **Deleted** view or with `POST /api/v1/temp-links/{slug}/restore` | No |
| **Delete permanently** on the **Deleted** view, `?permanent=true`, `deleteTempLink(slug, permanently: true)` | Yes | Yes: its clicks, and the installs, events and app opens attributed to it, which then disappear from the Overview |
| **Delete expired** (confirm "Delete all expired temporary links? They leave this list. Their clicks, installs and revenue stay in your stats, and you can restore them from Deleted.") | Hides every link whose `expires_at` has passed, restorable from **Deleted** | No: clicks and attributed installs stay in the analytics |
| Daily delete | Hides links expired more than 24 hours ago, restorable | No |

The **Delete expired** button calls `DELETE /api/admin/temp-links/expired`; the v1 API has no bulk route.
