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

**9. `setEnabled` replaces `optOut`.** One persisted switch; while off the SDK
records nothing (clicks, opens, the install, claims, pasteboard, pings, events),
and turning it on registers an install that a disabled launch skipped.
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
