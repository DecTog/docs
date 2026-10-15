---
title: Design decisions
description: Why DecTog works the way it does, the designs it rejected and why, and the questions still under review.
sidebar:
  order: 5
---

Why DecTog works the way it does, including the designs it chose not to adopt. Each entry states the decision, the reason and what was rejected. The source of this page is `docs/DECISIONS.md` in the server repository; the limits these decisions produce are listed in [What DecTog does not do](/start/what-dectog-does-not-do/).

## Kept as they are

**1. Reinstalls go through matching.** A reinstall runs the attribution ladder
like a first install and is credited when a signal matches; it carries
`is_reinstall: true` and is excluded from the Installs KPI and per-link counts.
Only `install_state: 'update'` and a reused click skip the fingerprint.
*Rejected:* skipping matching for reinstalls, which would lose re-acquisition
campaigns. *Revisit* if re-attribution windows become a feature. (2026-10-13)

**2. v1 DELETE answers 404 for an unknown slug; the admin DELETE answers 200.**
Different clients: an SDK or script wants to know the slug was wrong; the
dashboard deletes what it lists. (2026-10-13)

**3. Fingerprint candidates are every mobile web click,** not only clicks that
were sent to a store. *Rejected for now:* a `destination` column on clicks
(store, custom, bounce, tail) and a filter on it; the effect is mild and the
migration touches three docs pages. (2026-10-13)

## Settled in Phase 0 (2026-10-14)

**4. No backward compatibility before the first public release.** Nobody
integrates DecTog yet, so response shapes, SDK methods and the schema change
freely. *Rejected:* shims, v2 routes and deprecation periods before there is a
user to protect. Ends at the first public release.

**5. One error envelope.** Every route answers
`{"error": {"code", "message", "request_id"}}`; `code` is stable, `message` may
change, and `request_id` (also `x-request-id`) finds the log line. The id is a
well-formed inbound `x-request-id`, else Cloudflare's `cf-ray`, else a UUID.
*Rejected:* keeping a bare `{"error": "<message>"}` string, which clients had to
parse by text.

**6. HEAD is a bot; QA taps are not clicks.** A HEAD to a link answers the
social preview page and records nothing; `x-dectog-no-track: 1` or `?dtg_nt=1`
routes like a real tap without a row. *Rejected:* counting link checkers and
uptime monitors as visitors.

**7. Webhook secrets are write-only.** The apps list returns a hint (the last
four characters); a generate/rotate route returns a new `whsec_` secret once.
*Rejected:* returning the secret on every GET and showing it in the form.

**8. Sign-in is limited per IP, never per account.** 10 attempts a minute per
hashed IP; reset requests 5 per IP and 3 per address. *Rejected:* a per-account
lockout, which lets anyone lock a user out by failing on purpose.

**9. `setEnabled` replaces `optOut`.** One persisted switch, and
`DectogConfig(enabled: false)` to start off until consent. While off the SDK
makes no request of its own and reads no pasteboard; it holds events on the
device and the launch link's report in memory, and turning it on sends them and
registers an install that a disabled launch skipped. A revoke drops the held
link reports, not the held events.
*Rejected:* keeping `optOut`, which never stopped clicks or the install, next to
a second consent API.

**10. Scheme links name their link in `dtg_l`.** Every custom-scheme URI the
server builds ends with `dtg_l=<username>/<slug>`, and the SDK reads the link
from it. *Rejected:* reading username and slug from the URI's shape, which turned
an app route like `myapp://products/42` into user `products`, slug `42`.

**11. The webhook hides link fields unless the install is credited,** exactly
like the SDK verdict. *Rejected:* sending `slug` next to `matched: false` on a
strict-mode install, which invited consumers to credit it.

**12. Raw IP addresses are opt-in.** Matching, fraud rules and rate limits use
only the salted hash; `STORE_RAW_IP=1` also keeps the raw address for the
Customers page. *Rejected:* storing raw IPs by default for a debugging view.

**13. `healthz` and `readyz` are reserved slugs,** because the Worker answers
those paths on every host.

**14. No percentage from a zero baseline.** An Overview card whose previous
window was 0 shows no delta. *Rejected:* reporting +100%.

## Settled in Phase 1

**15. Two kinds of key; the account key stays on `users` (2026-10-14).** Apps
ship SDK keys (`dtg_pub_…`, table `api_keys`) that cannot change links unless
created with `links:write`; servers use the account key (`dtg_…`), which keeps
every scope. *Rejected:* moving the account key into `api_keys`, which needs a
rebuild of the `users` table (its hash column is `UNIQUE`) on a production
database for no user-visible gain; and one key for everything, which put a
link-deleting credential in every app binary.

**16. One contract table generates the spec and the route index.** Every
`/api` route is declared once in `src/contracts.ts`; `/openapi.json` and the
route list in the server repository's `docs/API_CONTRACT.md` are generated from it, and a test fails
when a route and the table disagree. *Rejected:* zod schemas (a new runtime
dependency for the Worker) and a hand-written spec (it drifts).

## Settled in Phase 2

**17. Repeat taps from one phone are one fingerprint candidate (P2.1).** Clicks
from one network whose model or screen profile, OS major, language and CPU
family all agree collapse into the newest before ranking, so a double tap no
longer ties with itself. The cost: a household with identical phones on one
network credits the newer tap instead of nobody. Clicks with neither a model
nor a screen profile never collapse; agreeing on OS and language alone is not
evidence of one device. *Rejected:* keeping the tie (the common double tap
earned no credit and no routing), and reusing one click id per device at
redirect time (a database read on every redirect for a gain the match-time
collapse already gives).

**18. A same-device reinstall is routed, not credited (P2.10, C6 default).** When
nothing else matches, a reinstall on a device whose earlier install consumed a click
gets that click back as routing inside the deterministic window (7 days by default).
The credit stays with the first install, so one tap is never counted twice.
*Rejected:* crediting the reinstall (double counting) and leaving it organic (the
user who reinstalls right after a tap lands nowhere). Still owed: a device run that
confirms the iOS device id survives the reinstall.

## Settled in Phase 3

**19. Webhook retries run on D1 and the hourly cron (P3.1, C7 default).** A
failed delivery waits in `webhook_deliveries` for the hourly job, which sends at
most 300 retries a run, so the 5- and 30-minute retries land at the next run.
*Rejected:* Cloudflare Queues, which retries within the minute but is a second
service to provision on every deployment. *Revisit* if a receiver's backlog
outgrows 300 an hour.

**20. Retention counts calendar days in UTC, and day N means exactly day N
(P3.2, C8 default),** as Adjust and AppsFlyer report it; the weekly table counts
any activity inside each week. *Rejected:* 24-hour buckets counted from the
install time (an install at 23:00 and an open the next evening share a bucket)
and each device's local day, which needs the device's time zone joined into
every activity row.

**21. A deleted link keeps its history under its slug (P3.3, P3.6, C9 default).**
Rollups are rebuilt from the raw rows for closed days, never incremented, and a
deleted link's numbers stay filed under its slug; creating that slug again
answers 409 with `"deleted": true` until the link is restored or deleted
permanently. *Rejected:* decrementing the rollups on delete (past totals would
change) and incrementing them on every write (a written row per tap, and drift
whenever a claim, refund or exchange rate changes a row later).

**22. The web pixel keeps a first-party cookie and asks for consent where the
law does (P3.13, C10 default).** `dectog.js` stores its click id in a 30-day
first-party cookie, waits for `dectog.consent(true)` in the EU and EEA, the UK
and Switzerland, treats Global Privacy Control as a no, and uses its own key
kind (`dtg_site_`), one per account. *Rejected:* `sessionStorage`, which loses
the click when the visitor comes back in a new tab, and consent in the EU only.

**23. An in-app `handleUrl` open counts as an open, not a click (P3.15, C19
default).** The link was already tapped inside the app, so no click row is
written and the Clicks KPI keeps meaning taps on the web.

## Settled in Phase 4

**24. The audit log is append-only and numbered, without a hash chain (P4.2,
C11 default).** Entries are numbered per account, so a deleted entry shows as a
gap in **Check for gaps**, and kept as long as the account. *Rejected:* a hash
chain with a verify route: whoever can rewrite the database can recompute the
chain too, so without an outside anchor it adds a column, not a guarantee.

**25. A test environment is a sibling account (P4.4, C12 default).** Account
`acme` gets `t-acme`, with copies of its apps and templates and its own keys,
links, installs, events, webhooks and audit log. *Rejected:* an `is_test` flag
on every row, which needed a filter in every query and could leak test data into
live totals.

## Settled in Phase 5 (2026-10-15)

**26. Only `dec_*` parameters survive a deferred install (P5.6, C14 default).**
A browser tap stores its `dec_*` and `utm_*` values and nothing else, so those
are all the install verdict can return (`click_params`). On a warm open the app
reads the opened URL itself (`click.queryParameters`, from `originalUrl`); a
route that must also survive the trip through the store goes in `dec_deeplink`
(`products/42`), which works on both paths. *Rejected:* keeping the tapped
URL's other parameters on the click to return them after the install: the click
would store whatever a visitor's URL holds, personal data included, and an app
would build on parameters that only some paths deliver.

**27. No ad-network click route (P5.7, C15 default).** Ad networks cannot send
DecTog their clicks server to server, and the advertising id is stored but never
matched on; an ad's install is attributed when its tap went through a DecTog
link. *Rejected for now:* an `s2s/click` route with per-network tokens and an
advertising-id rung in the ladder, the plan's P5.7. It suits networks that do
not attribute themselves (AppLovin, Unity, ironSource and similar) and needs
the advertising id consented on the device; *revisit* when a user asks for one
of them.

## Rejected designs

From the competitor teardown in the server repository (`docs/improvement-plan-2026-10.md`, section 6). Each appears in at least one competitor.

| # | Rejected | Why |
|---|---|---|
| R1 | Raw IPs or user agents as matching keys, browser fingerprinting hashes, hardware identifiers | Apple's rules prohibit fingerprinting and the EU audience cannot ship it; salted hashes and a scored, deterministic-first ladder instead |
| R2 | Persistent cookies or third-party tags on link pages | Redirects are cookie-free and stay so |
| R3 | The client choosing windows, install state or verdicts | Windows, state and verdicts are decided server-side |
| R4 | "Bring your own auth" and unauthenticated install or event routes | Every write is authenticated and signed; a future ad-network route gets its own token and rate bucket |
| R5 | An `ee/` paywall or plan gating in the engine | The whole product is AGPL; limits are deployment config, never data model |
| R6 | A multi-service analytics stack (queues, ClickHouse, Tinybird) | Rollup tables in D1 give the read speed with one service |
| R7 | Reporting an install on every launch, or "organic" on a network failure | A sentinel, an `install_attempt_id` and retry on the next launch |
| R8 | Targeting rules that 404 on non-match | Geo, language, schedule and A/B rules route a visitor; they never gate a link |
| R9 | Opening `myapp://` automatically on page load | iOS shows "Cannot open page" to everyone without the app; schemes open from a tap only |
| R10 | Push messaging, affiliate programs, domain sales, LLM link scanning | Outside the product's scope; each adds credentials and moving parts |
| R11 | Row-per-impression storage and recomputed attribution views | D1's size cap and read billing; verdicts are computed at write time |
| R12 | Documenting ahead of code | Docs state what the code does; gaps are tracked in `docs/FOLLOW-UPS.md` |
| R13 | A CLA on the AGPL server | Inbound = outbound is the simpler story (open decision C20) |
| R14 | Silent dedupe of events | Batch answers will say what was accepted, duplicated and rejected (P2.4) |
| R15 | Fingerprint first, deterministic signal as the fallback | A deterministic signal never waits behind a guess |
| R16 | Holding the app's own events until attribution resolves | Events are independent of the verdict; the server stamps `matched_slug` |
| R17 | Requiring apps to turn off Flutter's own deep linking | The `app_links` stream coexists with `go_router` and Navigator 2.0 |
| R18 | Refusing to run without a URL scheme, or a privacy default baked into build metadata | Warn, never refuse; `initialize()` and `setEnabled` are the control points |
| R19 | Wrapping an opaque published native SDK | Shared native code stays source-level and testable in one layer |

## Under review

**IDFV kept across reinstalls.** With `persistDeviceId: true` (the default) the
iOS SDK stores the vendor-scoped IDFV in the Keychain, so the device id survives
a reinstall. It is vendor-scoped and never leaves the account, but rejected design
R1 lists reinstall-surviving Keychain ids among the patterns to avoid. Decide
whether the default stays on, and say so in the privacy docs either way.
