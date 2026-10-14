---
title: Referral programs
description: Give each user a referral link, learn on the server when a friend installed through it and signed up, and reward the referrer from your webhook.
sidebar:
  order: 4
---

A referral program needs three things: a link that names the user who shares it, a reliable record that a new user arrived through it, and a moment to hand out the reward. DecTog provides all three. The record is made on the server from the link the install was credited to, so a modified app cannot claim someone else's reward.

## 1. Give each user their referral link

```dart
final link = await dectog.createReferralLink(customerId: currentUser.id);
share(link.url); // e.g. https://acme.dectog.com/r-3fa94c1b2e
```

`createReferralLink` returns the user's referral link, creating it on the first call and returning the same link afterwards. It works with the app's ordinary SDK key, which cannot create other links. The link has no destination of its own: it opens the app, or sends the visitor to the store and your app's fallback URL, like any link bound to your app. `customerId` is the id you pass to `identify`. The link's campaign is `referral` unless you pass `campaign`.

From a server, the same call is `POST /api/v1/referral-links` with `{"customer_id": "…"}`; it answers 201 with the new link, or 200 with the existing one.

## 2. The friend installs and signs up

Nothing extra in the app: the friend taps the link, installs, opens the app, and your signup code calls `identify(customerId: newUser.id)`. When that identify is the first one of a **new** customer on an install that is at most 30 days old, not a reinstall, and credited to a referral link, the server records a referral:

| Field | Value |
|---|---|
| `referrer_customer_id` | The customer the link belongs to |
| `referee_customer_id` | The new user |
| `install_id`, `link_slug` | The install and the referral link |
| `match_source`, `match_confidence` | How the install was attributed (`referrer`, `clipboard`, `fingerprint`; `guaranteed` or `high`) |

An install records at most one referral. A user who identifies with the referrer's own id records none. An existing customer who identifies on the new install records none.

## 3. Reward from the webhook

Webhooks subscribed to `referral.converted` that take the referral link's app (or every app) receive:

```json
{
  "event_id": "evt_1f0c…",
  "event": "referral.converted",
  "created_at": "2026-10-14T13:20:11.000Z",
  "attempt": 1,
  "data": {
  "username": "acme",
  "referral": {
    "id": "8b1d…",
    "referrer_customer_id": "u_1042",
    "referee_customer_id": "u_2210",
    "install_id": "3d2b6c1e-…",
    "match_source": "referrer",
    "match_confidence": "guaranteed",
    "created_at": "2026-10-14T13:20:11.000Z",
    "link": { "slug": "r-3fa94c1b2e", "url": "https://acme.dectog.com/r-3fa94c1b2e" }
  },
  "processed_at": "2026-10-14T13:20:11.000Z"
  }
}
```

It is signed like every delivery and retried until delivered, with the same `event_id` each time (see [Webhooks](/api/webhooks/)). Grant the reward there, keyed on `referral.id`. If `match_confidence` matters to your policy, for example rewarding only `guaranteed` matches, decide it there too.

## In the dashboard

The Overview shows a **Referrals** card once there is one. A customer's page shows who referred them and whom they referred.
