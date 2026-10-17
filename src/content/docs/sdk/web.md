---
title: Web pixel (dectog.js)
description: Credit sign-ups and purchases on your website to the link that brought the visitor, with a public site key, consent where the law asks for it, and no IP stored.
sidebar:
  order: 9
---

Your links also send people to your website: the desktop QR page's website link, a mobile custom redirect, a link whose target is a web page. `dectog.js` on that website reports what those visitors do there (a sign-up, a purchase) and DecTog credits it to the link they tapped, next to the app's installs and events. The Overview's Breakdown shows it under **Event source: web**, and the Links table in a **Web** column.

## Set it up

1. **Turn on the click id for those links.** In the link drawer, under Template and tracking, tick **Add the click id to website destinations** (`append_click_id: true` in the API, or in a template). The link then adds `dtg_click=<click id>` to its web destinations; never to an App Store or Play URL, an AppsFlyer, Adjust or Singular link, or an app scheme. A URL that already has `dtg_click` keeps it.
2. **Create a site key.** In **Settings > Site keys**, list the origins of your site, like `https://shop.example.com` (scheme, host and port; no path), and select **New site key**. A site key (`dtg_site_…`) is public: it sits in your page source, works only from the origins you listed, and can only record leads, purchases and custom events. It is not an SDK key and not the account key.
3. **Add the script** to every page, before your own code that calls it:

```html
<script>window.dectog = window.dectog || [];</script>
<script src="https://app.dectog.com/dectog.js" data-site-key="dtg_site_0123456789abcdef0123456789abcdef" async></script>
```

A self-hosted deployment serves it from its own `PUBLIC_BASE_URL`; the snippet in Settings has the right host. The script is about 2 KB gzipped and has no dependencies. A site with a Content-Security-Policy needs that host in `script-src` and `connect-src`.

## Track what happens

```js
dectog.track('signup');                                        // a lead
dectog.track('purchase', { revenue: 49.9, currency: 'EUR', order_id: 'A-1001' });
dectog.track('newsletter', { type: 'lead' });                  // any name, as a lead
dectog.track('viewed_pricing');                                // a custom event
```

| Name | Recorded as |
|---|---|
| `purchase` | A conversion. `revenue` is required; `currency` is an ISO code (the account's currency when left out). |
| `signup`, `lead` | A lead |
| anything else | A custom event, unless `type` says `lead` or `conversion` |

The second argument also takes `customer_id`, `metadata` (an object) and `event_id`. Pass `order_id` for every purchase: it becomes the event's id (`order-<order_id>`), so a reloaded thank-you page or a second tab never counts the order twice. Calls made before the script loaded wait in `window.dectog` when the page pushes them as `window.dectog.push(['track', 'signup'])`; the first line of the snippet makes that possible, and the snippet Settings copies has it. `push` keeps working once the script has loaded, so a page can use it for every call.

The event counts for the link of the click in `dtg_click` when the visitor landed with one (from the URL, else from the cookie), with that tap's country, campaign and UTM values in analytics. An event without a click, or with another account's click id, is stored without a link. Webhooks deliver leads and conversions as `event.lead` and `event.conversion` with `source: "web"`.

## Consent

`dectog.js` stores a first-party cookie, so where the law asks for consent first, it waits for it.

| `data-consent` on the script | Behaviour |
|---|---|
| `auto` (default) | The script asks the server where the visitor is. In the EU and EEA, the UK and Switzerland it stores nothing and sends nothing until `dectog.consent(true)`; elsewhere it starts at once. |
| `required` | Always waits for `dectog.consent(true)`. |
| `granted` | Your page already has consent; it starts at once. |

Call `dectog.consent(true)` or `dectog.consent(false)` from your consent banner. The answer is remembered in `dtg_consent` for a year; `false` also deletes the click cookie and drops anything queued. A browser that sends Global Privacy Control (Brave does by default) counts as no until the page calls `dectog.consent(true)`. The server enforces the same rule: from a consent country, or with a `Sec-GPC: 1` header, an event without `consent: true` is answered `202` and not stored.

| Cookie | Holds | Lifetime |
|---|---|---|
| `dtg_click` | The click id the visitor landed with | 30 days |
| `dtg_consent` | `1` or `0` | 365 days |
| `dtg_banner` | `closed`, when the visitor closed the app banner | 30 days |

All three are first-party, `SameSite=Lax`, and `Secure` on https pages. Web events never store an IP address; the server only hashes it for the rate limit.

## The app banner

```js
dectog.banner({ link: 'https://acme.dectog.com/app', text: 'Get the Acme app', button: 'Open' });
```

A bar at the bottom of the page (`position: 'top'` moves it) that opens a DecTog link, on iPhones, iPads and Android only unless `mobileOnly: false`. Point it at a link of yours, so the tap is a click like any other and the install that follows is attributed to it. Closing it hides it for 30 days when storing is allowed.

`dectog.clickId()` returns the click id the visitor came with, or `null`.

## The endpoints

`dectog.js` uses two routes; you can call them yourself.

| Route | Request | Answer |
|---|---|---|
| `GET /api/v1/web-config?k=<site key>` | From an allowed origin (`Origin` header) | `200 {consent_required, cookie_days}`, cached privately for an hour |
| `POST /api/v1/web-events` | `{k, click_id?, consent?, events: [{type, event_name?, revenue?, currency?, client_event_id?, customer_id?, metadata?}]}` as JSON (sent as `text/plain`, so no preflight), at most 20 events | `200 {accepted, duplicates, rejected: [{index, error}], credited_slug}`; `202` when consent is required and missing |

Errors: `401 invalid_site_key` for an unknown or revoked key, `403 origin_not_allowed` for a page origin the key does not list (or none), `400` for a batch with no valid event (`type` is `lead`, `conversion` or `custom`; `identify` belongs to the app), `413` past 20 events, `429` past 120 requests a minute from one network. The origin check keeps other sites from using your key in a browser; it is not authentication, since a script outside a browser can send any `Origin`.
