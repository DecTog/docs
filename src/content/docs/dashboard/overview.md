---
title: Overview
description: Every KPI, chart and panel on the dashboard's Overview screen, with the exact definition the server uses for each number.
sidebar:
  order: 1
---

The Overview is the first screen after you sign in, at https://app.dectog.com/dashboard. It shows clicks, installs, conversion, revenue and attribution quality for your whole account, over one of three time ranges, and refreshes itself every 15 seconds. The header reads "Clicks, installs and conversion for your links — live."

Every number on this page is defined below exactly as the server computes it. Several of them do not reconcile with each other by design; the last section lists those cases.

## Controls

| Control | What it does |
|---|---|
| **7d**, **30d**, **90d** | Selects the time range. The default is **7d**. **7d** ends now and starts exactly 7 times 24 hours earlier. **30d** and **90d** are whole calendar days in UTC, today included: they start at midnight UTC 29 or 89 days ago, and their totals come from the daily rollups (see [Scheduled jobs](/self-hosting/scheduled-jobs-and-retention/#daily-rollups-both-triggers)). |
| Live refresh | Every 15 seconds the page reloads the overview, the recent events and the attribution-quality panel. The timer restarts when you change the range. |
| **Set up with your agent** | Copies the prompt `Read https://dectog.com/SKILL.md and help me get started with DecTog` to the clipboard. The label reads "Prompt copied — paste it into your agent" for two seconds. If the clipboard is blocked, a browser prompt shows the text instead. See [Automation and agents](/guides/automation-and-agents/). |

Under the title, the line "Live · refreshes every 15s · comparing against the previous {N}-day window" names the comparison window used by every delta chip.

The page shows "Loading analytics…" on first load. If the overview request fails, the whole page is replaced by a red alert with the server's error message. If only the attribution-quality request fails, that panel says so and the rest of the page still renders. If the recent-events request fails, the Recent events card shows its empty state.

## How deltas work

Each KPI card carries a chip that compares the current window with the previous window of the same length: for **7d**, the 7 days before the current 7 days.

- The chip shows the relative change, rounded to one decimal: `(current − previous) ÷ previous × 100`.
- When the previous window is 0, there is no percentage to show: the chip is hidden if the current value is above 0, and reads **0%** if it is 0 too.
- Green with ▲ and a `+` means zero or positive; red with ▼ and a `−` means negative.
- For **Conversion** the delta is the relative change of the rate, not a difference in percentage points. A rate that moves from 2.0% to 3.0% shows ▲ 50%.

## KPI cards

All seven cards always render. Counts use the server's own timestamps, so an install counts in the window in which the SDK reported it, not when the device installed the app.

| Card | Caption | What the number is |
|---|---|---|
| **Clicks** | | Every click in the window: web taps on your links plus clicks reported by the SDK. Requests from bots never create a click. |
| **Unique visitors** | | The number of distinct hashed IP addresses among those clicks. It counts IP addresses, not devices or people: two phones on one Wi-Fi network are one visitor, and one phone that moves from Wi-Fi to cellular is two. |
| **Installs** | `{n} attributed · {n} reinstalls excluded` | Installs reported in the window, excluding reinstalls. "Attributed" is the subset the server matched to a click. Reinstalls go through the same matching as any other install but are left out of this count; the second number says how many were left out. |
| **Conversion** | `installs ÷ clicks` | Non-reinstall installs, organic ones included, divided by clicks, as a percentage with one decimal. Because organic installs count, the rate can exceed 100%, for example when the app gets installs that never came through a link. |
| **Revenue** | `tracked conversions` | Net revenue of the window: purchases minus refunds, each converted into your revenue currency (Settings) with the ECB rate of its day. Amounts whose rate is not known yet count as 0 until the daily conversion run. |
| **Leads** | `signup events` | Events whose type is `lead`. |
| **Opens** | `link re-opened the installed app` | App opens in the window: times a link opened an already installed app, as reported by the SDK. |

## Charts and cards

### Clicks over time

An area chart with one point per calendar day in UTC. Days without clicks show 0. Labels are short dates such as "Oct 3".

The chart buckets the last N calendar days. For **30d** and **90d** that is exactly the KPI window. For **7d** the KPI window starts exactly 7 times 24 hours ago, so clicks from the partial day before the first bucket count in the **Clicks** KPI but do not appear in the chart.

### Installs by campaign

Bars are installs. The label above each bar is that bucket's conversion rate; it is blank for buckets with no clicks.

- Each attributed, non-reinstall install is grouped by the `utm_campaign` query parameter of the click it was matched to. `(direct)` collects matched clicks that carried no `utm_campaign`.
- `Organic` collects installs that were not matched to any click. It has 0 clicks, so it never shows a conversion label.
- Clicks are grouped by their own `utm_campaign`, so a campaign with clicks but no installs still appears, with a bar of 0.
- Conversion per bucket is installs ÷ clicks, one decimal.
- The chart shows the top 8 buckets, sorted by installs, then clicks.

This chart reads the `utm_campaign` parameter on the URL people tapped. It does not read the **Campaign** field in a link's Tracking section, nor `dec_campaign`. Those values are stored on the click and returned to the app, but they do not feed this chart. See [URL parameters](/links/url-parameters/).

### Installs by source

The same grouping, using `utm_source` instead of `utm_campaign`, with no top-8 limit.

### Devices

A donut of clicks in the window by device type, with a legend reading `{percent} · {count}`. The types are **iOS**, **Android**, **Desktop** and **Other** (a click whose device type is none of those). "Desktop" is any browser that does not identify as iPhone, iPad, iPod or Android, which includes iPadOS Safari in desktop mode.

### Attribution quality

Subtitle: "How installs were matched to clicks — deterministic referrer beats fingerprint."

Non-reinstall installs in the window, grouped by how they were matched, as bars reading `{percent} · {count}` in this order:

| Bar | Installs counted |
|---|---|
| **Install referrer (deterministic)** | Matched through an install referrer handed over by a store (Google Play, Huawei, Samsung, Xiaomi, vivo) or by Meta's on-device referrer. |
| **Copied link (deterministic)** | Matched through a link found on the device's clipboard: the iOS tap-to-store page copies it, or the user pasted it. |
| **Device fingerprint (probabilistic)** | Every other matched install, including rows that record no match source. |
| **Organic** | Installs not matched to a click. With strict fraud mode on, flagged installs are stored as unmatched and land here. |

Empty state: "No installs in this window."

Inside the card, an amber box appears when at least one non-reinstall install carries fraud flags: `{n} install(s) flagged for fraud signals`, followed by up to six chips reading `{reason} · {count}`. The reasons are the rule names `emulator`, `impossible_speed`, `install_velocity_ip`, `click_storm_ip`, `stale_referrer`, `stale_clipboard`, `stale_meta` and `click_reuse`. The headline count excludes reinstalls; the per-reason counts include them.

### Recent events

Subtitle: "Leads, conversions and custom events from your app — track them with the DecTog SDK."

The 12 most recent events of any type (`identify`, `lead`, `conversion`, `custom`), newest first. **This card ignores the time range.** Each row shows a type chip (green for `conversion`, orange for `lead`, gray otherwise), the event name (or the type when there is no name), `/{slug}` when the event is attributed to a link, and on the right either the amount in the event's own currency (a refund with a minus sign) when the event carries revenue, or the event's date.

Empty state: "No events yet — call `identify` / `trackConversion` in the SDK." See [Events](/sdk/events/).

### Top devices

The top 8 device models among installs in the window that reported a model, with an install count. A model DecTog knows shows its marketing name with the code after it (`Samsung Galaxy S23 Ultra SM-S918B`, `iPhone 15 Pro Max iPhone16,2`); any other shows as `{model} · {manufacturer}`. Android names come from Google Play's supported-devices list, refreshed weekly for the models your installs report; iPhone names from a list in DecTog for the iPhone 8 to the iPhone 16e. The count includes reinstalls; when some of them are reinstalls the row adds `(+{n} re)`.

Empty state: "No device data yet — enable the device tier in the SDK (`DectogCollection.deviceTier`)." See [Device data and privacy](/sdk/device-data-and-privacy/).

### Carriers (MCC/MNC)

The top 8 mobile carriers among installs that reported one, as `{mcc}/{mnc}` with an install count, reinstalls included. Only the Android SDK reports carrier codes.

Empty state: "No carrier data (Android only)."

### Connectivity at install

The top 6 connection types reported at install, such as `wifi` or `mobile`, with install counts, reinstalls included.

Empty state: "No connectivity data yet."

### Top referrers

The top 8 referring sites by clicks in the window. DecTog stores only the origin of the referring page (`https://news.ycombinator.com`, never the full URL). Clicks without a referrer, and clicks referred from one of DecTog's own domains, count as `(direct/none)`. Hover a truncated value to see it in full; the bar is relative to the sum of the rows shown.

Empty state: "No clicks in this window."

### Top countries by clicks

The top 10 countries by clicks in the window, shown as a flag plus the two-letter code from Cloudflare's geolocation of the click. An unknown country shows as `??` without a flag. The card has no empty-state text.

## Breakdown

Below the charts, **Breakdown** puts every metric side by side for one dimension: clicks, installs, conversion, opens, leads and revenue, per link, campaign, country, platform, OS, language, referrer, UTM value, app version, match source, page button (the button a visitor took on a link page) or event source (the app, the website through `dectog.js`, or a store) (the **By** menu). It covers the range selector's window, cut into days in your browser's time zone, and loads on its own rather than on the 15-second refresh.

- Click a value to keep only it. A chip appears above the table, "Country is GB"; click another value to add it to the chip.
- Hover a row and click **−** to leave that value out instead: "Country is not US". A chip keeps values or leaves them out, not both; picking the other way for the same dimension replaces it.
- Click **is** or **is not** on a chip to turn it around, **×** to remove it, **Clear** to remove them all. Chips stay when you change **By**, so you can keep Germany and break it down by campaign.
- `(organic)` is what no link brought, such as installs no tap won; `(none)` is a link that carried no value for the dimension, such as a tap without a `utm_source`. A metric the dimension does not apply to shows `—`: taps have no app version, and only installs have a match source.
- An install counts under its winning tap's values, an event under the link it is credited to (the re-opening link inside its window, else the install's), the same rules as the [link stats](/dashboard/links/).

The table shows the 50 largest values by clicks. **Export CSV** downloads it with up to 1,000; **Raw rows…** downloads the clicks, installs, app opens or events of the window that pass the chips; the installs file also has the reinstalls and app updates the Installs column leaves out, and a chip the rows cannot have (clicks by match source) stops the download with a message. A file over 50,000 rows is written in the background when the deployment has an exports bucket: the card says so and turns into a download link, good for 7 days. See [Export raw data](/api/export/).

The numbers read the raw rows, so they reach back as far as the retention window keeps them. They can differ from the KPI cards at the window's edges: for 30 and 90 days the cards cut days in UTC and Breakdown in your time zone, and for 7 days the cards count the last 168 hours and Breakdown seven calendar days, today included. In a browser set to UTC the 30- and 90-day totals agree. The same query is in the [Admin API](/api/admin-api/#the-analytics-query) and in the MCP `analytics` tool.

## Match confidence & referrer health

This panel reads a separate endpoint and answers a different question from the cards above: not how many installs, but how reliably they were matched. Its intro text: "How reliably installs were matched in the last {N} days: the confidence the server assigned, how often the store handed back the install referrer, and whether the fingerprint agreed with the referrer when both existed."

:::caution[Different totals]
The panel counts every install in the window, including reinstalls and app updates. Its totals are higher than the Installs KPI, which excludes reinstalls.
:::

### Tiles

| Tile | Value | Caption | Color rule |
|---|---|---|---|
| **Credited installs** | Matched installs ÷ all installs. | `{m} of {n} matched to a click` | None. |
| **Android referrer coverage** | Android installs whose store install-referrer read returned `ok`, divided by all Android installs. | `{delivered} delivered · {missing} missing of {n}`, or `no Android installs in this window`. "Missing" counts the read statuses `service_unavailable`, `timeout`, `error` and `not_available`; other statuses count in neither number. | Amber when more than 5% of Android installs are missing. |
| **Fingerprint accuracy** | Among installs matched by a deterministic signal, the share where the fingerprint, run in the background, would have picked the same click with high confidence. | `shadow match agreed on {a} of {n} referrer installs`, or `needs referrer-matched installs to measure`. | Green at 90% or above. |
| **Click → install** | `{median} median`: the median time between the server-side click time and the install report, over up to the 5,000 most recent matched installs in the window. | `p90 {x} · {n} matched installs`, or `no matched installs yet`. | None. |

Durations are formatted as `45s`, `2m 10s`, `1h 5m` or `3d 2h`. A `—` means there is nothing to measure.

### Confidence per platform

One bar per platform (the install's reported OS: **iOS**, **Android**, or the raw value), sorted by installs. The label on the right reads `{percent} credited · {n} installs`, and on Android adds `· referrer {percent}`.

Each bar is split into segments by the confidence the server assigned. Hover a segment for `{Label}: {count} ({percent}) — {hint}`:

| Segment | Color | Hint | Meaning |
|---|---|---|---|
| **Guaranteed** | dark green | `install referrer, copied link or paste` | A deterministic signal named the click. Credited. |
| **High** | light green | `fingerprint, corroborated and unique — credited` | The fingerprint found one clearly best click. Credited. |
| **Medium** | amber | `routed to the link, not credited` | The fingerprint found a plausible click. The app receives the deep-link route, but the install does not count as attributed. |
| **Low** | light gray | `ambiguous or contradicted — nothing` | A tie or a contradiction. No route, no credit. |
| **No candidate** | near white | `no click from this network in the window` | Installs the server assigned no confidence to: no click from the same network within the window, or an install that skipped matching (app updates, replayed signals). |

The legend under the bars repeats the five labels, each with its hint on hover. What the levels mean, and the windows involved, are explained in [How attribution works](/start/how-attribution-works/).

### Install referrer reads

Chips reading `{status} · {count}` for every referrer-read status reported in the window, sorted by count. Hover a chip for its plain-English meaning. Statuses that indicate a failed read are amber.

| Status | Tooltip | Amber |
|---|---|---|
| `ok` | referrer delivered | |
| `organic` | store reported organic | |
| `feature_not_supported` | store too old for the API | |
| `service_unavailable` | store service unavailable | yes |
| `developer_error` | developer error | yes |
| `permission_error` | permission error | yes |
| `timeout` | timed out | yes |
| `error` | read error | yes |
| `not_available` | no store app | |
| `not_android` | iOS (no referrer API) | |
| `unknown` | not reported (older SDK) | |

Empty state: "No referrer telemetry yet."

### Kept out of matching

`{n} existing users who updated to an SDK build — recorded as app updates, never matched against the click pool.` This is the number of reports in the window whose install state was `update`: the app was already on the device before the SDK shipped, so there is no install to attribute.

### Rejected SDK requests

Calls to the `/api/v1` API that the server refused as malformed (400, 413 or 422) in the window, grouped by route and reason, most frequent first, at most 10 rows: the route (for example `POST /api/v1/events`), the error code and message, how often and when last. The server keeps the request's SHA-256 and size, never its body, and deletes the rows after 30 days. Authentication failures and rate limits are not listed. An SDK build sending a field the server rejects shows up here before anyone notices missing data.

### SDK versions in the wild

A table of the SDK builds that reported in the window: the build (`flutter_dectog 1.0.0`), the **New installs** registered by it, the **Events** it sent, and when it was **Last seen**. New installs show what your current release ships; events show which older builds are still running. Up to 20 builds, most recently seen first. Empty: "No SDK build reported in this window."

### Empty and failed states

- "No installs in this window." when the window has no installs at all.
- "The attribution-quality read-out is unavailable right now." when the endpoint fails. The rest of the Overview still renders.

## Retention

Below the match-confidence panel, **Retention** answers "did the users stay?" for the installs of the last 90 days, whatever the range selector says. Two boxes filter it: **All links** or one link (installs credited to it), and **All platforms**, **iOS** or **Android**. The card loads on its own and does not take part in the 15-second refresh.

The cohort is the first installs that carry a device id; reinstalls and app updates are left out, and a device counts once, on its first install day. A device is active on a day when the app started (the SDK's device ping), a link opened it, or it sent an event that day. Days are calendar days in UTC: day 1 is the UTC day after the install's, so an install at 23:30 that opens again at 00:30 is retained on day 1, and one that opens again at 23:50 the same day is not.

| Part | What it shows |
|---|---|
| **Day 1**, **Day 7**, **Day 30** | The share of installs at least that many days old that were active on that exact day after their install, with "{retained} of {installs} installs"; "no installs old enough yet" until one is |
| The weekly table | One row per install week (Monday to Sunday, UTC), newest first, with its installs, then for each of the next eight weeks the share active in that week, shaded darker from 10%, 30% and 60%. A week that has not started is `·`. Hover a cell for the counts. |
| The note under the table | How many installs carried no device id (the app turned collection off) and are not counted |

The figures read the raw rows, so they reach back as far as the retention window keeps them. See [Admin API](/api/admin-api/#analytics).

## Apple Search Ads

This card appears only once the window contains at least one install whose iOS SDK sent an AdServices token, whatever the outcome of the lookup. Its text: "iOS installs whose AdServices token Apple matched to one of your campaigns. Campaign names are not part of Apple's payload — the ids match your Apple Ads reports."

| Tile | Caption | Counts installs whose lookup status is | Color rule |
|---|---|---|---|
| **Attributed** | `installs Apple credited to a campaign` | `resolved`: Apple returned an attribution. | Green when above 0. |
| **No attribution** | `Apple found no matching record` | `no_attribution`. | None. |
| **Pending** | `waiting on Apple · {n} expired or invalid` | `pending`. The `{n}` in the caption adds up `expired` (no answer within 24 hours of the token), and `invalid` (Apple rejected the token, or none arrived). | Amber when above 0. |

Below the tiles, up to 8 rows list the campaigns behind the attributed installs: `campaign {id}` (or `campaign —` when Apple sent no id), a chip reading `view-through` for impression claims and `tap-through` otherwise, and the install count. Rows are grouped by campaign id and claim type, so one campaign can appear twice.

These counts include reinstalls. The lookup lifecycle (three inline attempts, hourly retries, the 24-hour token limit) is described in [Clicks and installs](/api/clicks-and-installs/).

## Recent installs

The 12 newest installs, whatever the range: a chip with how each was matched (`referrer`, `clipboard`, `fingerprint`, or `organic`), the link it was credited to, the OS and device model, a fraud chip when rules fired, and the time. Clicking one opens the **install detail**:

- **Verdict**: credited link or organic, match source, confidence, reinstall, fraud flags.
- **Why**: the signal that named the click (store referrer, pasted link, Meta referrer, a late claim), or the fingerprint's best and runner-up candidates with each signal marked agree, mismatch or missing (device model, OS version, language, screen, CPU, network), their scores, the gap between them, the window that applied and how many repeat taps were merged. When a deterministic signal decided, the fingerprint's own pick is shown as well. When the fingerprint did not run, the reason is given.
- **Tap**: the credited (or routed) tap with its time, device and country, and any late claim that upgraded the verdict.
- **App opens** and **Events** of that install.

Installs recorded before match explanations existed show the verdict without the **Why** part.

## Numbers that do not add up to each other

These differences are by design. Knowing them saves you from chasing phantom discrepancies.

- **Installs vs the quality panel.** Reinstalls are matched like any other install; only app updates and replayed signals skip the fingerprint. They are excluded from the Installs KPI, the campaign, source and attribution-quality charts and the per-link install counts, but the Match confidence panel, Top devices, Carriers, Connectivity and Apple Search Ads include them.
- **Conversion above 100%.** Organic installs count in the numerator.
- **Revenue.** Net of refunds and converted into one currency, here and on the Links and Customers screens. A purchase in a currency whose rate has not arrived yet counts as 0 until the next daily run.
- **Campaign and source charts.** They read `utm_campaign` and `utm_source` from the tapped URL, never the link's Tracking fields.
- **Recent events.** Always the latest 12, whatever the range.
- **Per-link numbers.** The [Links](/dashboard/links/) screen shows lifetime totals, so its columns do not match a 7-, 30- or 90-day Overview.
- **Fraud counts.** The headline excludes reinstalls; the per-reason chips include them.
- **Match sources under strict mode.** A flagged install appears as Organic here even though the server still records which link it came from. See [Apps](/dashboard/apps/).

:::note[Self-hosting]
The screen is identical on a self-hosted deployment. The **Set up with your agent** prompt always points at `https://dectog.com/SKILL.md`.
:::
