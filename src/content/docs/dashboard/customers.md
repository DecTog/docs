---
title: Customers
description: The Customers screen lists the users your app identified with the SDK and shows, for each one, the click and install that brought them in, their devices, events and app opens.
sidebar:
  order: 4
---

The Customers screen, at https://app.dectog.com/dashboard/customers, lists every customer your app has identified by calling `identify` in the SDK, together with the link that brought each one in. Its header reads "Users your app identified with the SDK's `identify` — and the link that brought them in." The screen is read-only: there is no edit and no delete.

A customer exists as soon as the SDK sends an `identify` event with a customer ID. How to send one, and what the server stores, is in [Events](/sdk/events/).

## The list

| Element | Behavior |
|---|---|
| **Search** (placeholder "Search name, email, phone or ID") | Waits 250 ms after you stop typing, then searches on the server for the text anywhere inside the customer ID, name, email or phone. The query is cut to 200 characters. Every new search returns to page 1. |
| Rows | Clicking anywhere on a row opens the customer's detail page. The name is also a link, for keyboard users. |
| Pagination | 50 customers per page, newest first. A footer reading `1–50 of 312` with **Previous** and **Next** appears only when there are more than 50 results. |

### Columns

| Column | What it shows |
|---|---|
| **First seen** | The date and time of the customer's first `identify`. |
| **Customer** | The name, or the customer ID when there is no name. Under it: the email masked as `e****@domain.com` (the detail page shows it in full), or the ID in monospace when there is a name but no email. An amber **Shared device · {n}** chip appears when other customers sent events from one of this customer's devices; its tooltip reads "Shares a device with {n} other customer(s)". |
| **Attributed link** | `/{slug}` of the link whose click was matched to the customer's install, or **Organic**. |
| **Country** | A flag and the country name of the matched click. **Unknown** for organic customers and for clicks without a country. |

Empty states: "No customers yet — call `DecTog.identify(customerId: …)` in your app after sign-in." and "No customers match your search."

### How a customer is tied to an install

The server resolves one install per customer, trying in order:

1. the install ID the first `identify` call carried;
2. the install ID stamped on the customer's earliest event that has one;
3. the newest install on any device that sent the customer's events, preferring attributed installs.

The third step matters because the SDK forgets the install ID across restarts; the device ID still links the events to the install.

## The detail page

Opening a row loads `?id={customer_id}`. The page starts with an **← All customers** link, then the name (or ID), the ID in monospace, and the shared-device chip when applicable. "Loading customer…" shows while it loads; an unknown ID shows the server's error `Customer not found`.

### Stats

Four tiles: **Events**, **Leads** (events of type `lead`), **Conversions** (events of type `conversion`) and **Revenue**, the sum of `revenue` over the customer's events in every currency, shown with a `$` sign.

### Profile

Subtitle: "Set by identify(). A later call replaces each field it sends; fields it leaves out keep their value."

| Field | Value |
|---|---|
| **Name**, **Email**, **Phone** | As sent by `identify`. A later `identify` that sends a field overwrites the stored value; a field the later call omits keeps its old value. The subtitle's "first-seen values win" describes only the install association: the first install a customer was identified on stays attached. The email is shown in full here. |
| **Customer ID** | Your identifier. |
| **First seen** | When the customer record was created. |
| **Last identified** | The last time an `identify` touched the record. |
| **First event**, **Last event** | From the customer's events. |
| **Devices** | Up to 20 distinct device IDs seen on the customer's events, plus the install's device. |

Empty fields are hidden. Name, email and phone are stored in plain text; see [Privacy and data](/self-hosting/privacy-and-data/).

### Attribution

Subtitle: "The link click that led to this customer's install." Empty state: "No install linked to this customer yet."

| Field | Value |
|---|---|
| **Attributed link** | `/{slug}` as a link to the live URL for a permanent link; the slug in plain monospace when the link was temporary; **Organic** otherwise. |
| **Match** | **Install referrer (deterministic)**, **Copied link (deterministic)**, **Device fingerprint (probabilistic)** or **Organic**. |
| **Referrer source** | Which store or SDK handed over the referrer: `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo` or `meta`. |
| **Clicked at**, **Installed at** | The server-side times of the matched click and of the install report. |
| **Country**, **Region**, **Network** | From the click: the country and city, the region, and the network provider with its AS number. |
| **Click device** | The click's device type, OS and browser, such as `android · Android 14 · Chrome`. |
| **Referrer** | The origin of the page that sent the click. |
| **UTM** | The click's `utm_*` parameters, as `source=… · medium=… · campaign=…`. |
| **Link params** | The tracking values stored on the click, as `label=… · campaign=… · adgroup=… · creative=… · tracker=…`, from the link's Tracking fields or `dec_*` overrides. |
| **Deep link** | The `dec_deeplink` route the click carried. |
| **Click IP** | The raw IP address of the click. |
| **Fraud flags** | Amber chips with the rule names the install tripped, such as `emulator` or `click_reuse`. |

What each match method and confidence means is explained in [How attribution works](/start/how-attribution-works/).

### Shared device

Shown only when other customers share a device. Subtitle: "Other customers identified on one of this customer's devices — account sharing, multiple accounts, or a test device." A table of **Customer** (a link to that customer, with the email), **Device ID** and **Last seen on device**, up to 50 rows.

### App & device

Subtitle: "Reported by the SDK at install." Shown when the customer has an install; empty values are hidden.

**Platform**, **App version** (with the build number in parentheses), **Package**, **OS** (name and version), **Device** (manufacturer and model), **Device kind**, **Physical device** (Yes or No), **Reinstall** (Yes or No), **Screen** (such as `1080×2400 @2.625x`), **CPU**, **Language**, **Timezone**, **Connectivity**, **Carrier (MCC/MNC)**, **Installer** (the package that installed the app), **Install time (device)**, **Install IP** (the raw IP of the install report), **Device ID** and **Install ID**.

Which of these the SDK sends depends on its data tier; see [Device data and privacy](/sdk/device-data-and-privacy/).

### Events

Titled **Events ({total})**, where the total counts every event of the customer. The table shows the latest 200, newest first.

| Column | Value |
|---|---|
| **When** | Date and time. |
| **Type** | A chip: `conversion` (green), `lead` (orange), `identify` (blue) or `custom` (gray). |
| **Name** | The event name, or `—`. |
| **Revenue** | The amount followed by its currency code, such as `9.99 EUR`, or `—`. |
| **Link** | `/{slug}` when the event is attributed, or `—`. |
| **Metadata** | The event's JSON, shortened; hover to see it formatted in full. |

Empty state: "No events for this customer."

### App opens

Shown only when there are any. Subtitle: "Times a DecTog link re-opened the installed app on this customer's devices." Each row is `/{slug}` with the date and time; the latest 50 across the customer's devices.

:::note[Self-hosting]
The screen behaves the same on a self-hosted deployment. The daily retention job blanks a customer's name, email and phone after the configured retention period; see [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/).
:::
