---
title: Apps
description: Register an app and change it with the account key, from a script, CI or an AI agent, with the same fields and checks as the dashboard's Apps page.
sidebar:
  order: 6
---

An app tells AdTo which iOS and Android app your links open: its bundle id and Team ID, its Android package and signing fingerprints, its store links. Register it in the dashboard ([Apps](/dashboard/apps/)), or with these routes when a script or an agent does the setup.

They take the **account key** only. An SDK key gets `403 account_key_required`, because an app decides where every link of the account sends people. They are signed like every v1 call (see [the API overview](/api/overview/)), and they run the same code as the dashboard: the same fields, the same validation, the same error messages.

| Route | Body | Answer |
|---|---|---|
| `GET /api/v1/apps` | | 200 `{data: App[]}`, oldest first |
| `POST /api/v1/apps` | the fields below; `name` is required | **201** the `App` |
| `PUT /api/v1/apps/:id` | any of the fields below | 200 the `App`; `404` when the app is not this account's |

Deleting an app is not in the API: it unbinds the app's links and drops its webhooks, so it stays in the dashboard.

## Fields

| Field | What it is |
|---|---|
| `name` | Shown on the QR and "Opening the app" pages. |
| `ios_bundle_id`, `ios_team_id` | `com.company.app` and the 10-character Team ID (Apple Developer → Membership). Both are needed for Universal Links. |
| `ios_store_url` | An `apps.apple.com` URL. |
| `android_package` | `com.company.app`. |
| `android_sha256_fingerprints` | Signing certificate SHA-256s, `AA:BB:…` (32 pairs): the Play App Signing one, plus your upload and debug keys for testing. On `PUT` the list replaces the old one. |
| `android_store_url` | A `play.google.com` URL. |
| `fallback_url` | Where desktop visitors and links without a target go. |
| `ios_app_scheme`, `android_app_scheme` | A custom URL scheme without `://`. |
| `og_title`, `og_description`, `og_image_url` | The default social preview of the app's links. |
| `mobile_interstitial`, `ios_tap_to_store`, `fb_app_id`, OEM store links, attribution windows, `mmp_handoff`, `mmp_pid`, `fraud_block_rules` | As in the [Apps editor](/dashboard/apps/). |

On `PUT`, a field you leave out keeps its value, and `null` or `""` clears it.

Saving an app publishes, on your link host, `/.well-known/apple-app-site-association` (with the bundle id and Team ID) and `/.well-known/assetlinks.json` (with the package and fingerprints) at once. Then check them with the MCP tool `setup_status`, or the "Are we live yet?" panel on the Apps page.

Both writes are in the account's [audit log](/dashboard/settings/) under the key, as `app.created` and `app.updated`.

## Example

```bash
adto_call POST /api/v1/apps '{
  "name": "Acme",
  "ios_bundle_id": "com.acme.app",
  "ios_team_id": "ABCDE12345",
  "ios_store_url": "https://apps.apple.com/app/id123456789",
  "android_package": "com.acme.app",
  "android_sha256_fingerprints": ["AB:CD:…"],
  "android_store_url": "https://play.google.com/store/apps/details?id=com.acme.app",
  "fallback_url": "https://acme.com/"
}'
```

`adto_call` signs the request with your key; it is in the agent guide's [curl examples](https://adto.app/SKILL.md#curl-examples). An agent on the [MCP server](/guides/automation-and-agents/#mcp-server) uses `create_app` and `update_app` instead.
