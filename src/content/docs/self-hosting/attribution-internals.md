---
title: Attribution internals
description: How the Worker decides which click an install belongs to, the fingerprint scoring and confidence rules as implemented, claims, fraud rules, strict mode and the SDK state that feeds it.
sidebar:
  order: 5
---

This page follows `apps/worker/src/api_installs.ts`, `attribution.ts` and `fraud.ts` as they are. For the user-facing summary read [How attribution works](/start/how-attribution-works/); for request and response shapes read [Clicks and installs](/api/clicks-and-installs/).

Three routes share one verdict builder (`buildVerdict`): `POST /api/v1/app-installs` (first launch), `POST /api/v1/app-installs/:id/claim` (a signal that arrived later) and `GET /api/v1/attribution` (read-only re-pull). The first two decide; the third only reads.

## First launch, step by step

### 0. Idempotency

`install_attempt_id` (`^[A-Za-z0-9_-]{8,64}$`) is the SDK's key for one install attempt. If the tenant already has a row with that id, the stored verdict comes back with `replayed: true` and nothing is re-evaluated. Two retries racing for the same id are caught by the unique index `idx_installs_attempt`; the loser receives the winner's verdict.

### 1. The deterministic ladder

The body can carry three signals. They are tried in this order:

| Signal | Body field | Parsed as |
|---|---|---|
| Store referrer | `install_referrer` (with `referrer_store`: `google_play`, `huawei`, `samsung`, `xiaomi`, `vivo`; a referrer without a store counts as `google_play`) | `dtg_click=<id>` and optionally `dtg_l=<username>/<slug>` |
| Copied link | `clipboard_url` | Must be one of this deployment's URLs (`/r/` path form, `<ROOT_DOMAIN>`, a `*.<ROOT_DOMAIN>` host, the `PUBLIC_BASE_URL` host) or a custom-scheme URL. The slug is the last path segment; `dtg_click=<id>` is read from the query. The raw clipboard text is never stored; only `clipboard_slug`. A URL on any other host is ignored. |
| Meta referrer | `meta_referrer` (read on Android when the app has a Facebook App ID) | `dtg_click=<id>` |

For each signal that names a click id:

1. Look the click up within the tenant. If it exists and no install holds it (`matched_click_id`), it wins.
2. If another install already holds it and that install has the same `device_id`, the SDK lost its state: the holder's verdict is returned with `replayed: true` and no new row is written.
3. If another install on a different device holds it, the signal is a replay. The ladder notes it and **moves on to the next signal**.
4. If the click row does not exist, the Worker synthesizes one from `dtg_l=<username>/<slug>` (the clipboard form names its slug directly). The username must be the caller's own and the slug must exist as a permanent or temporary link. The new row keeps the store's click id when it matches `^[A-Za-z0-9_-]{8,64}$`, gets `origin = 'synthesized_referrer'`, `source = 'web'`, `device_type` = the install's OS family (or `android` for a store referrer with unknown OS), `ip_hash` = the install's hash, `clicked_at` = the store's server-side click time (`referrer_click_server_ts`, else `meta_referrer_ts`, else now) and `metadata = {"synthesized_from": "<referrer|clipboard|meta>"}`. A permanent link's `click_count` goes up by one. If the slug is unknown the signal is skipped.

When every signal is exhausted, the ladder's outcome is `reuse` if any signal pointed at a consumed click, else `not_found` if any pointed at an unknown click, else `none`. Only `reuse` leaves a mark: the fraud flag `click_reuse`, and no fingerprint for this install.

A win sets `match_source` to `referrer` (store and Meta) or `clipboard`, `referrer_source` to the store name or `meta` (null for the clipboard) and `match_confidence` to `guaranteed`. A store referrer has no time window: a very old click still matches, and `stale_referrer` flags it when it is older than 30 days.

**Deterministic window (P2.3).** A pasted link and Meta's referrer are bounded by `deterministicWindowHours`: the app's `deterministic_window_hours`, else `ATTRIBUTION_DETERMINISTIC_WINDOW_HOURS` (default 168, 7 days), never more than 30 days. The app is the clicked link's app, else the install's own. The age is measured from Meta's `meta_referrer_ts` when present, else the click row's `clicked_at`; a click synthesized from the tag carries the install time and is never stale. An older win is demoted (`staleSignalFlag`): it earns the flag `stale_clipboard` or `stale_meta`, consumes nothing, and the fingerprint decides as if no signal had matched. When the fingerprint neither credits nor routes, the stale click becomes `routing_click_id` with `match_confidence = 'medium'`, so the app still opens the link's content. With strict fraud mode the stale click does not route either. A claim carrying a stale signal is `rejected` with `claim_reason: "stale_click"`.

### 2. The scored fingerprint

Runs when the ladder found nothing, and also (as a shadow, see below) when it did. It is skipped in exactly five cases (`api_installs.ts`, `canFingerprint`): the install has no IP hash, `install_state` is `update` (an existing user updating into an SDK build must never take a click from the pool), the ladder ended in `click_reuse`, the install's own app has `probabilistic_match = 0` (P2.15; then not even the shadow runs), or the registration carries `recovered_from` (P2.8: the SDK re-registering an install the server lost).

Reinstalls are not one of those cases. An install with `install_state: 'reinstall'`, or one the server classifies as a reinstall because the same tenant already has a non-reinstall install with the same `device_id`, runs the full ladder and the fingerprint like a fresh install and can be credited. It is stored with `is_reinstall = 1`, which only keeps it out of the dashboard's Installs KPI, the per-link install counts and the other `is_reinstall = 0` analytics queries. App updates never fingerprint; reinstalls are matched but counted separately.

**Candidate pool.** One query in `runFingerprint`:

```sql
SELECT c.* FROM clicks c
WHERE c.user_id = ?1 AND c.source = 'web' AND c.device_type IN ('ios','android')
  AND (?2 IS NULL OR c.device_type = ?2)      -- the install's OS family
  AND c.ip_hash = ?3                           -- same salted IP hash
  AND c.clicked_at >= ?4                       -- inside the wide window
  AND NOT EXISTS (SELECT 1 FROM app_installs i WHERE i.matched_click_id = c.id)
  AND (?5 IS NULL OR c.link_kind != 'permanent' OR NOT EXISTS (   -- the install's app
        SELECT 1 FROM links l WHERE l.user_id = c.user_id AND l.slug = c.link_slug
          AND l.app_id IS NOT NULL AND l.app_id != ?5))
ORDER BY c.clicked_at DESC
LIMIT 50
```

`?5` is the install's own app. A click on a link bound to a different app of the account is no candidate, so one account's two apps cannot take each other's installs. Clicks on temporary links and on links bound to no app stay candidates for every app. When the install's app is unknown (a package name that matches none of several apps) the pool is not scoped.

So the pool is the 50 newest web clicks (recorded by the redirect engine or synthesized; an in-app open that flipped a row to `source = 'mobile_app'` is out) from the same hashed IP, on the same device family, inside the wide window, not yet credited to any install. A routing-only assignment does not consume a click.

**Windows.** `fingerprintWindows` computes `wideHours = clamp(ATTRIBUTION_WINDOW_HOURS, 1, 720)` (default 24) and `lowHours = min(app override or ATTRIBUTION_LOW_ENTROPY_WINDOW_HOURS, wideHours)` (default 2). The app override is `low_entropy_window_hours` of the install's own app: the app whose Android package or iOS bundle ID equals `package_name`, or the only app of a one-app account (`appOfInstall` in `appscope.ts`). With no such app the deployment default applies. A candidate keeps the wide window only when the install is not on cellular, the click carries a device model and the install carries one too. Every other candidate must be younger than `lowHours`.

**Scoring.** `scoreCandidate` adds points per signal. A signal missing on either side scores 0; absence is never evidence.

| Signal | Install side | Click side | Agree | Disagree |
|---|---|---|---|---|
| Device model | `device_model` (lower-cased) | `device_model` from `Sec-CH-UA-Model` or the WebView `Build/` token | +40 | Candidate excluded entirely |
| OS major | `os_major` parsed from `os_version` | `os_major` parsed from `os` (platform-version hint on Android) | +15 | −30 |
| Language | `lang` from `language` | `lang` from `Accept-Language` | +10 | −15 |
| Screen short side | `min(screen_width, screen_height)` in physical px | `min(screen_width, screen_height) × pixel_ratio` from the interstitial beacon | +15 when within 3 % | −40 |
| CPU family | `cpu_family` from `cpu_type` | `ua_arch` from `Sec-CH-UA-Arch` | +5 | −40 |
| Network | `asn` | `asn` | +10 | 0 |

**Repeat taps.** Before ranking, candidates with the same signature collapse into the newest of them: same IP hash and device family (the query already requires both), same device model, OS major, language, screen short side and CPU family. As far as the evidence goes such candidates are one phone tapping twice (a double tap, a pull-to-refresh, the same message tapped again), and without collapsing they would tie with each other and nobody would be credited. Only taps that carry a device model or a screen profile collapse: two taps that agree on nothing more than OS major and language are as likely two people on one network, so they keep competing and can still tie. The install stores `candidate_count` as the number of distinct candidates and `collapsed_from` as the number of click rows merged into the one the verdict used (null when nothing merged). The trade-off: two phones of the same model, OS, language and screen behind one address now look like one phone, and the newer tap is credited instead of nobody. The click rows themselves are kept; only the matching treats them as one.

Candidates are sorted by score, highest first; the SQL order (newest first) and a stable sort mean recency only breaks ties.

**Confidence.** `confidenceOf`, verbatim:

```ts
export function confidenceOf(ranked: CandidateScore[]): MatchConfidence | null {
  if (ranked.length === 0) return null;
  const top = ranked[0];
  const second = ranked.length > 1 ? ranked[1].score : null;
  const unique = second == null || top.score - second >= 10;
  if (!unique || top.score < 0) return 'low';
  if (top.score >= 15 || top.modelMatch || (top.screenAgree && top.osMajorMatch)) return 'high';
  return 'medium';
}
```

In words: no candidates gives null; a top candidate that is not unique (gap under 10 to the runner-up) or has a negative score is `low`; a unique top with a score of 15 or more, a model match, or screen agreement plus OS-major agreement is `high`; a unique top scoring 0 to 14 is `medium`.

| Ranked scores | Result | Why |
|---|---|---|
| none | null | No candidate inside the window |
| one candidate, 0 | medium | Nothing agreed and nothing contradicted |
| one candidate, OS +15 and language −15 = 0 | medium | Contradicted, but not below zero |
| one candidate, language +10 | medium | Agreement too weak to corroborate |
| one candidate, OS +15 | high | An OS-major agreement alone clears 15 |
| one candidate, model +40 | high | Model match |
| 55 and 40 | high | Unique (gap 15) |
| 15 and 10 | low | Tie at the top (gap 5) |
| one candidate, −30 | low | Contradiction outweighed the agreements |

**Outcome.** `candidate_count` is stored whenever the fingerprint ran; `match_score` and `match_confidence` from the fingerprint are stored only when it was the deciding step.

| Confidence | Install | Click |
|---|---|---|
| `high` | `matched = 1`, `match_source = 'fingerprint'`, `matched_click_id` set | Consumed |
| `medium` | `matched = 0`, `routing_click_id` = the click; the verdict's `routing` object names its link, deep link and click params with `confidence: "medium"` | Not consumed; still a candidate for the next install |
| `low` | `matched = 0`, `match_confidence = 'low'` | Untouched |
| null | `matched = 0`, `match_confidence` null | |

Credited or not, a matched click's link must still exist; if the link was deleted the install becomes organic with `match_source` null.

### 3. Shadow match

When a deterministic signal decided, the fingerprint still runs and writes what it would have picked: `fp_shadow_click_id` and `fp_shadow_agree` (`1` only when the fingerprint reached `high` on the same click, else `0`). The dashboard's "fingerprint accuracy" figure is the share of `fp_shadow_agree = 1` over these labelled rows. See [Overview](/dashboard/overview/).

### 4. Fraud rules and strict mode

`evaluateFraudFlags` runs after the match and before the insert. Flags are stored as a JSON array in `fraud_flags` (null when clean), returned on the verdict and sent to the webhook. Flags are only ever merged; a later claim never removes one.

| Flag | Fires when |
|---|---|
| `emulator` | `is_physical_device` is `false`; or `device_model` matches `sdk`, `emulator`, `simulator`, `genymotion`, `virtual`, `gphone`, `pdv` or `avd` as a word; or an Android install with `device_kind` null or `phone` reports an x86 CPU |
| `impossible_speed` | The winning signal's click time is less than 10 seconds before the install request. The click time is `referrer_click_server_ts` (Google's clock), else `meta_referrer_ts`, else the click row's `clicked_at`; device-clock fields are never used. |
| `install_velocity_ip` | At least 5 installs (25 when the install reports `cellular`) from the same hashed IP in the last 24 hours. The count runs before the row is inserted, so on first launch it fires on the 6th (or 26th) install; on a claim the row already exists, so on the 5th (or 25th). Skipped when the install has no IP hash. |
| `click_storm_ip` | The matched click's hashed IP produced more than 100 clicks in the hour up to that click |
| `stale_referrer` | `match_source` is `referrer` or `clipboard` and the click is older than 30 days |
| `stale_clipboard` | A pasted link's click is older than the deterministic window (7 days by default, per app). The install is routed to the link but not credited. |
| `stale_meta` | The same for Meta's install referrer, timed by Meta's own click timestamp |
| `click_reuse` | A deterministic signal named a click that another device's install already holds |

With `strict_fraud_mode = 1` on the app the verdict concerns (the app of the credited or routed link; else the install's own app, the one whose Android package or iOS bundle ID equals the `package_name` the SDK sends (on an account with one app, that app); else the oldest app), any flag makes the stored row `matched = 0` and `match_source = NULL` while `matched_click_id`, `matched_slug`, `referrer_source` and `match_confidence` are kept as evidence. Consequences:

- The click stays consumed, so a replayed signal cannot free it for the next install.
- The API verdict says `matched: false`, `type: "organic"`, `match_source: null`, but still `referrer_source` and `match_confidence` (for example `guaranteed`); `username`, `slug` and `link` are absent and `routing` is null.
- The webhook payload carries `matched: false` with `slug`, `link`, `clicked_at`, `click_params` and `deep_link` all `null`, so a consumer cannot credit it by accident.
- A later claim finds `matched_click_id` set with `match_source` not `fingerprint` and answers `claim: "unchanged"`, `claim_reason: "already_deterministic"`: a strict-zeroed verdict is final.
- Overview counts the install as organic.

With strict mode off (the default) flags are annotations and the attribution stands.

### Same-device reinstall routing

When the ladder and the fingerprint found nothing to credit or route, a reinstall (`is_reinstall = 1`) with a `device_id` gets the click its device's latest credited install consumed as `routing_click_id` with `match_confidence = 'medium'`, provided that tap is younger than the deterministic window of its link's app (`deterministic_window_hours`, default 168). The click stays credited to the first install; `match_details.reinstall_routing` names it. This is decision C6's default.

### 5. After the insert

The row and, when `ad_id` was sent, an `ad_identifiers` row are written in one batch. Then, in `waitUntil`: the Apple Search Ads round-trip when `asa_token` was sent (three attempts five seconds apart, stopping at the first `5xx` or network error; `invalid` on 400; `pending` otherwise, for the cron), and the install webhook (`app.installed`) of the app the verdict concerns. The response is the verdict. `apple_search_ads` is always present (null when no token was ever sent); `link` is present only for a permanent link, a temporary-link match has `username` and `slug` with `custom_params` null.

## The stored explanation

Every install row keeps `match_details`, a JSON object the dashboard's install detail shows (`GET /api/admin/installs/:id`):

| Field | Meaning |
|---|---|
| `method` | `referrer`, `clipboard`, `meta`, `fingerprint`, or null for an uncredited install |
| `signal`, `referrer_source`, `click_id`, `synthesized` | The deterministic signal that named a click, when one did |
| `stale` | `stale_clipboard` or `stale_meta` when that signal was older than the window |
| `fingerprint_skipped` | `no_ip`, `update`, `click_reuse`, `probabilistic_off` or `recovery` when the fingerprint did not run |
| `candidates`, `collapsed_from`, `window_hours`, `gap`, `confidence` | The fingerprint's pool after collapsing, the merged taps, the window of the best candidate, its lead over the runner-up |
| `best`, `runner_up` | `{click_id, slug, clicked_at, score, signals, low_entropy}`; `signals` marks `device_model`, `os_major`, `lang`, `screen`, `cpu` and `asn` as `agree`, `mismatch` or `missing` |
| `shadow` | The same fingerprint fields when a deterministic signal decided |
| `claim_source`, `before_claim` | After a late claim upgraded the verdict: the claim's source and the explanation it replaced |

## Worked examples

Each row is a golden scenario the worker's test suite runs end to end on every change (`apps/worker/test/fixtures/attribution-cases.json` in the server repository): taps go through the redirect engine, installs and claims through the signed API. "Same network" means the install came from the tap's IP address. A row marked as a known defect documents today's behaviour; the plan item named there changes it.

| Scenario | What happens | Verdict |
|---|---|---|
| Android store referrer names the click | tap on android (Pixel 9); install i1 (store referrer; other network) | i1: `matched: true`, `match_source: referrer`, `match_confidence: guaranteed` |
| A self-describing referrer stands in for a click row that never landed | no recorded tap; install i1 (store referrer) | i1: `matched: true`, `match_source: referrer`, `match_confidence: guaranteed` |
| iOS pasteboard link with the click id | tap on ios, no model hint; install i1 (pasteboard link; other network) | i1: `matched: true`, `match_source: clipboard`, `match_confidence: guaranteed` |
| Fingerprint with a device-model match is credited | tap on android (Pixel 9); install i1 (no signal; same network) | i1: `matched: true`, `match_source: fingerprint`, `match_confidence: high` |
| Fingerprint without corroboration routes but does not credit | tap on android, no model hint; install i1 (no signal; same network) | i1: `matched: false`, `match_source: null`, `match_confidence: medium`, routing routes to promo |
| No click at all is organic | install i1 (no signal; other network) | i1: `matched: false`, `match_source: null`, routing none |
| One install per click: a second device replaying the referrer gets nothing | tap on android (Pixel 9); install i1 (store referrer; other network); install i2 (store referrer; other network) | i1: `matched: true`, `match_source: referrer`<br>i2: `matched: false` |
| A retried registration replays the stored verdict | tap on android (Pixel 9); install i1 (store referrer, attempt id; other network); install i2 (store referrer, attempt id; other network) | i1: `matched: true`<br>i2: `matched: true`, `replayed: true` |
| A referrer delivered on a later launch upgrades an organic install | tap on android (Pixel 9); install i1 (no signal; other network); later claim on i1 (late_referrer) | i1: `matched: false`<br>claim i1: `claim: upgraded`, `matched: true`, `match_source: referrer` |
| An app update never runs the fingerprint | tap on android (Pixel 9); install i1 (app update; same network) | i1: `matched: false`, routing none |
| Two taps from one phone collapse into one candidate; the newest is credited | tap on android (Pixel 9); tap on android (Pixel 9); install i1 (no signal; same network) | i1: `matched: true`, `match_source: fingerprint`, `match_confidence: high`, credited to the second tap; `collapsed_from: 2` |
| Taps from two different phones on one network still tie | tap on android (Pixel 9); tap on android (Pixel 8); install i1 (no signal, no model; same network) | i1: `matched: false`, `match_confidence: low` |

## Claims

`POST /api/v1/app-installs/:id/claim` carries any subset of the signal fields above plus `attempt`, `asa_token` and `claim_source` (`late_referrer`, `paste_control` or `clipboard`; validated with a 400, and stored as `claim_source` on the row when the claim upgrades it, so a paste control can be told apart from an automatic pasteboard read). The install must belong to the caller (404 otherwise). Every call refreshes the stored telemetry (a later, more informative referrer read overwrites; absent fields keep their value), bumps `attempt` to the maximum seen, and sets `clipboard_slug` if it was empty.

Then, in order:

1. Already deterministic (`matched_click_id` set and `match_source` not `fingerprint`, which includes strict-zeroed rows): `claim: "unchanged"`, `claim_reason: "already_deterministic"`.
2. The ladder runs again with the row's own id excluded as a holder. The fingerprint **never** runs on a claim.
3. `replay` (another row of the same device holds the click): the holder's verdict with `replayed: true`, `claim: "unchanged"`; the SDK adopts that install id.
4. `reuse`: `click_reuse` is merged into the flags, `claim: "rejected"`, `claim_reason: "click_reuse"`.
5. `not_found` / `none`: `claim: "rejected"` with `click_not_found` / `no_signal`.
6. A pasted link or Meta referrer older than the deterministic window: its flag (`stale_clipboard` / `stale_meta`) is merged, `claim: "rejected"`, `claim_reason: "stale_click"`.
7. Otherwise the deterministic click wins over whatever the fingerprint had guessed (the old click is released by no longer being referenced) and over organic: `matched = 1`, `match_source`, `referrer_source`, `match_confidence = 'guaranteed'`, `routing_click_id = NULL`, `claimed_at = now`. Fraud rules are re-evaluated and merged, strict mode applies as above, and the webhook fires with `app.install_updated`. Response: `claim: "upgraded"`.

An `asa_token` on a claim restarts the Apple round-trip unless the row is already `resolved` or `no_attribution`; `invalid` and `expired` rows accept a new token.

## Apple Search Ads

Independent of the click ladder: the SDK sends the AdServices token, the Worker exchanges it with Apple and stores the result on the install (`asa_status`, `asa_attribution`). An attributed resolution re-fires the webhook. Statuses, retries and the 24-hour expiry are on [Scheduled jobs and retention](/self-hosting/scheduled-jobs-and-retention/); the SDK side is on [Deterministic attribution](/sdk/deterministic-attribution/).

## What the SDK keeps on the device

The Worker's idempotency and claim logic depends on SDK state the server never sees directly.

- **Sentinel v2**: `.dectog_install.json` (`lib/src/services/install_state_store.dart`) in a backup-excluded directory (Android `noBackupFilesDir`, iOS `NSURLIsExcludedFromBackupKey`). Fields: `v` (2), `status` (`pending`, `tracked`, `failed`, `abandoned`), `install_attempt_id`, `attempt`, `created_at`, `attempted_at`, `tracked_at`, `last_attempt_at`, `last_error`, `install_id`, `package_first_install_ts`, `referrer_claimed`, `referrer_status`, `referrer_launches`, `plugin_version`. A sentinel whose `package_first_install_ts` differs from the package's current first-install time is a restored backup and is treated as absent. "Claimed" is written only after the server answered 200.
- **Method channel** `dectog_device_identifiers`: the native readers behind the signals. Android: the Play Install Referrer reader (three attempts, server-side timestamps), the Huawei, Samsung, Xiaomi and vivo readers, the no-backup directory, package install info, launch info (referrer, launched-from-history) and the pasteboard helpers. iOS: install dates (file system and Keychain), backup exclusion, the AdServices token, the pasteboard helpers and the `UIPasteControl` platform view. Every method returns null or false on failure, and an unknown method degrades gracefully on the Dart side.

See [Install attribution](/sdk/install-attribution/) for how the app consumes the verdict and [Device data and privacy](/sdk/device-data-and-privacy/) for what the device tier sends.
