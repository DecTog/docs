---
title: What it costs to run
description: Measured D1 rows and storage per tap, install, event and ping, the monthly Cloudflare bill at 100k to 10M taps, and how the retention window sets the storage a deployment needs.
sidebar:
  order: 3
---

A self-hosted DecTog runs on one Cloudflare account: one Worker, one D1 database. This page turns measured usage into a monthly bill, and states where a single deployment stops scaling today.

## What one operation uses

Measured by the worker's test suite (`apps/worker/test/cost.test.ts`), which calls each route with a metered database and fails the build when an operation gets more expensive. D1 bills rows, and every index update counts as one more written row.

| Operation | Requests | D1 rows read | D1 rows written | Storage |
|---|---|---|---|---|
| A tap on a link (redirect) | 1 | 5 | 5 | about 670 bytes |
| First-launch install registration | 1 | 12, plus up to 50 when the fingerprint scans candidates | 6 | about 960 bytes |
| Event batch (one conversion) | 1 | 3 | 7 | about 570 bytes |
| App start ping | 1 | 1 | 3 | about 270 bytes |
| Link opened in the installed app (click plus open) | 2 | 5 | 10 | about 1 KB |
| Creating a link | 1 | 3 | 3 | small |
| The daily rollup, per day | none (cron) | about 2 per raw row of that day | one per link and platform active that day | about 100 bytes per written row |

The rate limits on authenticated `/api/v1` calls and on the interstitial beacon are counted by Cloudflare's [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings, which `wrangler.jsonc` and the setup script declare (`RL_TENANT`, `RL_DEVICE`, `RL_IP`, `RL_BEACON`). A deployment without them falls back to counters in D1, which add 2 read and 4 written rows to every v1 call. The sign-in and password-reset limits stay in D1.

## A month of traffic

Assumptions, per month: one install for every five taps; each install starts the app 8 times and sends 3 event batches; one tap in ten opens an installed app. Prices are Cloudflare's [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) and [D1](https://developers.cloudflare.com/d1/platform/pricing/) prices as of October 2026: $5 a month including 10 million requests, 30 million CPU milliseconds, 25 billion rows read, 50 million rows written and 5 GB of storage; then $0.30 per million requests, $0.02 per million CPU ms, $0.001 per million rows read, $1.00 per million rows written and $0.75 per GB-month. CPU time is estimated at 5 ms per request; it has not been measured yet.

| Taps a month | Requests | Rows read | Rows written | Storage added | Monthly bill |
|---|---|---|---|---|---|
| 100,000 | 0.4 M | 2.5 M | 1.6 M | 0.17 GB | $5 |
| 1,000,000 | 3.6 M | 25 M | 16 M | 1.7 GB | $5, plus storage beyond 5 GB |
| 3,000,000 | 10.8 M | 75 M | 49 M | 5.2 GB | about $6, plus storage beyond 5 GB |
| 10,000,000 | 36 M | 251 M | 162 M | 17 GB | about $128, plus storage; see the ceiling below |

Rows read include the fingerprint's candidate scan at its maximum and the daily rollup; they never come near the 25 billion included.

At 100,000 taps a month the Workers Free plan's daily limits (100,000 requests and 100,000 written rows a day) also fit on an average day, but a campaign spike can exceed them, so the Paid plan is the safe choice.

## The ceiling: storage and the retention window

A D1 database holds at most 10 GB. The daily job deletes clicks, installs, events and app opens older than `RETENTION_DAYS` (default 400) once the daily rollups hold their day, so storage levels off at about the retention window's worth of raw rows. The rollups keep the totals beyond it: the Overview's clicks, installs, opens, leads and revenue, and every link's lifetime numbers. Breakdowns by country, referrer, campaign, device model and the like read raw rows, so they cover the retention window only. So does the Overview's Breakdown card and its analytics query, and each answer reads the window's raw rows of every table it counts: for a 90-day window at 100 taps a day, about 9,000 click rows plus the installs, opens and events, each with its click. Its LTV column also reads every later event of the window's installs, through an index on the install.

| Taps a month | Raw rows for 400 days | Longest `RETENTION_DAYS` that fits 10 GB |
|---|---|---|
| 100,000 | about 2.3 GB | the default, 400 |
| 1,000,000 | about 23 GB | about 175 |
| 3,000,000 | about 69 GB | about 55 |
| 10,000,000 | about 230 GB | about 17 |

The rollups themselves are small: one row of about 100 bytes per link, platform and day with activity, about 11 MB a year for 100 busy links. One deployment therefore suits a few million taps a month with a shorter retention window; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

## Compared with a measurement partner

Mobile measurement partners price per attributed install or conversion: AppsFlyer's published rate was $0.07 per conversion in 2026. At 200,000 installs a month that is about $14,000; the same traffic, a million taps, costs $5 here, with `RETENTION_DAYS` at about 175.
