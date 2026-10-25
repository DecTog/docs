---
title: Installs
description: The Installs screen lists every install with the reason it was credited, filters and a search, and a Watch mode that shows taps and installs as they arrive while you test on a phone.
sidebar:
  order: 3
---

The Installs screen, at https://app.dectog.com/dashboard/installs, lists every install the SDK recorded, newest first, with how it was matched. Its header reads "Every install and why it was credited." The Overview's [Recent installs](/dashboard/overview/#recent-installs) card links here with **View all**, and the installs sheet on the [Links](/dashboard/links/) screen with **Open in Installs**, which opens the screen searched for that link.

## The list

Each row shows when the app was installed, the verdict (`referrer`, `clipboard` or `fingerprint` with the confidence, or `organic`), the link it was credited to, the OS with its version and the device model, the app version, and chips for a reinstall and for each fraud flag (for example `emulator` for a simulator build). 25 rows load at a time; **Load more** adds the next 25.

Above the list:

- **Search** finds one install id, one device id or one link. A viewer searches install ids and links only, because viewers never see device ids.
- **iOS and Android** narrows to one platform.
- **Every verdict** narrows to credited or organic installs, or to one signal: **Store referrer**, **Pasted link** or **Fingerprint**.
- **Flagged only** keeps installs with at least one fraud flag.

Clicking a row opens the install detail, described below.

## Watch

**Watch** is for testing on a phone. While it is on, and the browser tab is in view, the screen fetches the newest installs and the latest taps again every 5 seconds. A pulsing dot reads "Watching · updated 3 s ago". **Stop watching** turns it off.

A **Latest taps** card appears above the list with the 10 newest taps of the account: the link, the OS, browser and device model, the screen size the page reported (`402×874 @3`), the country, and the time. A chip says whether the page's beacon arrived (**page beacon**): it carries the screen size and device settings the fingerprint compares, so a tap without it can only be matched on fewer signals. A tap that brought an install shows **Installed →**, which opens that install; otherwise it reads "no install yet".

New installs appear at the top of the list, tinted until you change a filter or reload. The filters apply to the refreshed list too.

To test a link:

1. Use the [test environment](/dashboard/settings/#test-environment)'s SDK key in debug builds, so test installs stay out of your live numbers.
2. Turn on **Watch**.
3. Tap the link on the phone and check the tap appears, with **page beacon** if the link shows a page.
4. Install and open the app. The install appears within a few seconds; open it to read the verdict.

To run the same test again on the same phone, open the install, choose **Erase this device**, then tap the link again before you reinstall. Erasing removes the device's installs and strips the taps they were credited to of everything personal, so the fingerprint can no longer match an old tap. Erasing is for owners; see [A request from one person](/self-hosting/privacy-and-data/#a-request-from-one-person).

## The install detail

The detail opens from this screen, from the Overview's Recent installs and from a link's installs. It shows:

- **Verdict**: credited link or organic, match source, confidence, reinstall, fraud flags.
- **Why**: the signal that named the click (store referrer, pasted link, Meta referrer, a late claim), or the fingerprint's best and runner-up candidates with each signal marked agree, mismatch or missing, their scores, the gap between them, the window that applied and how many repeat taps were merged. The full list of signals is under [Recent installs](/dashboard/overview/#recent-installs).
- **Show values**: a checkbox above the signals. With it on, each signal also shows what the app and the tap reported, as `app 1206×2622 · tap 402×874 @3 = 1206×2622`. The screen compares the app's physical pixels with the tap's screen times its pixel ratio; the time zone reads `UTC+3`; the network reads `AS36935`; the IP version reads `IPv4` or `IPv6`. A dash means that side reported nothing, which is why the signal reads missing. No IP address is ever shown. A viewer sees no network values.
- **Tap**, **App opens**, **Events** and **Screens**, as on the [Overview](/dashboard/overview/#recent-installs).
- **This device's data**: **Download everything stored (JSON)** and **Erase this device**, and on this screen **Every install from this device →**, which searches the list for the device id. Viewers do not see this part.

:::note[Self-hosting]
The screen is identical on a self-hosted deployment. Watch polls the server; it holds no connection open.
:::
