---
title: Clicks and installs
description: The SDK-facing routes that record in-app clicks, report first launches and late attribution claims, and the install verdict they return.
sidebar:
  order: 3
---

These are the routes behind install attribution. The Flutter SDK calls them for you (see [Install attribution](/sdk/install-attribution/)); this page is the contract for anyone porting the SDK or reading the responses. All three need the Bearer key and request signature from [API overview](/api/overview/).

The user-level explanation of the matching ladder is in [How attribution works](/start/how-attribution-works/); the scoring internals are in [Attribution internals](/self-hosting/attribution-internals/).

## POST /api/v1/clicks

Records a click that happened inside the app: the app was already installed and a link opened it. Only `slug` is required.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `slug` | string | yes | One of your permanent or temporary slugs. Unknown slugs answer `404 {"error": {"code": "not_found", "message": "Link not found"}}`. |
| `click_id` | string | no | The `dtg_click` id the app received through an Android intent bounce. See the flip rules below. |
| `platform` | string | no | `ios` or `android` (any case). Sets the click's device type and the OS label (`iOS 17.5`, `Android 14`). |
| `os_version` | string | no | Up to 32 characters; combined with `platform` into the OS label and the OS major. |
| `device_type` | string | no | Used only when `platform` is not `ios` or `android`; otherwise the server classifies the request's User-Agent. |
| `is_mobile_app` | boolean | no | Truthy stores `source: "mobile_app"`; anything else stores `source: "web"`. |
| `session_id` | string | no | Stored as sent. |
| `language` | string | no | Up to 128 characters, stored as the click's accept-language; its primary tag (`de` from `de-DE`) becomes `lang`. |
| `device_id` | string | no | Stored as sent; also keys the per-device rate limit. |
| `device_model` | string | no | Trimmed, unquoted and lowercased. |
| `metadata` | JSON | no | Stored when truthy. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | string | no | Stored as strings. |
| `link_params` | object | no | String-to-string map of the opened URL's `dec_*` parameters. Parsed like the redirect engine does: `dec_deeplink` is checked against the link's app schemes, tracking values are capped at 255 characters, and the link's own `label`, `campaign`, `adgroup` and `creative` fill whatever the URL did not set. See [URL parameters](/links/url-parameters/). |
| `client_click_time` | string | no | ISO 8601, device clock, when the link reached the device. Dropped silently when unparseable; stored up to 64 characters. |
| `launch_referrer` | string | no | The launching app's referrer (`Activity.getReferrer()` or `referrerURL`), up to 512 characters. |

The body's `username` is ignored; the slug is always looked up in the caller's own account. The request's hashed IP (and its raw IP only when the deployment sets `STORE_RAW_IP=1`), country, region, city, ASN and User-Agent (first 512 characters) are stored on the row, which is marked `origin: "sdk"`.

Response: always `200 {"success": true, "click_id": "<id>"}`.

### What `click_id` does

The intent bounce on Android delivers the web click's id to the app, and the SDK reports it here so one tap does not count twice:

1. `click_id` names a `source: "web"` click of your account that is less than 24 hours old: that row is converted to `source: "mobile_app"`, empty fields (`session_id`, `device_id`, `device_model`, `link_params`, `client_click_time`, `launch_referrer`) are filled from the body, no new row is written and `click_count` is not bumped. The response returns that id.
2. `click_id` names a click that exists but is older than 24 hours or already converted: nothing is written. The response returns the id you sent.
3. `click_id` names no click, or is absent: a new row with a new server-generated 16-character id is inserted and the permanent link's `click_count` goes up by one. The id you sent is not reused.

SDK clicks are never fingerprint candidates: only `source: "web"` clicks from the redirect engine are.

## POST /api/v1/app-installs

The first-launch report. Every field is optional; a malformed optional field is stored as `null`, never rejected. The only client error is `400 {"error": {"code": "invalid_request", "message": "Invalid JSON body"}}`. The response is the verdict described below.

### Request body

Strings are trimmed and truncated to the stated length; empty strings become `null`.

**App and OS**

| Field | Type | Meaning |
|---|---|---|
| `app_platform` | string, 64 | For example `flutter`. |
| `app_version`, `app_build_number` | string, 64 | Your app's version and build. |
| `os` | string, 32 | `android` or `ios`. This decides the device family for fingerprinting; other values disable the family filter. |
| `os_version` | string, 64 | `17.5.1`, `14`. Its major is stored as `os_major`. |
| `language` | string, 64 | `en_US`; the primary tag is stored as `lang`. |
| `timezone` | string, 64 | IANA name. |
| `metadata` | JSON | Stored as sent. |

**Device tier** (sent only when the app opted in to device data; see [Device data and privacy](/sdk/device-data-and-privacy/))

| Field | Type | Meaning |
|---|---|---|
| `device_id` | string | Trimmed. Drives reinstall detection, verdict replay for the same device and the per-device rate limit. |
| `device_model` | string | Lowercased. A model present on both the click and the install and different excludes that click. |
| `device_manufacturer` | string, 64 | |
| `device_kind` | string, 16 | `phone`, `tablet`, … |
| `cpu_type` | string, 64 | `arm64-v8a`, `x86_64`; its family (`arm`, `x86`) is compared with the click's architecture hint. |
| `os_build` | string, 64 | |
| `screen_width`, `screen_height`, `screen_density` | string, 16 | Physical pixels and density, as strings. |
| `connectivity_type` | string, 16 | `wifi`, `cellular`, … `cellular` shortens the fingerprint window and raises the install-velocity threshold. |
| `carrier_mcc`, `carrier_mnc` | string, 8 | |
| `web_user_agent` | string, 512 | The device's WebView User-Agent. |
| `package_name` | string, 256 | |
| `is_physical_device` | boolean | `false` raises the `emulator` flag. |
| `installer_package` | string, 256 | |
| `install_time`, `update_time`, `first_install_ts` | epoch ms | Provenance timestamps from the OS. Never used for matching. |

**Deterministic signals**

| Field | Type | Meaning |
|---|---|---|
| `install_referrer` | string, 2048 | The raw Play or OEM store referrer. Attribution reads `dtg_click=<id>` and `dtg_l=<username>/<slug>` from it. |
| `referrer_store` | string | `google_play`, `huawei`, `samsung`, `xiaomi` or `vivo`. Defaults to `google_play` when `install_referrer` is present; other values are dropped. |
| `referrer_status` | string | `ok`, `organic`, `feature_not_supported`, `service_unavailable`, `developer_error`, `permission_error`, `timeout`, `error`, `not_available` or `not_android`. |
| `referrer_attempts` | integer 0 to 1000 | |
| `referrer_wait_ms` | integer 0 to 3,600,000 | |
| `referrer_click_ts`, `install_begin_ts` | epoch ms | The device-clock pair from the referrer API. Stored for review, never used for timing. |
| `referrer_click_server_ts`, `install_begin_server_ts` | epoch ms | Google's server-side pair. The click time used for `impossible_speed`, `stale_referrer` and synthesized clicks. |
| `install_version` | string, 64 | |
| `google_play_instant` | boolean | Must be a JSON boolean; any other type stores `null`. |
| `meta_referrer`, `meta_referrer_ts` | string 512, epoch ms | Meta's on-device install referrer. The SDK reads it only when `DectogConfig.fbAppId` is set in the app; the dashboard's `fb_app_id` field is stored and nothing else. |
| `meta_referrer_is_ct` | boolean | Click-through (`true`) or view-through (`false`). Stored only together with `meta_referrer`. |
| `clipboard_url` | string, up to 2048 | A DecTog link found on the pasteboard. Only links of this account on this deployment are read: `https://<username>.<root>/<slug>`, `/r/<username>/<slug>` on the root domain or the public base host, a custom-scheme URL carrying `dtg_l=<username>/<slug>`, or the development form `dectog://<username>/<slug>`. A link of another account, `/r/` on any other host, or an untagged scheme URL is ignored. The slug is stored as `clipboard_slug`; the raw clipboard content is never stored. |
| `asa_token` | string, 4096 | The Apple Search Ads attribution token from AdServices. |

Epoch values must fall between 1970 and 2100, otherwise they become `null`.

**Reliability fields**

| Field | Type | Meaning |
|---|---|---|
| `install_attempt_id` | string matching `[A-Za-z0-9_-]{8,64}` | Idempotency key per tenant. A value that does not match the pattern is treated as absent. |
| `attempt` | integer 1 to 1000 | Which launch attempt produced this POST. |
| `created_at_client`, `sent_at_client` | ISO 8601, 64 | Device clock. |
| `install_state` | string | `install`, `reinstall` or `update`. See below. |
| `recovered_from` | string, 64 | The install id the server answered `install_not_found` for (see [Events and attribution](/api/events-and-attribution/)). A registration carrying it is stored with that id and is never fingerprint-matched. |

**Ad identifiers**

| Field | Type | Meaning |
|---|---|---|
| `ad_id` | string | The advertising id. Stored in a separate table keyed by install id, never joined to `device_id`, deleted by the retention job. |
| `ad_tracking_limited` | boolean | Truthy stores `1`; absent or `null` stores `0`. |

### What the server does, in order

1. **Replay.** When `install_attempt_id` matches a row of your account, the stored verdict comes back with `"replayed": true`. Nothing is written and nothing is re-matched.
2. **Reinstall flag.** `is_reinstall` is `true` when `install_state` is `reinstall`, or when the same `device_id` already has a non-reinstall install in your account. The flag does not stop matching; the dashboard excludes reinstalls from install counts.
3. **Deterministic ladder.** Signals are tried in order: store referrer, clipboard URL, Meta referrer. Each signal that carries `dtg_click=<id>` is resolved:
   - The click exists and no install holds it: match. `match_source` is `referrer` (store or Meta) or `clipboard`, `referrer_source` is the store name, `meta`, or `null` for clipboard, and `match_confidence` is `guaranteed`.
   - The click is held by an install with the same `device_id`: that install's verdict is replayed (`"replayed": true`), nothing is written.
   - The click is held by another device's install: the ladder **moves on to the next signal** and remembers the reuse.
   - The click id is unknown: when the signal also carries `dtg_l=<your username>/<slug>` for an existing link (a clipboard URL names its slug by construction), a web click with that id is synthesized (`origin: "synthesized_referrer"`, `clicked_at` from the server-side referrer time, else now) and the install matches it. Otherwise the ladder moves on.
   - When no signal matched and at least one was a reuse, the install gets the `click_reuse` flag and the fingerprint does not run. `click_reuse` is therefore only ever the final outcome, never a reason to skip a later signal.
4. **Fingerprint.** Runs unless `install_state` is `update`, step 3 ended in reuse, the registration carries `recovered_from`, or the install's app turned **Probabilistic match** off. Candidates: your `source: "web"` store-redirect clicks from the same hashed IP and the same device family (`os`), not yet credited to any install, from the last 24 hours, newest 50. A click keeps the 24 hour window only when both it and the install carry a device model and the install is not on `cellular`; every other click must be inside the low-entropy window (2 hours by default, overridable per app up to 720 hours and never longer than the wide window). Scoring per click: model match +40 (a mismatch excludes the click), OS major +15 or −30, language +10 or −15, screen short side within 3 % +15 or −40, CPU family +5 or −40, same ASN +10; missing signals score 0. Confidence from the ranked list: `low` when the top two are within 10 points or the top score is negative; `high` when the top is unique and has a model match, a screen agreement plus OS major, or a score of at least 15; `medium` for a unique top scoring 0 to 14. Only `high` credits the click (`match_source: "fingerprint"`); `medium` fills `routing` without credit; `low` does nothing. When step 3 already matched, the fingerprint still runs as a shadow and records whether it agrees.
5. **Link check.** A matched click whose link no longer exists makes the install organic.
6. **Fraud rules.** The flags below are evaluated and stored. When the app the verdict concerns (the credited or routed link's app, else the install's own app, else the oldest) has strict fraud mode on and the list is not empty, `matched` and `match_source` are zeroed; `matched_click_id`, `matched_slug`, `referrer_source` and `match_confidence` stay as evidence and the click stays consumed.
7. **Insert.** The row is written together with any synthesized click and the ad identifier. If two retries with the same `install_attempt_id` race, the unique index lets one in and the other receives the winner's verdict with `"replayed": true`.
8. **Apple Search Ads.** A token starts its round-trip with Apple after the response is sent.
9. **Webhook.** If the app the verdict concerns has a webhook URL and secret, `app.installed` is dispatched after the response. See [Install webhook](/api/install-webhook/).

### Strict fraud mode on the wire

With strict mode on, a flagged install's response has `"matched": false`, `"type": "organic"`, `"match_source": null` and no `username`, `slug`, `link`, `custom_params`, `click_params`, `deep_link` or `clicked_at`, while `referrer_source` and `match_confidence` (for example `"guaranteed"`) still show what was found. The slug is kept on the row as evidence but is never sent: the webhook payload has `slug`, `link`, `clicked_at`, `click_params` and `deep_link` set to `null` whenever `matched` is false. Strict mode, like the low-entropy window, the deterministic window and the webhook, is a per-app setting; see [Dashboard: Apps](/dashboard/apps/) for which app applies. See [Dashboard: Apps](/dashboard/apps/).

### The verdict

```json title="A deterministic match"
{
  "matched": true,
  "type": "non-organic",
  "match_source": "referrer",
  "referrer_source": "google_play",
  "match_confidence": "guaranteed",
  "fraud_flags": [],
  "is_reinstall": false,
  "install_state": "install",
  "routing": {
    "username": "acme",
    "slug": "spring-sale",
    "deep_link": "sale/42",
    "click_params": { "deep_link": "sale/42", "label": null, "campaign": "spring", "adgroup": null, "creative": null, "tracker": null },
    "confidence": "guaranteed",
    "clicked_at": "2026-10-12T08:59:12.000Z"
  },
  "apple_search_ads": null,
  "username": "acme",
  "slug": "spring-sale",
  "link": {
    "slug": "spring-sale",
    "target": "https://shop.example.com/sale",
    "url": "https://acme.dectog.com/spring-sale",
    "created_at": "2026-10-01T09:00:00.000Z",
    "metadata": { "screen": "sale" }
  },
  "custom_params": { "screen": "sale" },
  "click_params": { "deep_link": "sale/42", "label": null, "campaign": "spring", "adgroup": null, "creative": null, "tracker": null },
  "deep_link": "sale/42",
  "clicked_at": "2026-10-12T08:59:12.000Z",
  "install_id": "3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f"
}
```

| Field | Type | Present | Meaning |
|---|---|---|---|
| `matched` | boolean | always | The install is credited to a click. |
| `type` | string | always | `non-organic` when matched, else `organic`. |
| `match_source` | string or null | always | `referrer`, `clipboard`, `fingerprint`, or `null`. |
| `referrer_source` | string or null | always | `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo`, `meta`, or `null`. |
| `match_confidence` | string or null | always | `guaranteed` (deterministic), `high`, `medium`, `low`, or `null` when nothing was found. |
| `fraud_flags` | string array | always | Empty when clean. |
| `is_reinstall` | boolean | always | |
| `install_state` | string or null | always | What the SDK reported. |
| `routing` | object or null | always | Where to route the user. Present when matched (mirrors the attribution, `confidence` equals `match_confidence`) and when the fingerprint ended at `medium` (`confidence: "medium"`, `matched` stays `false`: route the user, credit nobody). `null` otherwise. Fields: `username`, `slug`, `deep_link`, `click_params`, `confidence`, `clicked_at`. |
| `apple_search_ads` | object or null | always | `null` when no token was ever sent. See below. |
| `install_id` | string | always | The install row's id. Keep it: claims, events and the attribution pull use it. |
| `replayed` | `true` | on replays | The verdict was stored earlier; this request wrote nothing. |
| `claim`, `claim_reason` | string | on claim responses | See the claim route. |
| `last_open` | object or null | on `GET /api/v1/attribution` only | See [Events and attribution](/api/events-and-attribution/). |
| `username`, `slug` | string | when matched | The matched link. |
| `link` | object | when matched **and** the link is permanent | `slug`, `target`, `url`, `created_at`, `metadata`. A temporary-link match has `username` and `slug` but no `link`. |
| `custom_params` | JSON or null | when matched | The permanent link's `metadata`; `null` for temporary links or when none is set. |
| `click_params` | object or null | when matched | The matched click's `dec_*` values: `deep_link`, `label`, `campaign`, `adgroup`, `creative`, `tracker`. `null` when the click carried none. |
| `deep_link` | string or null | when matched | Mirrors `click_params.deep_link`. |
| `clicked_at` | string or null | when matched | The matched click's time. |

`apple_search_ads` has `status`, `attribution` (`true`, `false` or `null`) and `resolved_at`. Once Apple has answered it also carries `org_id`, `campaign_id`, `ad_group_id`, `keyword_id`, `ad_id`, `conversion_type` (`Download`, `Redownload`, `PreOrder`), `claim_type` (`Click` or `Impression`), `click_date`, `impression_date`, `country_or_region` and `supply_placement`; all of them are `null` when Apple answered `attribution: false`. Right after the install request the object is `{"status": "pending", "attribution": null, "resolved_at": null}` because Apple is asked after the response is sent.

### Fraud flags

| Flag | Fires when |
|---|---|
| `emulator` | `is_physical_device` is `false`, or the model contains `sdk`, `emulator`, `simulator`, `genymotion`, `virtual`, `gphone`, `pdv` or `avd` as a word, or an Android install of kind `phone` (or unknown kind) reports an x86 CPU. |
| `impossible_speed` | The deterministic click happened less than 10 seconds before the install request reached the server. Click time comes from `referrer_click_server_ts`, else `meta_referrer_ts`, else the click row. |
| `install_velocity_ip` | Installs from the same hashed IP in the last 24 hours reach 5 (wifi or unknown connectivity) or 25 (`cellular`). On a first launch the count is taken before the row is inserted, so the flag appears on the 6th or 26th install; on a claim the row already exists, so on the 5th or 25th. |
| `click_storm_ip` | The matched click's hashed IP produced more than 100 clicks in the hour before that click. |
| `stale_referrer` | A referrer or clipboard match whose click is more than 30 days old. |
| `stale_clipboard` | A pasted link whose click is older than the app's deterministic window (default 7 days): routed, not credited. |
| `stale_meta` | The same for Meta's install referrer. |
| `click_reuse` | A deterministic signal named a click already credited to another device's install, and nothing later matched. |

Without strict mode the flags are annotations only; attribution stands.

### `install_state`

| Value | Effect |
|---|---|
| `install` | Normal first launch. |
| `reinstall` | `is_reinstall` is `true`. Matching still runs. |
| `update` | An existing user updated into a build that includes the SDK. The fingerprint never runs, so the install cannot take a click from the pool. Deterministic signals still apply. |

## POST /api/v1/app-installs/:id/claim

Hands in a deterministic signal that arrived after the first launch: a store referrer the service delivered on a later launch, a pasted link, a late Meta read, or an Apple Search Ads token. `:id` is the `install_id` from the verdict; an id that is not yours answers `404 {"error": {"code": "not_found", "message": "Install not found"}}`.

The body accepts the **Deterministic signals** fields above, plus `attempt` and `claim_source`. Device, app and reliability fields are ignored here.

| Field | Type | Meaning |
|---|---|---|
| `claim_source` | string | `late_referrer`, `paste_control` or `clipboard`. Any other string answers `400 {"error": {"code": "invalid_request", "message": "claim_source must be one of late_referrer, paste_control, clipboard"}}`. Stored as `claim_source` on the install when the claim upgrades it. |
| `attempt` | integer 1 to 1000 | Stored as the larger of the sent and stored values. |

Every call refreshes telemetry first: non-null signal fields overwrite the stored ones, `clipboard_slug` is set when it was empty, and `updated_at` is stamped. The verdict changes at most once. The response is the verdict plus `claim` and, except on `upgraded`, `claim_reason`:

| `claim` | `claim_reason` | When | What you get back |
|---|---|---|---|
| `unchanged` | `already_deterministic` | The row already holds a deterministic click (`match_source` other than `fingerprint`), including a strict-mode zeroed one. | The stored verdict. |
| `unchanged` plus `"replayed": true` | `already_deterministic` | The named click is held by another install of the same `device_id`. | That install's verdict; the SDK adopts its `install_id`. |
| `upgraded` | none | The signal names a usable click. The deterministic click replaces a fingerprint guess (the guessed click is released) or organic. `claimed_at` is set, fraud rules are re-evaluated and merged with the stored flags, strict mode may zero the credit again, and the webhook fires `app.install_updated`. | The new verdict with `"match_confidence": "guaranteed"`. |
| `rejected` | `click_reuse` | The click is held by another device's install. `click_reuse` is added to `fraud_flags`. | The stored verdict. |
| `rejected` | `click_not_found` | The click id is unknown and no `dtg_l` of yours could synthesize it. | The stored verdict. |
| `rejected` | `no_signal` | No signal in the body carries `dtg_click`. | The stored verdict. |
| `rejected` | `stale_click` | The pasted link's or Meta referrer's click is older than the app's deterministic window (default 7 days). `stale_clipboard` or `stale_meta` is added to `fraud_flags`. | The stored verdict. |

Claims never run the fingerprint: a claim with no deterministic signal is `rejected / no_signal` even when a fingerprint candidate exists.

An `asa_token` on a claim is accepted unless the row's status is already `resolved` or `no_attribution`; it sets the status back to `pending` with zero attempts and starts the round-trip, including on `unchanged` and `rejected` claims.

```bash title="A referrer that arrived on the third launch"
dectog POST /api/v1/app-installs/3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f/claim '{
  "install_referrer": "dtg_click=4f1e9c2b7a3d5e6f&dtg_l=acme/spring-sale",
  "referrer_store": "google_play",
  "referrer_status": "ok",
  "referrer_click_server_ts": 1760259552000,
  "install_begin_server_ts": 1760259601000,
  "claim_source": "late_referrer",
  "attempt": 3
}'
```

## Apple Search Ads

`asa_token` is exchanged server-side with Apple's attribution API. The result is provenance only: it never changes `matched`, which is about DecTog links. See [Deterministic attribution](/sdk/deterministic-attribution/) for the SDK side.

| `status` | Meaning |
|---|---|
| `pending` | A token arrived and Apple has not answered yet. |
| `resolved` | Apple answered `attribution: true`. The record fields are filled and the webhook fires `app.install_updated`. |
| `no_attribution` | Apple answered `attribution: false` (no record, or an age or gender targeted ad group). Record fields are `null`. No webhook. |
| `invalid` | Apple answered HTTP 400: the token is malformed. Not retried. |
| `expired` | More than 24 hours passed since the token reached the server. Marked without calling Apple. |
| `failed` | No token was available when the server tried to resolve. |

How the round-trip runs:

- The install or claim response answers before Apple does, with `"status": "pending"`.
- Inline, after the response: up to 3 attempts, 5 seconds apart (`ASA_RETRY_DELAY_MS`). HTTP 200 settles the row as `resolved` or `no_attribution`; 400 settles it as `invalid`; 404 (token minted too recently) is retried on the next attempt; a 5xx, a network error or a malformed body stops the inline attempts at once and leaves the row `pending`.
- Both scheduled jobs (hourly at :07 and daily at 03:17 UTC) take up to 100 pending tokens, oldest first, and make one attempt each. Tokens older than 24 hours are marked `expired` without a call. See [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).
- Settling clears the token from the row; `asa_attempts` keeps the count.
- Only `resolved` and `no_attribution` are final: a later token on a `pending`, `invalid`, `expired` or `failed` row restarts the process; a later token on a settled row is ignored.
