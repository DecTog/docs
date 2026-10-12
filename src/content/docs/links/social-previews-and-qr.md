---
title: Social previews and the QR page
description: What link unfurlers and bots receive, where the Open Graph title, description and image come from, the auto-fill from a web page, and the branded QR page desktop visitors land on.
sidebar:
  order: 4
---

Two kinds of visitors never go through the normal routing: link unfurlers, which get a page of Open Graph tags, and desktop visitors with nowhere to go, which get the branded QR page. Both pages use the social preview you configure per app and per link.

## Who gets the preview page

A request is treated as a bot when its user agent matches the bot list, or when Cloudflare's bot management reports a score below 30. The list is case-insensitive: the word `bot` on its own (so a Cubot phone does not match), `crawler`, `spider`, `facebookexternalhit`, `twitterbot`, `slackbot`, `whatsapp`, `telegrambot`, `linkedinbot`, `discordbot`, `googlebot`, `bingbot`, `preview`, `fetcher`, `monitor` and `headless`.

Bots receive a `200` page with Open Graph tags and no redirect, and **no click is recorded**. The page is served for permanent and temporary links alike; an expired temporary link answers `410` even to bots, and an unknown slug `404`.

## The tags

| Tag | Value |
|---|---|
| `og:title` and `<title>` | The link's title, else the temporary link's, else the app's, else `Open in the app` |
| `og:description` | The link's description, else the temporary link's, else the app's, else `Continue to {path or host} in the app.` built from the link's target or the app's fallback URL, or `Continue in the app.` when neither exists |
| `og:image` and `twitter:image` | The link's image, else the temporary link's, else the app's. Omitted when none is set. |
| `og:url` | The canonical link URL, `https://acme.dectog.com/welcome`, with no query string |
| `twitter:card` | `summary_large_image` when an image exists, else `summary` |

Each field falls back on its own, so a link with only a custom title still takes the app's image. The body holds a plain link to the target ("Redirecting to {target}") or, without one, "Open this link on your phone to continue in the app."; there is no meta refresh. The app used for the fallbacks is the link's app, or the account's default app for links without one and for temporary links.

## Setting the preview

| Level | Where | Fields |
|---|---|---|
| App | **Apps > Social sharing preview** | **Image URL**, **Title**, **Description (optional)**. Used for every link without its own preview. |
| Link | **Links > Edit > Which social preview should this link use?** | **App preview** (the default) or **Custom preview** with **Image URL**, **Title** and **Description**. Available for permanent and temporary links. |
| API | `og_title`, `og_description`, `og_image_url` on `POST`/`PUT /api/v1/links`, `/api/v1/temp-links` and the app routes | `null` or an empty string means "use the level above". |
| SDK | `ogTitle`, `ogDescription`, `ogImageUrl` on `createLink`, `updateLink`, `createTempLink`, `updateTempLink` | Same semantics. |

Limits: the title and the description are each at most 150 characters after trimming; the image must be an http(s) URL. The editor hints "Recommended 30 to 60 characters. Maximum 150 characters." for titles. Choosing **App preview** in the editor clears a link's custom fields.

Use a 1200 × 630 px JPG or PNG. That is the size the link editor recommends and the size large-image cards expect; the Apps form still hints 200 × 200 px, but the same 1200 × 630 px image works best there too. Previews are cached by each platform, so a change can take a while to show up in an existing chat or post.

## Auto-fill from a web page

On the Apps page, **Auto-fill from fallback URL** reads the Open Graph tags of the app's Fallback URL and fills the empty preview fields; existing values are kept. It appears once the Fallback URL is a valid http(s) address and at least one preview field is empty, and reports "Filled from your fallback URL" on success, with a reminder to review and save.

The fetch runs server-side (`GET /api/admin/og-preview?url=`) with these rules:

| Rule | Value |
|---|---|
| Allowed URLs | Public http(s) only. `localhost`, `*.local`, `*.internal`, the private, loopback, link-local and carrier-grade NAT IPv4 ranges, `::1` and `fc`/`fd`/`fe80` IPv6 addresses are refused with "Enter a valid public http(s) URL". |
| Request | Follows redirects, identifies as `DecTogBot/1.0` with a `facebookexternalhit/1.1` token so sites serve their crawler tags, 8-second timeout, reads at most 512 KB. |
| Title | `og:title`, then `twitter:title`, then `<title>` |
| Description | `og:description`, then `twitter:description`, then the `description` meta tag |
| Image | `og:image:secure_url`, then `og:image`, then `twitter:image`, then `twitter:image:src`, resolved to an absolute http(s) URL |
| Precedence | The first occurrence of each tag wins |
| Length | Title and description are cut to 150 characters with an ellipsis |

Errors: "Enter a valid http(s) URL", "Enter a valid public http(s) URL", "Couldn't reach that URL", "That URL returned HTTP {status}", "That URL isn't an HTML page" and "No title, description or image found on that page".

## The QR page

Desktop visitors land on the QR page when no other destination applies: no `dec_redirect` or `dec_fallback` on the URL, no custom desktop fallback on the link, no Fallback URL on the app. Mobile visitors see it only when they have no destination at all (no store URL, no custom redirect, no app fallback, no target). The visit records a click.

| Element | Content |
|---|---|
| Brand line | The app's name, else "DecTog" |
| QR code | An SVG (220 px) of the canonical link URL, `https://acme.dectog.com/welcome`, without any query string. Scanning it is a fresh mobile tap with its own click and store tag. |
| Heading | "Scan to open on your phone", then "Point your camera at the code to continue to {host} in the app." when a target exists |
| Store buttons | **App Store** and **Google Play**, linking to the plain store URLs without an attribution tag |
| Scheme buttons | **Open in the iOS app** and **Open in the Android app**, one per configured scheme, or a single **Open in app** when both platforms share a scheme (the Android deep-link path is preferred). These carry no `dtg_click`. |
| Continue link | "Continue to {host} on desktop", only when the link has a target or inherits an app fallback |
| Footer | "Powered by DecTog" when the page is branded with an app name |

The page's own Open Graph tags come from the app only (title, description, image and the canonical `og:url`); link-level previews do not apply here, because unfurlers never reach this page. The scheme buttons use the link's deep-link paths or a `dec_deeplink` from the URL; without a path they open `scheme://acme/welcome`.
