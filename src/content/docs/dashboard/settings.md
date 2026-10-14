---
title: Settings
description: Your account details, the API key the SDK uses, how to view, copy and regenerate it, and the link configuration of the deployment.
sidebar:
  order: 5
---

The Settings screen, at https://app.dectog.com/dashboard/settings, has four cards: **Account**, **API key**, **Link configuration** and **Flutter SDK quickstart**. Messages appear in a banner under the title: green for a copied or regenerated key, red for an error.

## Account

| Field | Value |
|---|---|
| **Email** | The email you sign in with. |
| **Username / subdomain** | Your username, which is also the host of your links: `https://{username}.dectog.com/{slug}`. |

Nothing on this card is editable. There is no way to rename the account, change its email or delete it; see [Account and sign-in](/dashboard/account-and-sign-in/).

## API key

The key the Flutter SDK, and any script that calls the REST API, authenticates with. It is `dtg_` followed by 32 lowercase hex characters, 36 characters in total. The card shows it masked as its first 8 characters followed by dots, for example `dtg_3f9a••••••••••••••••••••`.

| Action | What happens |
|---|---|
| **Show** / **Hide** | Reveals or masks the full key. |
| **Copy** | Copies the full key and shows "API key copied to clipboard." |
| **Regenerate** (red) | Asks "Regenerate the API key? The Flutter SDK configuration must be updated afterwards." and then replaces the key in one step. The new key is shown unmasked with "New API key generated. Update your app with it — the old key no longer works." Requests that use the old key fail with `401 Unauthorized` from that moment on. There is no grace period and no password prompt. |

Hint under the key: "Use this key in the Flutter SDK. Regenerating replaces it — apps still using the old key stop working."

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
| **Example link** | Your link URL for the slug `welcome`, in the mode above. |

Both forms are explained in [Concepts](/start/concepts/).

## Flutter SDK quickstart

A code block you can paste into your app:

```dart
await dectog.initialize(DectogConfig(
  apiKey: 'dtg_…',
  baseUrl: 'https://app.dectog.com',
));
```

The snippet follows the **Show** / **Hide** state of the card above: it prints the full API key only while the key is shown, and otherwise the prefix followed by `…`. The `baseUrl` is the deployment's public base URL; on the hosted service it matches the SDK's default, `https://app.dectog.com`, and can be left out. See [Initialize and handle links](/sdk/initialize-and-handle-links/).

:::note[Self-hosting]
**URL mode**, **Root domain** and the snippet's `baseUrl` come from the worker's `LINK_URL_MODE`, `ROOT_DOMAIN` and `PUBLIC_BASE_URL` variables; a root domain that starts with `localhost` forces path mode. See [Configuration reference](/self-hosting/configuration-reference/).
:::
