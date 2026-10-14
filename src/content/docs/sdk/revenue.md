---
title: Revenue
description: Report purchases, renewals and refunds with their store transaction so revenue counts once, renewals stay with the link that won the user, and every amount is summed in one currency.
sidebar:
  order: 7
---

`trackConversion` puts revenue on the link that brought the user. Three things make that number trustworthy: the store's transaction id, so a purchase reported twice counts once; the subscription's first purchase on every renewal, so the renewal stays with the same link; and one currency for every total.

## Purchases

Pass the transaction id the store gave you and the store:

```dart
await dectog.trackConversion(
  revenue: 9.99,
  currency: 'EUR',
  productId: 'pro_monthly',
  transactionId: purchase.transactionId,
  store: DectogStore.appStore,       // or DectogStore.play
  purchaseType: DectogPurchaseType.subscription,
);
```

The server stores each transaction once per store and type. A purchase you report again, after a restore, a reinstall or a retry, answers as a duplicate and changes nothing. Without a `transactionId` every call is a new purchase.

## Renewals

A renewal is a purchase with its own transaction id that names the subscription's first purchase as `originalTransactionId`:

```dart
await dectog.trackConversion(
  revenue: 9.99,
  currency: 'EUR',
  productId: 'pro_monthly',
  transactionId: renewal.transactionId,
  originalTransactionId: renewal.originalTransactionId,
  store: DectogStore.appStore,
  purchaseType: DectogPurchaseType.subscription,
);
```

The renewal is credited to the link and install of that first purchase, even when it is reported from another device or after a reinstall.

## Refunds and cancellations

```dart
await dectog.trackConversion(
  revenue: 9.99,                      // the amount refunded
  currency: 'EUR',
  transactionId: refunded.transactionId,
  store: DectogStore.appStore,
  transactionType: DectogTransactionType.refund,
);
```

A refund is subtracted from the link's net revenue and is credited to the same link as the purchase it refunds. A `DectogTransactionType.cancel` records that a subscription will not renew; it moves no money and needs a `revenue` of 0.

## One currency

Every total in the dashboard is in your account's revenue currency, EUR unless you change it in [Settings](/dashboard/settings/). Each amount is converted with the European Central Bank's euro reference rate of its day: the rate published on that day, or the last one before it on weekends and holidays. The event keeps the amount and currency you sent; only the totals are converted.

The server fetches the rates once a day. An amount in a currency whose rate it does not have yet counts as 0 until the next daily run converts it. Currencies the ECB does not publish (about 30 are covered) never convert. Changing the revenue currency converts every stored amount again.

## What the server stores

| Field | From |
|---|---|
| `transaction_id`, `original_transaction_id` | `transactionId`, `originalTransactionId`, up to 128 characters |
| `product_id` | `productId` |
| `store` | `app_store` or `play` |
| `purchase_type` | `one_time` or `subscription` |
| `quantity` | 1 to 10000 |
| `transaction_type` | `purchase`, `refund` or `cancel` |
| `revenue_base` | The amount in the revenue currency, filled by the server |

The wire format is on [Events and attribution](/api/events-and-attribution/).
