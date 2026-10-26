---
title: Fraud rules
description: Every fraud rule DecTog checks installs and referrals against, how strong each one is, and what an app gets when it blocks a rule instead of only flagging it.
sidebar:
  order: 4
---

Every install is checked against a fixed set of explainable rules. A hit is a **flag**: it rides on the install verdict as `fraud_flags`, on the `app.installed` and `app.install_updated` webhooks, in exports and in the dashboard, and attribution stands. Each app can also choose rules that **act**: withhold an install's credit, stop routing a stale link, or reject a referral. Nothing acts until you tick it.

Each rule is a plain comparison with a name, so every flag can be explained. The install detail on the [Installs](/dashboard/installs/) page lists every rule with what it compared: flagged, clear, or not checked and why.

## Install rules

| Rule | Label | Strength | Fires when |
|---|---|---|---|
| `emulator` | Emulator | strong | The SDK reports a simulator or emulator, the device model names one (`sdk`, `emulator`, `simulator`, `genymotion`, `virtual`, `gphone`, `pdv`, `avd`), or an Android phone reports an x86 CPU. |
| `impossible_speed` | Too fast | strong | The matched tap came less than 10 seconds before the first launch. No store download fits in that time. |
| `click_injection` | Tap after download | strong | Android: the matched tap came more than 5 seconds after Google Play began the download, so it cannot have caused the install. |
| `installer_mismatch` | Not installed by Play | strong | Android: a Google Play install referrer names a tap, but the app was installed by something other than Google Play. Never flagged when the installer is unknown, or for Play Instant. |
| `signing_cert_mismatch` | Unknown signing key | strong | Android: the app on the device is signed with a certificate that is none of the app's **SHA-256 fingerprints** on the Apps page: a modified or re-signed build. |
| `install_velocity_ip` | Many installs, one network | moderate | At least 5 other installs (25 on cellular data) came from the same network in the 24 hours before this one. |
| `click_storm_ip` | Tap flood | moderate | The matched tap's network sent more than 100 taps in the hour before it. |
| `stale_referrer` | Old store referrer | weak | The store referrer names a tap more than 30 days older than the first launch. |
| `stale_clipboard` | Old pasted link | weak | A pasted link names a tap older than the app's [pasted-link and Meta window](/dashboard/apps/) (7 days by default). It routes the user but earns no credit. |
| `stale_meta` | Old Meta referrer | weak | The same for Meta's install referrer. |
| `click_reuse` | Reused tap | strong | A store referrer or pasted link names a tap another device's install already holds: a replayed signal. It never earns credit. |

**Strong** rules have no honest explanation. **Moderate** ones trip on busy shared networks: an office, a university, a hotel. **Weak** ones mostly mean an old link.

### How the timing rules tell time

The timing rules (`impossible_speed`, `click_injection`, `stale_referrer`) only trust server clocks:

- The tap time is Google's server-side click time for a store referrer, Meta's timestamp for a Meta referrer, and DecTog's own click record otherwise. A referrer that did not decide the match, such as an organic Play referrer on a fingerprint match, never times it.
- The install time is the first launch as DecTog received it, or Google's server-side install-begin time.

The device clock is stored for review and never used. A claim that arrives on a later launch judges the install as of its first launch.

### Signing certificate notes

`signing_cert_mismatch` compares the certificate the SDK reads on the device with the **SHA-256 fingerprints** of the install's own app (the app whose Android package equals the one the SDK reports). It is skipped when the app lists no fingerprints, for any other package (debug and flavour builds with a suffix), and in a [test environment](/dashboard/settings/#test-environment).

- **Play App Signing:** a store build is signed with Google's app signing key. List that key's fingerprint, from Play Console, Setup, App signing. Your upload key alone flags every store install.
- **Internal app sharing** and **debug builds** with the app's own package are signed with your upload or debug key. List it too while you test, or expect the flag.
- **Key rotation:** the SDKs read the oldest certificate in the rotation history. Keep the original key's fingerprint in the list.

## Referral rules

A [referral](/guides/referral-programs/) carries the install's flags plus two of its own:

| Rule | Label | Strength | Fires when |
|---|---|---|---|
| `referral_same_device` | Referrer's own device | strong | The referred customer signed up on a device the referrer used: the referrer identified on it, had a session on it, or installed the app on it first. This is someone signing in on a fresh install through their own link, then making a second account. |
| `referral_same_network` | Referrer's network | weak | The referred install came from a network one of the referrer's other devices used (an install or a link open) in the 30 days before. Never on cellular data, where strangers share addresses. A household also trips it. |

The referral is recorded either way, and `referral.converted` carries its `fraud_flags` so your reward code can decide.

## Blocking rules

On the [Apps](/dashboard/apps/) page, **Fraud rules** lists every rule with a checkbox. The setting is read from the app the verdict concerns: the credited or routed link's app, else the install's own app, else your oldest app. A blocked rule acts as follows:

| Rule | Checkbox | What happens when it hits |
|---|---|---|
| Install rules (`emulator` to `stale_referrer`) | Withhold credit | A credited install counts as organic: `matched: false` and `match_source: null` in the app's verdict and the webhook, no `slug`, `link` or `deep_link`, and no routing. The tap stays used, so no other install can take it, and the install record keeps the match as evidence. |
| `stale_clipboard`, `stale_meta` | Don't route | The stale link no longer routes the user. |
| `referral_same_device`, `referral_same_network` | Reject referral | The referral is stored as rejected, sends no `referral.converted`, and is not counted on the Overview. |
| `click_reuse` | none | Its signal never earns credit, so there is nothing to block. |

The rules that acted on an install are in `blocked_by` on the webhook, the Installs list and exports.

A fingerprint match whose credit was withheld can still be upgraded by a store referrer that arrives on a later launch: the claim judges the install again against the new tap, and if no blocked rule hits, the install is credited. An install a store referrer or pasted link decided stays as it is.

## Where you see flags

- **Installs:** each flag as a chip with the rule's label (amber when it only flags, red when a blocked rule acted), a filter by rule, and **Blocked by a fraud rule** under the verdicts. The install detail lists every rule with what it compared.
- **Overview:** the Installs card counts flagged first installs, the campaign and source charts show them per bar, and the Attribution quality card lists them by rule; each rule opens the Installs list on it.
- **Links:** each link counts its flagged installs, including those whose credit was withheld; a referral link counts its flagged and rejected referrals.
- **Customers:** the install's flags, and each referral's status and flags.

## What the rules cannot catch

The SDK key that signs requests ships inside your app, so anyone who extracts it can send requests that look like the SDK's, with any values they like. These rules catch abuse through the real SDK: emulators, modified or re-signed builds, sideloaded copies, device farms on one network, taps fired after a download began. They do not prove that a request came from a genuine device. Device attestation (Play Integrity, App Attest) is not part of DecTog yet.
