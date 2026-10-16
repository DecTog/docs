---
title: Export raw data
description: Page through your clicks, installs, app opens and events with the account key, download them as CSV from the dashboard, and how exports past 50,000 rows become a file in an R2 bucket.
sidebar:
  order: 6
---

Your clicks, installs, app opens and events are yours to take elsewhere: a warehouse, a spreadsheet, another attribution tool. There are two ways out.

- **The v1 export routes**, for scripts and pipelines: every row of the account, oldest first, a page at a time, with the account key.
- **CSV from the dashboard**, for a person: the Overview's Breakdown table, or the raw rows behind it with the same window and filters. See [Dashboard: Overview](/dashboard/overview/#breakdown).

Both leave out the raw network identifiers: the IP (raw or hashed) and the user agent. They are what attribution matched on, not data about your users you need to reconcile.

## Page through the rows

| Route | Rows |
|---|---|
| `GET /api/v1/clicks` | Every tap on a link, and every click the SDK logged |
| `GET /api/v1/app-installs` | Every install report: first installs, reinstalls (`is_reinstall`) and installs that were app updates into an SDK build (`install_state` `update`). The Overview's Installs count only first installs. |
| `GET /api/v1/app-opens` | Every time a link opened the installed app |
| `GET /api/v1/events` | Every event, with the link it counts for (`credited_slug`) |

These routes need the **account key** (`dtg_…`): an SDK key ships inside your app, so it answers `403` with code `account_key_required`. Sign the request like any other v1 call ([Request signing](/api/overview/#request-signing)); a GET signs the empty body.

| Parameter | Default | Meaning |
|---|---|---|
| `since` | none | Only rows at or after this ISO 8601 time |
| `until` | none | Only rows before this ISO 8601 time |
| `limit` | 100 | Page size, 1 to 1000 |
| `cursor` | none | `next_cursor` of the previous page |

The answer is `{data, next_cursor}`: rows in the order they were recorded (time, then id), and the cursor for the next page, `null` on the last one. A bad `cursor`, `since` or `until`, or a `limit` out of range, answers `400`.

```bash title="Every click since the start of October, as JSON lines"
cursor=""
while :; do
  page=$(dectog GET "/api/v1/clicks?since=2026-10-01T00:00:00Z&limit=1000${cursor:+&cursor=$cursor}")
  echo "$page" | jq -c '.data[]'
  cursor=$(echo "$page" | jq -r '.next_cursor // empty')
  [ -z "$cursor" ] && break
done
```

`dectog` is the signed curl helper from [Request signing](/api/overview/#request-signing), with `DECTOG_API_KEY` set to the account key; the same page has the headers in Node.

To keep a copy current, remember the time of the last row you stored and ask with `since` set to it on the next run. Rows with that exact time come again; skip the ids you already have.

Raw rows live for the retention window (`RETENTION_DAYS`, 400 days by default); older ones are gone. See [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).

### Columns

JSON columns (`link_params`, `fraud_flags`, `metadata`) arrive parsed; `is_reinstall`, `matched` and `via_open` are booleans. A CSV has the same columns in the same order, JSON columns as JSON text.

| Rows | Columns |
|---|---|
| Clicks | `id`, `clicked_at`, `link_slug`, `link_kind`, `source`, `origin`, `device_type`, `os`, `os_major`, `browser`, `device_model`, `device_id`, `country`, `region`, `city`, `lang`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `link_params`, `routing_rule`, `cta`, `cta_at`, `bot_score`, `sdk_name`, `sdk_version`, `metadata` |
| Installs | `id`, `created_at`, `os`, `os_version`, `app_version`, `app_build_number`, `package_name`, `lang`, `timezone`, `device_id`, `device_model`, `device_manufacturer`, `is_reinstall`, `matched`, `matched_slug`, `matched_click_id`, `match_source`, `match_confidence`, `install_state`, `fraud_flags`, `asa_status`, `claimed_at`, `claim_source`, `sdk_name`, `sdk_version`, `metadata` |
| App opens | `id`, `created_at`, `slug`, `click_id`, `device_id`, `install_id`, `app_version`, `os` |
| Events | `id`, `created_at`, `type`, `event_name`, `revenue`, `currency`, `revenue_base`, `transaction_type`, `purchase_type`, `store`, `product_id`, `transaction_id`, `original_transaction_id`, `quantity`, `install_id`, `device_id`, `customer_id`, `matched_slug`, `source`, `web_click_id`, `credited_slug`, `via_open`, `client_event_id`, `client_timestamp`, `metadata` |

`credited_slug` is the link an event counts for: the link that last opened the app, when the event came within its re-engagement window, else the install's link (`matched_slug`). `revenue_base` is the amount in the account's revenue currency. A refund keeps its amount positive with `transaction_type` `refund`; totals subtract it.

## CSV

`GET /api/admin/export.csv` takes the parameters of the [analytics query](/api/admin-api/#analytics) (`interval` or `start` and `end`, `tz`, and the filters) plus `data`:

| `data` | The file |
|---|---|
| `analytics` (default) | The analytics answer as a table: a column per `group_by` dimension, then one per metric, then `conversion` when both clicks and installs are in it |
| `clicks`, `installs`, `opens`, `events` | The raw rows of the window that pass the filters, oldest first. Installs include reinstalls and updates. A filter on a dimension those rows do not have, such as clicks by `match_source`, answers `400`. |

It is a session route: the dashboard's **Export CSV** button and **Raw rows** menu call it. The file starts with a UTF-8 byte order mark so Excel reads accents right, separates rows with CRLF, and quotes a field holding a comma, a quote or a line break. A text that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet shows a campaign called `=HYPERLINK(…)` instead of running it. Numbers are left alone.

Up to 50,000 rows (`EXPORT_STREAM_MAX_ROWS`) stream back at once, with the row count in `x-dectog-rows`.

### Larger exports

Past the limit, what happens depends on whether the deployment has an `EXPORTS` R2 bucket ([Configuration reference](/self-hosting/configuration-reference/)).

- **Without one** the export answers `422` with code `export_too_large`, `rows` and `max_rows`, and a message naming the ways out: a shorter window, tighter filters, or the paged route above.
- **With one** it answers `202` with a job, `{id, data, status: "queued", total_rows, row_count, bytes, error, created_at, finished_at, expires_at, status_url, download_url: null}`, and writes the file in the background. `GET /api/admin/exports/:id` reports the job; once `status` is `done`, `download_url` is a signed link to the file, valid until `expires_at`, seven days after the file was written. The link carries its own credential (`?exp=&sig=`), so it works from a script or a mail without a session; a wrong or expired one answers `403` with code `invalid_download_link`.

The request that asked starts the job, and most files are written before it ends. One that is not finished then is taken over by the next hourly cron, from the start, at most three attempts in all; after the third failure the job is `failed` with the `error`. The window is the one of the moment you asked, however long the job takes. The daily cron deletes a file seven days after it was written (the job turns `expired`) and the job a week after that.
