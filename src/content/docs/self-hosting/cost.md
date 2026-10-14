---
title: What it costs to run
description: Measured D1 rows and storage per tap, install, event and ping, the monthly Cloudflare bill at 100k to 10M taps, and the storage ceiling that limits a single deployment today.
sidebar:
  order: 3
---

A self-hosted DecTog runs on one Cloudflare account: one Worker, one D1 database. This page turns measured usage into a monthly bill, and states where a single deployment stops scaling today.

## What one operation uses

Measured by the worker's test suite (`apps/worker/test/cost.test.ts`), which calls each route with a metered database and fails the build when an operation gets more expensive. D1 bills rows, and every index update counts as one more written row.

| Operation | Requests | D1 rows read | D1 rows written | Storage |
|---|---|---|---|---|
| A tap on a link (redirect) | 1 | 5 | 5 | about 670 bytes |
| First-launch install registration | 1 | 12, plus up to 50 when the fingerprint scans candidates | 10 | about 960 bytes |
| Event batch (one conversion) | 1 | 6 | 9 | about 570 bytes |
| App start ping | 1 | 5 | 5 | about 270 bytes |
| Link opened in the installed app (click plus open) | 2 | 13 | 14 | about 1 KB |
| Creating a link | 1 | 6 | 6 | small |

Every authenticated `/api/v1` call also bumps two rate-limit counters; their writes are included above and are about a quarter of all writes.

## A month of traffic

Assumptions, per month: one install for every five taps; each install starts the app 8 times and sends 3 event batches; one tap in ten opens an installed app. Prices are Cloudflare's [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) and [D1](https://developers.cloudflare.com/d1/platform/pricing/) prices as of October 2026: $5 a month including 10 million requests, 30 million CPU milliseconds, 25 billion rows read, 50 million rows written and 5 GB of storage; then $0.30 per million requests, $0.02 per million CPU ms, $0.001 per million rows read, $1.00 per million rows written and $0.75 per GB-month. CPU time is estimated at 5 ms per request; it has not been measured yet.

| Taps a month | Requests | Rows read | Rows written | Storage added | Monthly bill |
|---|---|---|---|---|---|
| 100,000 | 0.4 M | 3 M | 2.2 M | 0.17 GB | $5 |
| 1,000,000 | 3.6 M | 30 M | 22 M | 1.7 GB | $5, plus storage beyond 5 GB |
| 3,000,000 | 10.8 M | 91 M | 65 M | 5.2 GB | about $21, plus storage |
| 10,000,000 | 36 M | 303 M | 218 M | 17 GB | about $184, but see the ceiling below |

At 100,000 taps a month the Workers Free plan's daily limits (100,000 requests and 100,000 written rows a day) also fit on an average day, but a campaign spike can exceed them, so the Paid plan is the safe choice.

## The ceiling today: storage

A D1 database holds at most 10 GB. DecTog keeps every click, install and event row; the retention job blanks personal fields after the retention window but does not delete rows. So storage only grows:

| Taps a month | Months until 10 GB |
|---|---|
| 100,000 | about 57 |
| 1,000,000 | about 6 |
| 3,000,000 | about 2 |
| 10,000,000 | under 1 |

In practice one deployment suits up to about a million taps a month today. Two planned changes raise the ceiling: daily rollup tables, after which raw rows past the retention window can be deleted instead of blanked, and moving the rate-limit counters off D1. Until then, a deployment that grows past this can shorten `RETENTION_DAYS` and delete old rows by hand; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

## Compared with a measurement partner

Mobile measurement partners price per attributed install or conversion: AppsFlyer's published rate was $0.07 per conversion in 2026. At 200,000 installs a month that is about $14,000; the same traffic, a million taps, costs $5 here, with the storage limit above.
