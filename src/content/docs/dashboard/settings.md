---
title: Settings
description: Your account details, the account key for servers and the SDK keys for apps, how to view, copy, create, revoke and regenerate them, the link configuration of the deployment, and the audit log of every change.
sidebar:
  order: 5
---

The Settings screen, at https://app.dectog.com/dashboard/settings, has up to ten cards: **Account**, **Account key**, **SDK keys**, **Link configuration**, **Site keys**, **Custom domain**, **Team**, **Test environment**, **Audit log** and **Flutter SDK quickstart**. Which you see depends on your [role](/dashboard/account-and-sign-in/#teams) in the account: **Account key** is for owners; **SDK keys**, **Team** and **Audit log** are hidden from viewers; only owners can change the revenue currency and the retention window. Messages appear in a banner under the title: green for a copied or regenerated key, red for an error.

## Account

| Field | Value |
|---|---|
| **Email** | The email you sign in with. |
| **Username / subdomain** | Your username, which is also the host of your links: `https://{username}.dectog.com/{slug}`. |
| **Revenue currency** | The currency every revenue total is in, EUR by default; one of the about 30 currencies the European Central Bank publishes reference rates for. Changing it converts every stored amount again. See [Revenue](/sdk/revenue/). |
| **Data retention** | How many days the account keeps raw taps, installs, events and app starts, 1 to the deployment's maximum (400 on the hosted service). Empty keeps the maximum. **Save** applies it from the next daily run (03:17 UTC): older rows lose their personal columns, or go once the daily totals hold their day; totals stay. See [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/#anonymization-sweep-daily). |

Apart from the revenue currency and the retention window nothing on this card is editable. There is no way to rename the account, change its email or delete it; see [Account and sign-in](/dashboard/account-and-sign-in/).

## Account key

The key your servers and scripts authenticate with. It has every scope, including creating, changing and deleting links, so it never goes into an app: apps get an [SDK key](#sdk-keys). It is `dtg_` followed by 32 lowercase hex characters, 36 characters in total. Only owners see this card.

The key is shown once: on the "Account created" screen after sign-up, and right after **Regenerate**. DecTog keeps only its SHA-256 and its first 8 characters, so the card shows those characters followed by dots, for example `dtg_3f9a••••••••••••••••••••••••••••`, and nobody, DecTog included, can show the key again.

| Action | What happens |
|---|---|
| **Regenerate** (red) | Asks "Regenerate the account key? Servers and scripts that use it must be updated; SDK keys are not affected." and then replaces the key in one step. The new key is shown in full with **Copy**, and "New account key generated. Copy it now: it is not shown again. The old key no longer works." Requests that use the old key fail with `401` (`invalid_api_key`) from that moment on. There is no grace period and no password prompt. |
| **Copy** | Shown only with a key just generated: copies it and shows "Account key copied to clipboard." |

Hint under the key: "Full access, including creating and deleting links: use it on your servers and in scripts, never in an app. It is shown once, when created; if it is lost, Regenerate replaces it at once."

## SDK keys

The keys your apps ship with, `dtg_pub_` followed by 32 hex characters. Anyone can extract a key from an app build, so an SDK key can only register installs, report clicks, events and opens, pull the attribution verdict, read links and create temporary links. Creating, changing or deleting links needs a key created with **Allow creating and changing links (links:write)**. See [Authentication](/api/overview/#authentication) for the scopes route by route.

A new account starts with one SDK key, "App key". The card lists every key with its name, the full key, its scope chips, when it was created and last used (stamped at most once an hour), and **Copy** and **Revoke** buttons. Revoked keys stay listed, greyed out, with the date.

| Action | What happens |
|---|---|
| **Create SDK key** | Creates a key with the name in the box (default "App key") and, when ticked, the links:write scope. An account can hold 20 active SDK keys. |
| **Copy** | Copies the full key. |
| **Revoke** | Asks for confirmation, then refuses the key at once: calls answer `401` with code `revoked_api_key`. Release a build with a new key before you revoke the old one. |

### How the keys are stored

Requests are authenticated with a SHA-256 hash of the key; the first characters are kept for display. The account key is stored that way only. SDK and site keys also keep an AES-256-GCM encrypted copy, under a key derived from the deployment's `JWT_SECRET`, so this page can show them again: an SDK key ships inside your app and a site key sits in your pages, so a copy gives nothing away that a build does not. On a deployment whose `JWT_SECRET` changed since a key was created, that key shows masked; revoke it and create another. How requests are authenticated and signed is in [API overview](/api/overview/).

## Link configuration

Read-only facts about the deployment that serves your links.

| Field | Value |
|---|---|
| **URL mode** | **Wildcard subdomain** on the hosted service: links are `https://{username}.dectog.com/{slug}`. **Path-based (workers.dev / dev)** on deployments without a wildcard domain: links are `{base-url}/r/{username}/{slug}`. |
| **Root domain** | The domain under which link hosts live: `dectog.com` on the hosted service. |
| **Example link** | Your link URL for the slug `welcome`, in the mode above, or on your custom domain once it is active. |

Both forms are explained in [Concepts](/start/concepts/).

## Site keys

Keys for [`dectog.js`](/sdk/web/) on your website. **New site key** takes a name and the sites allowed to use it (origins such as `https://shop.example.com`, one per line). Each key shows its sites, when it was last used, the `<script>` snippet with **Copy snippet**, **Sites** to change the list and **Revoke**. A site key is public by design; it works only from its sites and only records leads, purchases and custom events.

## Custom domain

Your links on a subdomain of your own, like `go.yourbrand.com`. Enter it and select **Add**; the card then shows the DNS records to add (two TXT records, then the CNAME), a status chip (**Waiting for DNS**, **Issuing certificate**, **Ready: point the CNAME**, **Active**, **No longer points here**, **Failed**, or **Removed**), Cloudflare's own message while it waits, **Check now** and **Remove**. While the domain is pending, the card checks again every minute on its own. Select a record's name or value to copy it. A removed domain shows when it will be deleted, and **Restore**. On a deployment without Cloudflare for SaaS the card says custom domains are not set up. The whole flow is in [Custom domains](/links/custom-domains/).

## Team

The people who work in this account: the account itself (always an owner), then each member with their role. Owners change a role with its menu, **Remove** someone, and invite by email: enter the address, choose **member**, **viewer** or **owner**, and select **Invite**. The invite email's link works 7 days, once, for that address only; pending invites are listed with **Revoke** (at most 20 at a time). Someone who belongs to the account but does not own it sees **Leave {account}** at the bottom. What each role can do is in [Teams](/dashboard/account-and-sign-in/#teams).

## Test environment

A second account, `t-<username>`, for debug builds. **Create test environment** makes it with copies of your apps and link templates and shows its first SDK key; the key is also listed under **SDK keys** in the test environment. Put that key in debug builds: their installs, events, customers and links stay out of your live numbers, and test links carry `t-<username>` where yours carry your username (`https://t-acme.dectog.com/<slug>` on the hosted service), so add that host to the debug build's associated domains.

Once it exists, a **Live** / **Test** switch sits at the top of the sidebar. In the test environment every page shows the test account, an amber banner says so, and **Back to live** returns. Keys you create there are test keys; the custom domain stays with the live account. Changes made there are recorded in the test environment's own audit log, under your email. The test environment is never signed in to on its own: it has no password.

## Audit log

Every change to the account, newest first, 25 at a time (**Show older** loads more):

- links, temporary links, link templates, apps, webhooks, SDK keys, site keys, the account key, the custom domain and the revenue currency, whether changed in the dashboard or through the API;
- every sign-in, wrong password, sign-out and password reset;
- every CSV export.

Each entry has its number, when it happened, what happened and to what (the link, app, key or webhook), who did it, and the fields that changed, before and after. Who is the email of the person signed in, the account key (by its prefix), an SDK key (by name and prefix), **DecTog** for changes DecTog made itself, or **Someone not signed in** for a wrong password or a reset request. DecTog's own changes are a webhook turned off after 20 failed deliveries, a custom domain's status moving (for example to **Active**), and a removed domain deleted at the end of its grace.

What is never recorded:

- **Secrets.** A key, a webhook secret, a password or a token never enters the log. A field whose name or value looks like one shows as `[redacted]`. A webhook URL is kept as its origin only (`https://hooks.slack.com`), because the path of a Slack-style URL is a credential.
- **IP addresses.** The log keeps the same salted hash as clicks.

What is not recorded: what apps and websites report (installs, clicks, events, opens, pings), the share links apps make (temporary links and referral links through the SDK), store notifications, and the card's own once-a-minute domain check. A change that fails, and deleting something that is not there, write nothing. A wrong password is recorded only when the email belongs to an account, in that account's log.

Entries are numbered 1, 2, 3… and are never changed or removed. **Check for gaps** confirms the numbering has no hole ("Complete: 42 entries, numbered 1 to 42 with none missing") or lists the missing numbers. The numbering shows a deleted entry. It cannot show an entry rewritten by someone with direct access to the database: the log is a plain append-only table, not a hash chain. The log is kept as long as the account. The same entries come from [`GET /api/admin/audit`](/api/admin-api/#audit-log).

## Flutter SDK quickstart

A code block you can paste into your app:

```dart
await dectog.initialize(DectogConfig(
  apiKey: 'dtg_pub_…',
  baseUrl: 'https://app.dectog.com',
));
```

The snippet uses your first active SDK key, never the account key. Without an SDK key it says "create an SDK key above". The `baseUrl` is the deployment's public base URL; on the hosted service it matches the SDK's default, `https://app.dectog.com`, and can be left out. See [Initialize and handle links](/sdk/initialize-and-handle-links/).

:::note[Self-hosting]
**URL mode**, **Root domain** and the snippet's `baseUrl` come from the worker's `LINK_URL_MODE`, `ROOT_DOMAIN` and `PUBLIC_BASE_URL` variables; a root domain that starts with `localhost` forces path mode. See [Configuration reference](/self-hosting/configuration-reference/).
:::
