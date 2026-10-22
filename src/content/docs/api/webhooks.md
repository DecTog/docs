---
title: Webhooks
description: The signed POSTs DecTog sends to your backend for installs, conversions, leads, opens, referrals, clicks and link changes, how deliveries are logged and retried, and how to verify them in Node, Python and PHP.
sidebar:
  order: 5
---

DecTog POSTs events to your own backend: every install verdict, conversions and leads, app opens, referrals, link changes and, if you ask, every tap. Add webhooks in [Dashboard: Apps](/dashboard/apps/), under an app's **Webhooks**. A webhook receives either that app's events or every app's, and the events you tick. Deleting an app deletes the webhooks limited to it. Every delivery is logged for 30 days and retried for about a day when your endpoint does not answer 2xx.

## Adding a webhook

**Add webhook** asks for the URL (http or https), whether it takes this app's events or every app's, and the events (all but `click.recorded` are ticked at first). The response shows the signing secret, `whsec_` and 64 hex characters, **once**: copy it then. **Rotate secret** replaces it and shows the new one once; the old one stops working at once. The server keeps the secret encrypted and never returns it again.

Which app an event concerns: for installs, the credited or routed link's app, else the install's own app (the one whose Android package or iOS bundle ID equals the `package_name` the SDK sends), else the oldest app; for events, opens, referrals, clicks and links, the link's app, else the oldest app.

## The request

Every delivery is a POST of the same envelope:

```json title="POST to your endpoint"
{
  "event_id": "evt_5c1f0a9b2d7e4c3a8b6f1e20",
  "event": "app.installed",
  "created_at": "2026-10-12T09:15:02.000Z",
  "attempt": 1,
  "data": { … }
}
```

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-dectog-event` | The event name, as in the body. |
| `x-dectog-event-id` | The `event_id`, as in the body. |
| `x-dectog-signature` | `sha256=<hex>` where hex is HMAC-SHA256 of the **raw request body** keyed with your secret, lowercase. |
| `x-dectog-timestamp` | Unix seconds when the request was built. |

`event_id` is the same on every attempt and on a manual resend: deduplicate on it. `attempt` counts from 1. The signature covers the body bytes only. Verify against the raw bytes exactly as received, before any JSON parsing or re-serialization.

## Events

| `event` | Sent when | `data` |
|---|---|---|
| `app.installed` | A first-launch report (`POST /api/v1/app-installs`) produced a verdict. Organic installs fire too. Replays (`"replayed": true`) do not. | the install, [below](#the-install-events) |
| `app.install_updated` | A late claim upgraded the verdict (`"claim": "upgraded"`), or Apple Search Ads resolved with `attribution: true`. | the same |
| `event.conversion`, `event.lead` | The SDK's event batch, or [`dectog.js`](/sdk/web/) on your website, stored a conversion or a lead (the automatic signup lead included); duplicates are not sent again. `source` is `web` for the website's, `store` for a store notification's, `null` for the app's. | `{username, event: {id, type, event_name, revenue, currency, revenue_base, transaction_type, transaction_id, original_transaction_id, product_id, store, source, customer_id, install_id, slug, open_slug, client_timestamp, metadata, created_at}}` |
| `app.opened` | A link opened the installed app (`POST /api/v1/app-opens`). | `{username, open: {id, slug, click_id, install_id, device_id, app_version, os, created_at}}` |
| `referral.converted` | A referred user signed up. | `{username, referral: {…}}`, see [Referral programs](/guides/referral-programs/#4-reward-from-the-webhook) |
| `click.recorded` | Every tap and every in-app open the SDK reports. Not ticked by default: one delivery per tap. | `{username, click: {id, slug, link_kind, source, device_type, os, browser, country, lang, referrer, ip_hash, utm_source, utm_medium, utm_campaign, utm_term, utm_content, link_params, clicked_at}}`; never the raw IP, the user agent or a device id |
| `link.created` | A permanent link was created: the API, the dashboard, a bulk create or import, an upsert, a referral link. | `{username, link}` with the [Link object](/api/links/#the-link-object) |
| `link.updated` | A permanent link changed, including pause, resume, archive, an expiry and a restore. | the same |
| `link.deleted` | A permanent link was deleted. | the same, plus `permanent` (`true` when its history went too) |

## The install events

The `data` of `app.installed` and `app.install_updated`:

```json title="data of app.installed"
{
  "install_id": "3d2b6c1e-8f0a-4b7c-9d2e-5a6b7c8d9e0f",
  "matched": true,
  "type": "non-organic",
  "match_source": "referrer",
  "referrer_source": "google_play",
  "match_confidence": "guaranteed",
  "install_state": "install",
  "is_reinstall": false,
  "fraud_flags": [],
  "username": "acme",
  "slug": "spring-sale",
  "link": {
    "slug": "spring-sale",
    "target": "https://shop.example.com/sale",
    "url": "https://acme.dectog.com/spring-sale",
    "created_at": "2026-10-01T09:00:00.000Z"
  },
  "device": {
    "device_id": "4b1d8c3e9f2a",
    "device_model": "pixel 8",
    "device_manufacturer": "Google",
    "os": "android",
    "os_version": "15",
    "connectivity_type": "wifi",
    "carrier_mcc": "262",
    "carrier_mnc": "01"
  },
  "ip_hash": "9c1185a5c5e9fc54612808977ee8f548b2258d31f3f7a2b5a4e2f7c3d1b0a9e8",
  "clicked_at": "2026-10-12T08:59:12.000Z",
  "click_params": { "deep_link": "sale/42", "label": null, "campaign": "spring", "adgroup": null, "creative": null, "tracker": null },
  "deep_link": "sale/42",
  "apple_search_ads": null,
  "processed_at": "2026-10-12T09:03:40.000Z"
}
```

| Field | Type | Meaning |
|---|---|---|
| `install_id` | string | The install row's id. |
| `matched` | boolean | Credited to a click. |
| `type` | string | `non-organic` when matched, else `organic`. |
| `match_source` | string or null | `referrer`, `clipboard`, `fingerprint`, or `null`. |
| `referrer_source` | string or null | `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo`, `meta`, or `null`. |
| `match_confidence` | string or null | `guaranteed`, `high`, `medium`, `low`, or `null`. |
| `install_state` | string or null | `install`, `reinstall`, `update`, or `null`. |
| `is_reinstall` | boolean | |
| `fraud_flags` | string array | Rule names from [Clicks and installs](/api/clicks-and-installs/); empty when clean. |
| `username` | string | Your username. |
| `slug` | string or null | The matched link's slug; `null` whenever `matched` is false, including a strict-mode install that was zeroed (its `fraud_flags`, `referrer_source` and `match_confidence` still show what was found). |
| `link` | object or null | `slug`, `target`, `url`, `created_at` of the matched **permanent** link. `null` for organic installs, temporary-link matches and strict-mode zeroed installs. There is no `metadata` here, unlike the install verdict. |
| `device` | object | `device_id`, `device_model`, `device_manufacturer`, `os`, `os_version`, `connectivity_type`, `carrier_mcc`, `carrier_mnc`; each `null` when the SDK did not send it. |
| `ip_hash` | string or null | The salted SHA-256 of the install request's IP (IPv6 cut to /64). |
| `clicked_at` | string or null | The matched click's time; `null` when `matched` is false. |
| `click_params` | object or null | `deep_link`, `label`, `campaign`, `adgroup`, `creative`, `tracker` from the matched click; `null` when `matched` is false or when the click carried none. |
| `deep_link` | string or null | Mirrors `click_params.deep_link`. |
| `apple_search_ads` | object or null | Same object as on the verdict: `null` until a token was sent, then `status`, `attribution`, `resolved_at` and, once Apple answered, the campaign record. An `app.install_updated` triggered by Apple has `"status": "resolved"`. |
| `processed_at` | string | When the payload was built. |

The payload has no `routing` object and no `install_attempt_id`.

## Delivery and retries

- The first attempt is sent right after the work that caused it; it never delays the response to the app or the API call. A request that produces more than 25 deliveries (a large event batch or bulk create) sends the first 25 at once and the rest with the next hourly run.
- A delivery succeeds on any 2xx answer. A non-2xx answer, a network error or no answer within 10 seconds is a failure, logged with the status and the first 500 characters of the response.
- Failures are retried by the hourly job (at :07 each hour) 5 minutes, 30 minutes, 2 hours, 6 hours and 24 hours after the previous attempt, so the shortest gaps can stretch to the next hour. After the sixth attempt the delivery is marked failed.
- Each webhook counts its failed attempts in a row, across deliveries. The account owner is emailed at 5, 10 and 15; at 20 the webhook is turned off and stops receiving events. Any successful delivery resets the count. **Turn on** resets it too, and the retries still pending go out with the next hourly run.
- Deliveries are not ordered. An `app.install_updated` can arrive before the `app.installed` of the same install when the first delivery was retried.
- Changes to a webhook can take up to 30 seconds to reach every server.

## The delivery log

**Deliveries** on a webhook lists its last 20 deliveries of the past 30 days: the time, the event, **Delivered** with the status, **Retry** with the time of the next attempt, or **Failed** with the error, the attempt number and the start of the response. **Resend** sends one again now, with the same `event_id` and the next `attempt` number, whatever its state.

## Test event

**Send test** delivers a `webhook.test` event now and logs it like any other delivery, with `data` `{"username": "acme", "test": true, "message": "A test delivery from the DecTog dashboard"}`. A failed test is neither retried nor counted toward the failure thresholds.

## Dashboard API

The dashboard uses these session routes; see [Admin API](/api/admin-api/#webhooks).

| Route | Purpose |
|---|---|
| `GET /api/admin/webhooks` | `{data: [Webhook], events, default_events}`; a Webhook is `{id, app_id, url, events, active, consecutive_failures, disabled_at, disabled_reason, created_at, updated_at}` |
| `POST /api/admin/webhooks` | `{url, app_id?, events?}` → `201` Webhook plus `secret` |
| `PUT /api/admin/webhooks/:id` | any of `url`, `app_id`, `events`, `active` |
| `DELETE /api/admin/webhooks/:id` | deletes the webhook and its log |
| `POST /api/admin/webhooks/:id/rotate-secret` | Webhook plus the new `secret` |
| `POST /api/admin/webhooks/:id/test` | the logged `webhook.test` delivery |
| `GET /api/admin/webhooks/:id/deliveries?limit=` | `{data: [Delivery]}`, newest first, 1 to 200 |
| `POST /api/admin/webhook-deliveries/:id/resend` | the delivery after one more attempt |

## Verifying the signature

All three snippets compute `sha256=` + HMAC-SHA256(secret, raw body) and compare it in constant time with the `x-dectog-signature` header. They produce identical values for identical input.

```js title="Node (Express)"
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.DECTOG_WEBHOOK_SECRET;

function verifyDectogSignature(rawBody, signatureHeader) {
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

const app = express();

// Keep the raw bytes: express.json() would re-serialize and break the check.
app.post("/dectog/events", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifyDectogSignature(req.body, req.get("x-dectog-signature"))) {
    return res.status(401).end();
  }
  const delivery = JSON.parse(req.body.toString("utf8"));
  res.status(204).end(); // acknowledge first
  // dedupe on delivery.event_id, then handle delivery.event and delivery.data
});
```

```python title="Python (Flask)"
import hashlib
import hmac
import os

from flask import Flask, abort, request

app = Flask(__name__)
SECRET = os.environ["DECTOG_WEBHOOK_SECRET"].encode()


def verify_dectog_signature(raw_body: bytes, signature_header: str | None) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(SECRET, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


@app.post("/dectog/events")
def dectog_events():
    if not verify_dectog_signature(request.get_data(), request.headers.get("x-dectog-signature")):
        abort(401)
    delivery = request.get_json(force=True)
    # dedupe on delivery["event_id"], then handle delivery["event"] and delivery["data"]
    return "", 204
```

```php title="PHP"
<?php
$secret = getenv('DECTOG_WEBHOOK_SECRET');
$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_DECTOG_SIGNATURE'] ?? '';

$expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit;
}

$delivery = json_decode($rawBody, true);
http_response_code(204);
// dedupe on $delivery['event_id'], then handle $delivery['event'] and $delivery['data']
```

If a framework parses the body before you can read it, make sure it hands you the original bytes; a re-encoded body (different key order, whitespace or Unicode escaping) will not verify.
