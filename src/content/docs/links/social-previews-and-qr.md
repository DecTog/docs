---
title: Social previews and the QR page
description: What link unfurlers and bots receive, where the Open Graph title, description and image come from, the auto-fill from a web page, and the branded QR page desktop visitors land on.
sidebar:
  order: 4
---

Two kinds of visitors never go through the normal routing: link unfurlers, which get a page of Open Graph tags, and desktop visitors with nowhere to go, which get the branded QR page. Both pages use the social preview you configure per app and per link.

## Who gets the preview page

A request is treated as a bot when it is a `HEAD` request or when its user agent matches the bot list. The list is case-insensitive: the word `bot` on its own (so a Cubot phone does not match), `crawler`, `spider`, `facebookexternalhit`, `twitterbot`, `slackbot`, `whatsapp`, `telegrambot`, `linkedinbot`, `discordbot`, `googlebot`, `bingbot`, `applebot` (Apple's crawler for Siri and Spotlight), `redditbot`, `pinterestbot`, `cardyb` (Bluesky), `mastodon/`, `embedly`, `iframely`, `skypeuripreview` (Teams and Skype), `preview`, `fetcher`, `monitor` and `headless`. Pinterest's crawler is matched under each of the three user agents it documents (`Pinterest/0.2 (+https://www.pinterest.com/bot.html)`, `Mozilla/5.0 (compatible; Pinterestbot/1.0; …)` and an Android-looking one that ends the same way). The Pinterest in-app browser, which real people use, says `[Pinterest/iOS]` without `bot` and is not matched.

Bots receive a `200` page with Open Graph tags and no redirect, and **no click is recorded**. A `HEAD` request gets the same status and headers with no body. The page is served for permanent and temporary links alike; an expired temporary link answers `410` even to bots, and an unknown slug `404`.

Search engines are bots too: Google, Bing and the other crawlers on the list may read a link, but the page tells them not to index it, so links (an invite that carries its sender, for example) stay out of search results. The fetchers that social and chat platforms use to draw a card index nothing, and get the page without that instruction. A crawler the list does not know is treated as a visitor: it is redirected like one, or gets [the QR page](#the-qr-page), which says `noindex` as well.

## The tags

| Tag | Value |
|---|---|
| `og:title` and `<title>` | The link's title, else the temporary link's, else the app's, else `Open in the app` |
| `og:description` | The link's description, else the temporary link's, else the app's, else `Continue to {host}{path} in the app.` (for example `Continue to example.com/sale in the app.`, or `Continue to example.com in the app.` for a bare domain) built from the link's target or the app's fallback URL, or `Continue in the app.` when neither exists |
| `og:image` and `twitter:image` | The link's image, else the temporary link's, else the app's. Omitted when none is set. |
| `og:url` | The canonical link URL, `https://acme.adto.app/welcome`, with no query string |
| `og:type` | `article` when the title and the description both come from the link, the temporary link or the app; `website` when either one is the generic copy |
| `og:site_name` | The app's name. Omitted for an account without an app. |
| `twitter:card` | `summary_large_image` when an image exists, else `summary` |
| `robots` | `noindex`, for every crawler except the platforms' link-preview fetchers: Facebook, X, LinkedIn, Pinterest, Slack, Discord, WhatsApp, iMessage, Telegram, Reddit, Bluesky, Mastodon, Embedly, Iframely, Teams and any agent that says `preview` |

Each field falls back on its own, so a link with only a custom title still takes the app's image. The body holds a plain link to the target ("Redirecting to {target}") or, without one, "Open this link on your phone to continue in the app."; there is no meta refresh. The app used for the fallbacks is the link's app, or the account's default app for links without one and for temporary links.

## Pinterest Rich Pins

Pinterest saves a page as an **Article Rich Pin** when it says `og:type` `article` and has a title and a description: the Pin then carries that title and description, and Pinterest keeps them in step with the page. A link's preview page says exactly that once its title and description are yours, so there is nothing more to set up in AdTo:

- Give the link, or its app, a **title** and a **description**. With only the generic copy the page stays a `website`, which Pinterest saves as a plain Pin.
- Give it an **image**. A Pin is a picture, so a link without one has nothing to save.
- The site name Pinterest reads is the app's name (`og:site_name`).

Pinterest reads the tags when someone saves the link, says a Pin can take up to 24 hours to pick them up, and decides for itself what it shows as an article. Its help centre says pages with these tags become Rich Pins without a request, while its developer pages still speak of applying; if Pinterest asks you to validate a page, give it a link that has a title, a description and an image. [Check the preview on each platform](#check-the-preview-on-each-platform) tells you whether a link meets the conditions. Product and recipe Rich Pins need a price or recipe markup, which a link page does not carry.

## Setting the preview

| Level | Where | Fields |
|---|---|---|
| App | **Apps > Social sharing preview** | **Image URL**, **Title**, **Description (optional)**. Used for every link without its own preview. |
| Link | **Links > Edit > Which social preview should this link use?** | **App preview** (the default) or **Custom preview** with **Image URL**, **Title** and **Description**. Available for permanent and temporary links. |
| API | `og_title`, `og_description`, `og_image_url` on `POST`/`PUT /api/v1/links`, `/api/v1/temp-links` and the app routes | `null` or an empty string means "use the level above". |
| SDK | `ogTitle`, `ogDescription`, `ogImageUrl` on `createLink`, `updateLink`, `createTempLink`, `updateTempLink` | Same semantics. |

Limits: the title and the description are each at most 150 characters after trimming; the image must be an http(s) URL. The editor hints "Recommended 30 to 60 characters. Maximum 150 characters." for titles. Choosing **App preview** in the editor clears a link's custom fields.

Use a 1200 × 630 px JPG or PNG. That is the size the link editor recommends and the size large-image cards expect; the Apps form still hints 200 × 200 px, but the same 1200 × 630 px image works best there too. Previews are cached by each platform, so a change can take a while to show up in an existing chat or post.

## Check the preview on each platform

The link drawer's **Check the preview on each platform** (`GET /api/admin/links/:slug/preview-check`) shows what nine platforms get for a link, as their crawlers ask for it. Pick a platform to see its card drawn the way that platform shows it:

| Platform | User agent it is checked with |
|---|---|
| Facebook | `facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)` |
| X | `Twitterbot/1.0` |
| LinkedIn | `LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)` |
| Pinterest | `Mozilla/5.0 (compatible; Pinterestbot/1.0; +https://www.pinterest.com/bot.html)` |
| Slack | `Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)` |
| Discord | `Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)` |
| WhatsApp | `WhatsApp/2.23.20.0 A` |
| iMessage | a Safari user agent ending in `facebookexternalhit/1.1 Facebot Twitterbot/1.0` |
| Telegram | `TelegramBot (like TwitterBot)` |

The link is rendered through the redirect engine itself with each user agent, so the check sees exactly what the engine answers that crawler, and records no click. A crawler the engine took for a person would be redirected (or get the QR page); the check then fetches that destination as the platform would and reports "not taken for a crawler" with the title it shows instead. The preview image is fetched over the network with each crawler's user agent, because image hosts and CDNs often refuse some of them.

| Issue | Meaning |
|---|---|
| No title | The platform shows the bare address. |
| No image | A card without a picture. On Pinterest, nothing to save as a Pin. |
| The image host refused … (HTTP 401, 403 or 429) | That platform shows no picture; allow its crawler on your image host. |
| The image is … MB | X and LinkedIn skip images over 5 MB, Facebook over 8 MB. |
| The image address answers … rather than an image | The URL is a page, not a picture. |
| X shows the picture as a small square | `twitter:card` is not `summary_large_image`. The link page sets it whenever there is an image. |
| Pinterest saves this as a plain Pin, not a Rich Pin | The page is not an article with a title and a description. Give the link, or its app, both. |

## Auto-fill from a web page

On the Apps page, **Auto-fill from fallback URL** reads the Open Graph tags of the app's Fallback URL and fills the empty preview fields; existing values are kept. It appears once the Fallback URL is a valid http(s) address and at least one preview field is empty, and reports "Filled from your fallback URL" on success, with a reminder to review and save.

The fetch runs server-side (`GET /api/admin/og-preview?url=`) with these rules:

| Rule | Value |
|---|---|
| Allowed URLs | Public http(s) only. `localhost`, `*.local`, `*.internal`, the private, loopback, link-local and carrier-grade NAT IPv4 ranges, `::1` and `fc`/`fd`/`fe80` IPv6 addresses are refused with "Enter a valid public http(s) URL". |
| Request | Follows redirects, identifies as `AdToBot/1.0` with a `facebookexternalhit/1.1` token so sites serve their crawler tags, 8-second timeout, reads at most 512 KB. |
| Title | `og:title`, then `twitter:title`, then `<title>` |
| Description | `og:description`, then `twitter:description`, then the `description` meta tag |
| Image | `og:image:secure_url`, then `og:image`, then `twitter:image`, then `twitter:image:src`, resolved to an absolute http(s) URL |
| Precedence | The first occurrence of each tag wins |
| Length | Title and description are cut to 150 characters with an ellipsis |

Errors: "Enter a valid http(s) URL", "Enter a valid public http(s) URL", "Couldn't reach that URL", "That URL returned HTTP {status}", "That URL isn't an HTML page" and "No title, description or image found on that page".

## Download a QR code

Open a permanent link in **Links** to preview its QR code, then choose **Download SVG** or **Download PNG**. The preview shows the SVG; both formats encode the same public link. The SVG can
be scaled for print or placed in a digital campaign. It encodes the public link,
so changing the link's saved destination also changes where a printed code sends people.

Scripts can download the same file with a signed
`GET /api/v1/links/{slug}/qr.svg` request using a key with `links:read` scope.
The response is an `image/svg+xml` attachment named `{slug}-qr.svg`.
Use `/qr.png` instead for a 1024 × 1024 PNG (`image/png`) named `{slug}-qr.png`,
with the same signature and scope requirements.

Downloading records no click. Scans count as ordinary taps, without a separate scan
label or tracking-parameter override. Paused or expired links still follow their current
pause or expiry settings. Deleted and unknown links return 404. Downloads currently
support permanent links with a four-module margin. In
[Settings → QR code style](/dashboard/settings/#qr-code-style), owners can change the
pattern, corner borders and centers, colors, and PNG/JPG logo. The saved style applies
to both downloads and the link drawer preview. Already downloaded images retain
their design. Temporary links and bulk downloads are not supported.

## The QR page

Desktop visitors land on the QR page when no other destination applies: no `adto_redirect` or `adto_fallback` on the URL, no custom desktop fallback on the link, no Fallback URL on the app. Mobile visitors see it only when they have no destination at all (no store URL, no custom redirect, no app fallback, no target). The visit records a click.

| Element | Content |
|---|---|
| Brand line | The app's name, else "AdTo" |
| QR code | An SVG (220 px) of the canonical link URL, `https://acme.adto.app/welcome`, without any query string. Scanning it is a fresh mobile tap with its own click and store tag. |
| Heading | "Scan to open on your phone", then "Point your camera at the code to continue to {host} in the app." when a target exists |
| Store badges | Apple's **Download on the App Store** badge (the US/UK one in every language) and Google's **Get it on Google Play** badge in the page's language, linking to the plain store URLs without an attribution tag |
| Scheme buttons | **Open in the iOS app** and **Open in the Android app**, one per configured scheme, or a single **Open in app** when both platforms share a scheme (the Android deep-link path is preferred). These carry no `adto_click`. |
| Continue link | "Continue to {host} on desktop", only when the link has a target or inherits an app fallback |
| Footer | "Powered by AdTo" when the page is branded with an app name |
| Search engines | The page says `noindex`, like every page a link shows people |

The texts are in the visitor's language (English, German, French, Spanish or Italian), and which button the visitor took is recorded on the click; see [The link pages](/links/how-a-tap-is-routed/#the-link-pages). The page's own Open Graph tags come from the app only (title, description, image and the canonical `og:url`); link-level previews do not apply here, because unfurlers never reach this page. The scheme buttons use the link's deep-link paths or a `adto_deeplink` from the URL; without a path they open `scheme://acme/welcome`.
