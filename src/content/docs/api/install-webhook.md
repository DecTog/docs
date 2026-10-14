---
title: Install webhook
description: The signed POST DecTog sends to your backend for every install verdict, what it contains, and how to verify it in Node, Python and PHP.
sidebar:
  order: 5
---

DecTog can POST every install verdict to your own backend. Set the webhook URL and secret on an app in [Dashboard: Apps](/dashboard/apps/) (admin fields `install_webhook_url`, an http(s) URL, and `install_webhook_secret`, free text). Both must be saved for anything to be sent.

:::caution[One webhook per account]
Deliveries read the URL and secret from the account's **oldest** app, whichever app the matched link belongs to. On an account with several apps, only the oldest app's webhook settings have any effect.
:::

## The request

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-dectog-signature` | `sha256=<hex>` where hex is HMAC-SHA256 of the **raw request body** keyed with your secret, lowercase. |
| `x-dectog-timestamp` | Unix seconds when the request was built. |

The signature covers the body bytes only. The timestamp header is **not** part of the signed data, so it cannot be relied on for replay protection; if replays matter to you, compare the body's `install_id` and `event` with what you have already processed. Verify against the raw bytes exactly as received, before any JSON parsing or re-serialization.

## Events

| `event` | Sent when |
|---|---|
| `app.installed` | A first-launch report (`POST /api/v1/app-installs`) produced a verdict. Organic installs fire too. Replays (`"replayed": true`) do not. |
| `app.install_updated` | A late claim upgraded the verdict (`"claim": "upgraded"`), or Apple Search Ads resolved with `attribution: true`. Claims that end `unchanged` or `rejected`, and Apple answering `attribution: false`, send nothing. |

## Payload

```json title="app.installed"
{
  "event": "app.installed",
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
| `event` | string | `app.installed` or `app.install_updated`. |
| `install_id` | string | The install row's id. Use it with `event` for idempotency. |
| `matched` | boolean | Credited to a click. |
| `type` | string | `non-organic` when matched, else `organic`. |
| `match_source` | string or null | `referrer`, `clipboard`, `fingerprint`, or `null`. |
| `referrer_source` | string or null | `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo`, `meta`, or `null`. |
| `match_confidence` | string or null | `guaranteed`, `high`, `medium`, `low`, or `null`. |
| `install_state` | string or null | `install`, `reinstall`, `update`, or `null`. |
| `is_reinstall` | boolean | |
| `fraud_flags` | string array | Rule names from [Clicks and installs](/api/clicks-and-installs/); empty when clean. |
| `username` | string | Your username. |
| `slug` | string or null | The matched link's slug. With strict fraud mode on, a flagged install arrives with `"matched": false` **and** the `slug` it was zeroed from. |
| `link` | object or null | `slug`, `target`, `url`, `created_at` of the matched **permanent** link. `null` for organic installs, temporary-link matches and strict-mode zeroed installs. There is no `metadata` here, unlike the install verdict. |
| `device` | object | `device_id`, `device_model`, `device_manufacturer`, `os`, `os_version`, `connectivity_type`, `carrier_mcc`, `carrier_mnc`; each `null` when the SDK did not send it. |
| `ip_hash` | string or null | The salted SHA-256 of the install request's IP (IPv6 cut to /64). |
| `clicked_at` | string or null | The matched click's time. |
| `click_params` | object or null | `deep_link`, `label`, `campaign`, `adgroup`, `creative`, `tracker` from the matched click; `null` when organic or when the click carried none. |
| `deep_link` | string or null | Mirrors `click_params.deep_link`. |
| `apple_search_ads` | object or null | Same object as on the verdict: `null` until a token was sent, then `status`, `attribution`, `resolved_at` and, once Apple answered, the campaign record. An `app.install_updated` triggered by Apple has `"status": "resolved"`. |
| `processed_at` | string | When the payload was built. |

The payload has no `routing` object and no `install_attempt_id`.

## Delivery

- Fire-and-forget. The request is sent after the install, claim or Apple Search Ads work has finished; it never delays the SDK's response and a failing endpoint never affects attribution.
- **No retries.** A non-2xx response or a network error is logged on the server and the event is gone. Answer 2xx quickly and do your own processing afterwards.
- There is no explicit timeout on real deliveries; the dashboard's test probe aborts after 10 seconds.
- Deliveries are not ordered. An `app.install_updated` can arrive before the `app.installed` of the same install when the first delivery was slow.

## Test event

"Send test" in [Dashboard: Apps](/dashboard/apps/) calls `POST /api/admin/apps/:id/test-webhook`. It needs a saved URL **and** secret (`400 {"error": {"code": "invalid_request", "message": "Save the webhook URL and secret first"}}`), signs the body exactly like a real delivery, waits up to 10 seconds, and reports `{"delivered": true, "ok": <2xx?>, "status": <http status>}`. A network failure or timeout answers `502 {"error": {"code": "bad_gateway", "message": "Webhook delivery failed: <message>"}}`.

The test payload is an `app.installed` with `"test": true`, `install_id` starting with `test_`, `"matched": false`, `"type": "organic"`, `device.device_model` `"DecTog test probe"`, `device.os` `"test"` and null or empty values elsewhere. It omits `match_confidence`, `install_state`, `is_reinstall` and `apple_search_ads`, which real deliveries always include. Real deliveries never carry `test`.

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
app.post("/dectog/install", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifyDectogSignature(req.body, req.get("x-dectog-signature"))) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.body.toString("utf8"));
  res.status(204).end(); // acknowledge first
  // handle event.event, event.install_id, event.slug, ...
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


@app.post("/dectog/install")
def dectog_install():
    if not verify_dectog_signature(request.get_data(), request.headers.get("x-dectog-signature")):
        abort(401)
    event = request.get_json(force=True)
    # handle event["event"], event["install_id"], event["slug"], ...
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

$event = json_decode($rawBody, true);
http_response_code(204);
// handle $event['event'], $event['install_id'], $event['slug'], ...
```

If a framework parses the body before you can read it, make sure it hands you the original bytes; a re-encoded body (different key order, whitespace or Unicode escaping) will not verify.
