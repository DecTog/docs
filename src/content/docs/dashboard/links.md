---
title: Links
description: Create permanent and temporary links, read the per-link numbers, edit tracking, previews and routing, and pause, expire, archive, delete and restore links.
sidebar:
  order: 2
---

The Links screen, at https://app.dectog.com/dashboard/links, is where you create the links people tap. Its header reads "Deep links that open your app, track installs and expire when you want." Next to it, **Templates** manages [link templates](#templates), **Import CSV** creates many links from a file ([Importing links](#importing-links)), and **New link** opens the create panel; the panel is always open while the account has no links.

On load the screen fetches your links, your apps (an account with exactly one app gets it preselected) and your username, which the deep-link previews use.

## Creating a link

The **New link** panel has four fields. Submit with **Create link**, or **Create temporary link** when an expiry is set. The button reads "Creating…" while the request runs. Errors appear in red next to the button, verbatim from the server. On success the form resets, the panel closes and the list switches to the matching tab.

| Field | What to enter | Rules |
|---|---|---|
| **Fallback URL** | Either **App fallback URL (default)**, which inherits the Fallback URL of the selected app, or **Custom URL** with an address (placeholder `https://destination.com`). For temporary links the first option reads **Default app fallback**. Hint: "Where this link points when the app can't serve it (desktop continue button, last mobile fallback). The default inherits the app's Fallback URL from the Apps page." | The app option is disabled, with the tooltip "Set a Fallback URL on the Apps page to enable", while the app has no Fallback URL; **Custom URL** is then the only choice. A custom URL must be http(s), otherwise the server replies `Invalid target: must be a valid http(s) URL`. |
| **Link URL** | The slug after your link domain (placeholder `launch`, or `auto` for temporary links). The prefix shows the host of your existing links, or `/` until you have one. | Letters, digits, `_` and `-` only, up to 128 characters. Required for permanent links (`Invalid or missing slug`). Optional for temporary links: leave it blank for a generated slug of the form `t_` plus 10 hex characters; the hint reads "Optional — leave blank for an auto-generated slug. Temporary links use your default app's routing and fallback." A slug must be unique across your permanent **and** temporary links, otherwise `Slug already exists`. |
| **App** | **Default app** or one of your apps. Tooltip: "App used for platform routing". Hidden for temporary links and when you have no apps. | **Default app** means your oldest app. The app decides store URLs, schemes, interstitial pages and the social preview for this link. |
| **Expires** | **Never** (default), **5 min**, **1 hour**, **1 day** or **7 days**. | Anything other than **Never** creates a temporary link. The dashboard offers only these four durations; the API accepts 60 seconds to 30 days. |

When the account has [templates](#templates), a **Template** box next to **App** picks one for a permanent link. A permanent link is sent to `POST /api/admin/links`; a temporary one to `POST /api/admin/temp-links` with the chosen `ttlSeconds`. Temporary links always route through the default app and have no click counter, no deep-link paths, no tracking fields and no routing overrides. See [Temporary links](/links/temporary-links/).

### Advanced options

**Advanced options** appears under the form for permanent links once the account has at least one app. Its header shows an orange chip for every section in use: `fallback URL`, `deep link`, `redirect`, `desktop fallback`, `tracking`.

#### Deep link · the route your app opens

Hint: "Optional app route this link opens — the path becomes the URI (e.g. scheme://login), so the app receives it exactly as typed. Without a path, links open scheme://username/slug. Schemes come from the selected app (manage them on the Apps page)."

| Field | What to enter | Rules |
|---|---|---|
| **iOS deep link path** | A route such as `products/42?color=black`. | Disabled, with the placeholder `no scheme set` and the hint "Set the iOS scheme on the Apps page to enable this path.", while the selected app has no iOS scheme. A live preview shows `scheme://path`, or `scheme://username/slug` while the box is empty. |
| **Android deep link path** | Same, for Android. | The same rules, with the Android scheme. |

Server rules for both paths: at most 512 characters; no `:`, whitespace, `#`, `;` or control characters, so no full URLs; a leading `/` is removed. The errors read `Invalid ios_deep_link_path: must be a relative path, not a full URL (no ":": no scheme, no spaces, no "#"/";")` and `Invalid ios_deep_link_path: deep link path is too long (max 512 chars)`, or the same with `android_deep_link_path`.

A `dec_deeplink` parameter on the tapped URL replaces the saved path for that tap; see [URL parameters](/links/url-parameters/).

#### Tracking · label, campaign, adgroup, creative

Hint: "Saved on every click of this link and returned to your app after install. Override any of them per share by adding ?dec_campaign=… (or dec_label, dec_adgroup, dec_creative) to the link URL."

| Field | Placeholder | Rules |
|---|---|---|
| **Label** | `partner-42` | Up to 255 characters, no control characters: `Invalid label: max 255 characters`. |
| **Campaign** | `spring_sale` | Same. |
| **Adgroup** | `instagram_stories` | Same. |
| **Creative** | `video_15s` | Same. |

These values are stored on every click of the link, can be overridden per tap with `dec_label`, `dec_campaign`, `dec_adgroup` and `dec_creative`, and come back to the app in the install verdict and in the `app.installed` webhook. They do not feed the Overview's campaign and source charts, which read `utm_campaign` and `utm_source`; see [Overview](/dashboard/overview/).

#### If the app isn't installed (mobile)

**App Store / Play Store (default)** sends a phone without the app to the store configured on the app: the App Store, Google Play, or the OEM store that matches the phone's brand. **Custom URL** (placeholder `https://promo.example.com/offer`) sends it to that address instead. When the custom address is itself a store page on an Apple, Google Play, Huawei, Samsung or Xiaomi host, DecTog adds its attribution tag to it; vivo store addresses are not tagged. Stored as `redirect_url`; must be http(s).

#### If the app can't open the link (desktop)

**Branded QR page (default)**, or **App fallback URL (default)** when the selected app has one, or **Custom URL** (placeholder `https://web.example.com/page`). Stored as `fallback_url`; must be http(s). This is the last stop for desktop visitors and for phones that have no destination at all. With no custom URL, the tap falls through to the app's Fallback URL and, if there is none, to the QR page.

The complete decision order for a tap is in [How a tap is routed](/links/how-a-tap-is-routed/). In short, on a phone the chain is: custom redirect, then the tagged store, then the app's Fallback URL (which outranks this link's own Fallback URL), then the link's Fallback URL. Desktop visitors are never redirected to the link's Fallback URL automatically; they get a "Continue to {host} on desktop" button on the QR page.

## The list

Two tabs, **Permanent {n}** and **Temporary {n}**, sit above a table. Next to them, **Active**, **Archived** and **Deleted** pick which links the tabs show: active links (paused and expired ones included), archived links, or deleted links, with a count once there is one. The **Search links** box filters the current tab in the browser, case-insensitively: slug, destination, campaign and label on the Permanent tab; slug and destination on the Temporary tab. There is no pagination; the screen loads every link.

### Permanent links

| Column | What it shows | Period |
|---|---|---|
| **Link** | `/slug`, which opens the live link in a new tab; a copy icon that turns into a check mark for 1.5 seconds; chips for the campaign and the label when set, and **Paused** (amber; hover for your reason), **Expired** (red; hover for where taps go) or **Archived**; underneath, the destination host and path, or `App fallback` when the link inherits the app's Fallback URL, then `· expires in 3d 4h` when an expiry is set. | |
| **Clicks** | The link's click counter. It increases on every web tap, every click reported by the SDK and every click the server reconstructs from an install referrer, and it never decreases. A green `+{n} 7d` underneath counts the clicks of the last 7 days. | Lifetime; the `7d` line covers a rolling 7 days |
| **Installs** | Installs matched to one of this link's clicks, excluding reinstalls. Underneath, `{n}% conv.` is installs ÷ the click counter, rounded to a whole percent, shown only when both are above 0. | Lifetime Click the number to list those installs; each opens the install detail described on [Overview](/dashboard/overview/#recent-installs). |
| **Opens** | Times this link opened the already installed app. | Lifetime |
| **Leads** | Events of type `lead` credited to this link: those from installs it brought, plus those within the re-engagement window after it re-opened the app. | Lifetime |
| **Revenue** | Net revenue (purchases minus refunds) credited to this link, in your revenue currency; `—` when 0. A second line, `… after re-open`, shows the part credited because the link re-opened the installed app within the app's re-engagement window. | Lifetime |
| **Created** | The creation date, such as `Oct 12, 2026`. | |

All per-link numbers are all-time totals, which is why they do not match the Overview's 7-, 30- or 90-day figures.

Each row ends with **Edit** (a pencil; the label reads "Edit (custom social preview)" and the icon carries a dot when the link has its own preview), **Pause** or **Resume**, **Archive** or **Unarchive**, and **Delete** (a trash can). On the **Deleted** view the row offers **Restore** and **Delete permanently** instead. See [Pausing, archiving and deleting](#pausing-archiving-and-deleting).

### Temporary links

| Column | What it shows |
|---|---|
| **Link** | `/slug`, the copy icon, and the destination or `App fallback`. |
| **Expires** | A red **Expired** chip, or a green countdown such as `42m left`, `3h 5m left` or `2d 4h left`. |

Temporary links show no click, install or revenue numbers.

**Delete expired** appears on the Temporary tab of the Active view once at least one link has expired. It asks "Delete ALL expired temporary links? This cannot be undone." and removes every temporary link whose expiry has passed. Their clicks and installs are kept, and their slugs become free again. The server's daily job does the same automatically 24 hours after a link expires, except for links with an expired URL, which keep sending taps there.

Empty states: "No permanent links yet.", "No temporary links. Pick an expiry when creating a link to make one." and "No links match your search."

## Templates

**Templates** opens a panel listing your templates with the fields each sets and how many links use it. **New template** and **Edit** show **Name**, **App for new links**, and the fields a template can fill: **Desktop destination**, **Mobile without the app**, the iOS and Android deep link paths, **Campaign**, **Label**, **Adgroup**, **Creative** and the UTM source, medium and campaign. A link that uses a template takes its value for every field the link leaves empty, at tap time: editing a template changes all its links. **Delete** asks first and names how many links use it; they keep their own fields and stop inheriting. The create form and the link drawer pick a template under **Template**. Fields only the API sets (the target, the social preview, the page settings) are kept when you edit a template here. See [Templates](/api/links/#templates).

## Importing links

**Import CSV** opens a panel with two column presets: **DecTog columns** (headers named like the API fields, such as `slug`, `target`, `campaign`, `utm_source`, `external_id`) and **Firebase Dynamic Links export** (see [Importing an FDL export](/guides/migrate-from-firebase-dynamic-links/#importing-an-fdl-export)). After you pick a file, the panel shows how many links it found, the first ten with notes (a row without a slug, `afl` and `ifl` that differ), and **Import {n} links**. Links are created 100 per request; the result reads "{n} created, {m} failed." with a table of the failed rows by line number and error. Nothing is created until you press the button.

## Editing a link

**Edit** opens a side drawer titled **Edit link** `/slug`. Permanent links get five blocks; temporary links get the expiry and the social preview.

### Template and tracking

Permanent links only. **Template** (when the account has templates) picks the link's template or **None**; an empty field below then shows the template's value as its placeholder, followed by "(template)". Below it, the label, campaign, adgroup and creative from the create form, and the link's **UTM source**, **UTM medium**, **UTM campaign**, **UTM term** and **UTM content** (added to its web destinations; see [Link-level UTM values](/links/url-parameters/#link-level-utm-values)), each up to 255 characters. **Save template and tracking** sends them all; an emptied field clears the stored value. The button is followed by "Saved" or the server's error.

### Expiry

**Expires at** (permanent links; a date and time in your browser's time zone, empty for never) and **After expiry, send visitors to** (a URL; empty serves a "Link expired" page with status 410). A temporary link shows its fixed expiry instead of the date box. While the link is paused, a third box, **Why it is paused (only you see this)**, edits the pause note. **Save expiry** sends the block. An expired link records no clicks: taps go straight to the URL, or get the 410 page.

### Geo and language routing

Permanent links only. **Add rule** adds a block with **Countries** (two-letter codes such as `DE, AT, CH`), **Languages** (such as `de`), and the destinations it replaces for a matching tap: **Desktop destination**, **Mobile without the app**, **iOS deep link path**, **Android deep link path** and **Fallback URL**. Empty fields keep the link's own. The first matching rule wins; **Move up** reorders and **Remove** deletes a rule. **Save rules** sends them all; the server's error, such as `routing_rules[0] needs countries or languages`, shows next to the button. Taps that match no rule are routed as usual. See [How a tap is routed](/links/how-a-tap-is-routed/#geo-and-language-routing).

### Preview

A card that mimics a social unfurl: the image (or "No image configured"), the title (or "Open in the app"), the link's domain and the description, with the note "Actual results, including image size, may vary across platforms."

Under the card, **Which social preview should this link use?** offers:

- **App preview** (marked **Default**), followed by the title of the app preview it would use. Choosing it clears the link's own preview on save, so the link falls back to the app's social preview and then to a generic "Open in the app" card.
- **Custom preview**, which reveals three fields.

| Field | What to enter | Rules |
|---|---|---|
| **Image URL** | An image address (placeholder `https://…/preview.jpg`). Hint: "JPG or PNG. Recommended size 1200 × 630 px (shown as a large card)." | http(s), or the server replies `og_image_url must be a valid http(s) URL`. |
| **Title** | Placeholder `My App`. Hint: "Recommended 30 to 60 characters. Maximum 150 characters." | The box stops at 150 characters; the server rejects longer values with `og_title must be at most 150 characters`. |
| **Description** (optional) | Hint: "Maximum 150 characters." | Same limit: `og_description must be at most 150 characters`. |

The card and the **App preview** line are built from the app currently selected in the **New link** form's App dropdown, or from your oldest app when nothing is selected there. The preview people actually see when they share the link is resolved by the server from the link, then the link's app, then a generic card; see [Social previews and QR](/links/social-previews-and-qr/).

At the bottom of the drawer, **Check the preview on each platform** asks for the link as the crawlers of Facebook, X, LinkedIn, Slack, Discord, WhatsApp, iMessage and Telegram do and shows, per platform, the title, description and thumbnail it gets with **Looks right**, **{n} issues** or **No preview**, and each issue in a sentence: no image, an image host that refuses that crawler, an image too large for the platform, an image address that is a page. It checks the saved link, so save first. See [Check the preview on each platform](/links/social-previews-and-qr/#check-the-preview-on-each-platform).

### Routing

Permanent links only.

| Field | Options |
|---|---|
| **iOS deep link path**, **Android deep link path** | Free text, placeholder `products/42?color=black`, with the same server rules as the create form. Each box is disabled, with the placeholder `no scheme set`, while the link's own app has no scheme for that platform, because a path is only used in a scheme URL. The drawer's app preview and fallback default also come from the link's own app. |
| **If the app isn't installed** | **App stores** (marked **Default**) or **Custom URL** (placeholder `https://promo.example.com/offer`). Sets `redirect_url`. |
| **Mobile landing pages** | **iOS tap-to-store page** and **Interstitial page**, each **App setting (on)** or **App setting (off)** (the default, following the link's app), **On for this link** or **Off for this link**. See [How a tap is routed](/links/how-a-tap-is-routed/#mobile-delivering-it). |
| **If the app can't open the link (desktop)** | **Branded QR page**, or **App fallback URL** when the link's app has one (marked **Default**), or **Custom URL** (placeholder `https://web.example.com/page`). Sets `fallback_url`. |

The last row sets the same `fallback_url` field, with the same labels, as the create form. The field is the desktop and no-destination tail: with no custom URL, a desktop visitor gets the app's Fallback URL if there is one, otherwise the branded QR page.

**Save** sends the preview choice and, for permanent links, every routing field at once; an emptied field clears the stored value. Before sending, the drawer checks "Enter the custom redirect URL" and "Enter the custom fallback URL" when a Custom URL option is selected with an empty box. Success shows "Saved ✓"; failures show the server's message.

## Pausing, archiving and deleting

| Action | What happens |
|---|---|
| **Pause** | Asks "Pause "{slug}"? Taps get a "link paused" page and nothing is recorded." with an optional reason that only you see. Every tap then gets a "Link paused" page with status 410, bots included, and nothing is counted: no click, no install credit, no app open. **Resume** turns it back on and clears the reason. |
| **Archive** | Moves the link to the **Archived** view. It keeps working and counting; archiving only tidies the list. **Unarchive** moves it back. |
| **Delete** | Asks "Delete link "{slug}"? It stops working and leaves this list. Its clicks, installs and revenue stay in your stats, and you can restore it from Deleted." The link answers 404, moves to the **Deleted** view, and keeps its slug: creating a link with that slug fails until you restore it or delete it permanently. Thirty days after the delete, its clicks and app opens lose their device data (IP hash, device id, user agent), the same anonymisation retention applies after `RETENTION_DAYS`; the counts stay. |
| **Restore** | On the **Deleted** view: the link works again, with its history. |
| **Delete permanently** | On the **Deleted** view; see below. |

### Delete permanently

The trash icon on the **Deleted** view asks:

> Delete "{slug}" permanently?
>
> This also deletes its {n} clicks, the installs, events and app opens attributed to it, and removes them from the Overview. This cannot be undone.

For temporary links the first line reads "its clicks" without a count.

Deleting permanently is a single atomic batch that removes, in this order:

1. the events attributed to the link, by slug or through one of its installs;
2. the app opens through the link, and the referrals it converted;
3. the `first_install_id` of customers whose first install came through the link (the customer record itself stays);
4. the installs matched to one of the link's clicks;
5. the link's clicks;
6. the link itself.

The Overview, the Customers screen and the per-link totals drop those rows immediately. The request succeeds even for a slug that no longer exists. If the request fails, the list reloads and shows "Could not delete "{slug}": …".

The slug is free again as soon as the link is gone, for permanent and temporary links alike.

:::note[Self-hosting]
Link URLs follow the deployment's URL mode: `https://{username}.{root-domain}/{slug}` in subdomain mode, `{base-url}/r/{username}/{slug}` in path mode. The [Settings](/dashboard/settings/) screen shows which one applies.
:::
