---
title: Referral programs
description: Give each user a referral link, show the invited friend who invited them, learn on the server when they signed up, and reward the referrer from your webhook.
sidebar:
  order: 4
---

A referral program needs three things: a link that names the user who shares it, a reliable record that a new user arrived through it, and a moment to hand out the reward. DecTog provides all three. The record is made on the server from the link the install was credited to, so a modified app cannot claim someone else's reward.

## 1. Give each user their referral link

```dart
final link = await dectog.createReferralLink(customerId: currentUser.id);
share(link.url); // e.g. https://acme.dectog.com/r-3fa94c1b2e
```

`createReferralLink` returns the user's referral link, creating it on the first call and returning the same link afterwards. It works with the app's ordinary SDK key, which cannot create other links. The link has no destination of its own: it opens the app, or sends the visitor to the store and your app's fallback URL, like any link bound to your app. `customerId` is the id you pass to `identify`. The link's campaign is `referral` unless you pass `campaign`. Slugs starting with `r-` belong to referral links: no other link or temporary link can take one.

From a server, the same call is `POST /api/v1/referral-links` with `{"customer_id": "…"}`; it answers 201 with the new link, or 200 with the existing one.

## 2. The friend installs and signs up

Nothing extra in the app: the friend taps the link, installs, opens the app, and your signup code calls `identify(customerId: newUser.id)`. When that identify is the first one of a **new** customer on an install that is at most 30 days old, not a reinstall, and credited to a referral link, the server records a referral:

| Field | Value |
|---|---|
| `referrer_customer_id` | The customer the link belongs to |
| `referee_customer_id` | The new user |
| `install_id`, `link_slug` | The install and the referral link |
| `match_source`, `match_confidence` | How the install was attributed (`referrer`, `clipboard`, `fingerprint`; `guaranteed` or `high`) |
| `fraud_flags` | The install's fraud flags and the referral rules that hit (see step 5); empty when clean |
| `status` | `converted`, or `rejected` when the app blocks a referral rule that hit |

An install records at most one referral. A user who identifies with the referrer's own id records none. An existing customer who identifies on the new install records none.

## 3. Show who invited them

The install result names the referrer. `install.link?.referrerCustomerId` is the customer whose referral link brought the install, and null for any other link. It arrives in `onAppInstalled` on the first launch, and `getAttributionData()` returns it on every later launch:

```dart
final install = await dectog.getAttributionData();
final referrer = install?.link?.referrerCustomerId; // "u_1042", or null
if (referrer != null && !install!.isReinstall) {
  showInvitedBy(referrer); // look the name up in your own backend
}
```

React Native reads the same field: `(await dectog.getAttributionData())?.link?.referrerCustomerId`.

The server sets it from the link the install was credited to, so nothing in the tapped URL can change it: a `dec_label` or any other parameter added to the link does not. It is there only when the install was credited (`matchConfidence` `guaranteed` or `high`), the same installs that can record a referral. A reinstall (`install.isReinstall`) never records one, so check it before promising a reward. `getAttributionData()` returns null while collection is off (`setEnabled(false)`).

Use it for the screen, not the reward: a modified app can show anything, so grant rewards from the webhook below.

## 4. Reward from the webhook

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
    "fraud_flags": [],
    "created_at": "2026-10-14T13:20:11.000Z",
    "link": { "slug": "r-3fa94c1b2e", "url": "https://acme.dectog.com/r-3fa94c1b2e" }
  },
  "processed_at": "2026-10-14T13:20:11.000Z"
  }
}
```

It is signed like every delivery and retried until delivered, with the same `event_id` each time (see [Webhooks](/api/webhooks/)). Grant the reward there, keyed on `referral.id`. If `match_confidence` matters to your policy, for example rewarding only `guaranteed` matches, decide it there too.

## 5. Watch for self-referrals

Every referral is checked against two [fraud rules](/start/fraud-rules/#referral-rules) of its own, on top of the install's:

- `referral_same_device`: the new customer signed up on a device the referrer used. The usual case is someone installing through their own link, signing in, then making a second account.
- `referral_same_network`: the install came from a network one of the referrer's other devices used in the 30 days before. Never on cellular data. A household trips it too, so it is weak evidence on its own.

`referral.fraud_flags` lists what hit, together with the install's own flags (an emulator, a re-signed build). Decide in your webhook what a flag costs, or let DecTog decide: on the [Apps](/dashboard/apps/#fraud-rules) page, tick **Reject referral** for either rule. A rejected referral is still recorded, as `rejected`, but sends no `referral.converted` and is not counted, so your reward code never sees it.

## In the dashboard

The Overview shows a **Referrals** card once there is one; it counts converted referrals only. A customer's page shows who referred them and whom they referred, with a **rejected** chip and each referral's flags. The **Links** page lists referral links on their own **Referrals** tab, one row per customer with its clicks, installs and recorded referrals, and how many referrals were flagged or rejected; see [Links](/dashboard/links/#referral-links).
