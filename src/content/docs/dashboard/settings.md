---
title: Settings
description: Your account details, the account key for servers and the SDK keys for apps, how to view, copy, create, revoke and regenerate them, and the link configuration of the deployment.
sidebar:
  order: 5
---

The Settings screen, at https://app.dectog.com/dashboard/settings, has five cards: **Account**, **Account key**, **SDK keys**, **Link configuration** and **Flutter SDK quickstart**. Messages appear in a banner under the title: green for a copied or regenerated key, red for an error.

## Account

| Field | Value |
|---|---|
| **Email** | The email you sign in with. |
| **Username / subdomain** | Your username, which is also the host of your links: `https://{username}.dectog.com/{slug}`. |
| **Revenue currency** | The currency every revenue total is in, EUR by default; one of the about 30 currencies the European Central Bank publishes reference rates for. Changing it converts every stored amount again. See [Revenue](/sdk/revenue/). |

Apart from the revenue currency nothing on this card is editable. There is no way to rename the account, change its email or delete it; see [Account and sign-in](/dashboard/account-and-sign-in/).

## Account key

The key your servers and scripts authenticate with. It has every scope, including creating, changing and deleting links, so it never goes into an app: apps get an [SDK key](#sdk-keys). It is `dtg_` followed by 32 lowercase hex characters, 36 characters in total. The card shows it masked as its first 8 characters followed by dots, for example `dtg_3f9a••••••••••••••••••••`.

| Action | What happens |
|---|---|
| **Show** / **Hide** | Reveals or masks the full key. |
| **Copy** | Copies the full key and shows "Account key copied to clipboard." |
| **Regenerate** (red) | Asks "Regenerate the account key? Servers and scripts that use it must be updated; SDK keys are not affected." and then replaces the key in one step. The new key is shown unmasked with "New account key generated. Update your servers and scripts: the old key no longer works." Requests that use the old key fail with `401` (`invalid_api_key`) from that moment on. There is no grace period and no password prompt. |

Hint under the key: "Full access, including creating and deleting links. Use it on your servers and in scripts; never ship it in an app. Regenerating replaces it at once."

## SDK keys

The keys your apps ship with, `dtg_pub_` followed by 32 hex characters. Anyone can extract a key from an app build, so an SDK key can only register installs, report clicks, events and opens, pull the attribution verdict, read links and create temporary links. Creating, changing or deleting links needs a key created with **Allow creating and changing links (links:write)**. See [Authentication](/api/overview/#authentication) for the scopes route by route.

A new account starts with one SDK key, "App key". The card lists every key with its name, the full key, its scope chips, when it was created and last used (stamped at most once an hour), and **Copy** and **Revoke** buttons. Revoked keys stay listed, greyed out, with the date.

| Action | What happens |
|---|---|
| **Create SDK key** | Creates a key with the name in the box (default "App key") and, when ticked, the links:write scope. An account can hold 20 active SDK keys. |
| **Copy** | Copies the full key. |
| **Revoke** | Asks for confirmation, then refuses the key at once: calls answer `401` with code `revoked_api_key`. Release a build with a new key before you revoke the old one. |

### How the key is stored, and when it cannot be shown

The server authenticates requests with a SHA-256 hash of the key and keeps the 8-character prefix for display. Since database migration 0023 it also keeps an AES-256-GCM encrypted copy, under a key derived from the deployment's `JWT_SECRET`, so this card can show the key again after signup.

When no readable copy exists, the card shows the mask only, without **Show** and **Copy**, and the hint reads: "This key was created before keys were viewable here. Regenerate once to get a key you can view and copy any time (apps using the current key must be updated)." This is the case for:

- keys created before migration 0023;
- the local demo account created by the demo seed;
- a self-hosted deployment whose `JWT_SECRET` was unset when the key was created, or has been rotated since.

Authentication keeps working in every one of these cases; only the display is affected. **Regenerate** fixes it.

The key is also shown once on the "Account created" screen right after signup; see [Account and sign-in](/dashboard/account-and-sign-in/). How requests are authenticated and signed with it is in [API overview](/api/overview/).

## Link configuration

Read-only facts about the deployment that serves your links.

| Field | Value |
|---|---|
| **URL mode** | **Wildcard subdomain** on the hosted service: links are `https://{username}.dectog.com/{slug}`. **Path-based (workers.dev / dev)** on deployments without a wildcard domain: links are `{base-url}/r/{username}/{slug}`. |
| **Root domain** | The domain under which link hosts live: `dectog.com` on the hosted service. |
| **Example link** | Your link URL for the slug `welcome`, in the mode above, or on your custom domain once it is active. |

Both forms are explained in [Concepts](/start/concepts/).

## Custom domain

Your links on a subdomain of your own, like `go.yourbrand.com`. Enter it and select **Add**; the card then shows the DNS records to add (two TXT records, then the CNAME), a status chip (**Waiting for DNS**, **Issuing certificate**, **Ready: point the CNAME**, **Active**, **No longer points here**, **Failed**, or **Removed**), Cloudflare's own message while it waits, **Check now** and **Remove**. While the domain is pending, the card checks again every minute on its own. Select a record's name or value to copy it. A removed domain shows when it will be deleted, and **Restore**. On a deployment without Cloudflare for SaaS the card says custom domains are not set up. The whole flow is in [Custom domains](/links/custom-domains/).

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
