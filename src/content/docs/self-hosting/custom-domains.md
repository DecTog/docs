---
title: Custom domains
description: Turn on customers' custom link domains on a self-hosted deployment with Cloudflare for SaaS, and how the Worker validates, serves, re-checks and deletes them.
sidebar:
  order: 8
---

Custom link domains (`go.yourbrand.com`, one per account) use [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) custom hostnames on the deployment's zone. The feature is off until the three settings below are present; the Settings card then says it is not set up and the admin routes answer `409 not_configured`. What account holders see is in [Links: custom domains](/links/custom-domains/).

## Turn it on

1. In the Cloudflare dashboard, open the zone (`dectog.com` below) and enable **SSL/TLS > Custom Hostnames** (Cloudflare for SaaS).
2. Add a proxied DNS record for the target customers point at, for example `domains.dectog.com` as `AAAA 100::`, and set it as the **fallback origin** on the same page.
3. Create an API token with the **SSL and Certificates: Edit** permission on the zone.
4. Set the secrets and the variable:

   ```bash
   npx wrangler secret put CF_API_TOKEN --env production
   npx wrangler secret put CF_ZONE_ID --env production
   ```

   and `"CUSTOM_DOMAIN_TARGET": "domains.dectog.com"` under `env.production.vars` in `apps/worker/wrangler.jsonc`.
5. Route the customers' hostnames to the Worker: uncomment the `*/*` route next to `dectog.com/*` and `*.dectog.com/*` in `wrangler.jsonc`. The existing routes already cover every host on the zone, so the new one adds only custom hostnames.
6. Apply migration `0052_custom_domains` and deploy.

Cloudflare includes a number of custom hostnames with each plan and charges per hostname beyond it; see Cloudflare for SaaS pricing.

## How the Worker handles a domain

| Step | What happens |
|---|---|
| Add | `POST /zones/<zone>/custom_hostnames` with `ssl: {method: "txt", type: "dv"}`. The answer's `ownership_verification` and `ssl.validation_records` become the TXT records the card shows, plus the CNAME to `CUSTOM_DOMAIN_TARGET`. A hostname another Cloudflare zone already has is refused (`409 hostname_taken`). |
| Check | `GET` the custom hostname. Its `status` and `ssl.status` map to the six states: `pending_validation`, `issuing_certificate`, `ready` (both active), `active`, `moved`, `failed` (blocked, deleted, or a certificate step timed out). |
| Ready to active | A DNS-over-HTTPS CNAME lookup (`cloudflare-dns.com`) that finds `CUSTOM_DOMAIN_TARGET`; or a request that reaches the Worker on the host while public DNS sends it to Cloudflare (the CNAME, or A/AAAA records all inside Cloudflare's ranges from `/client/v4/ips`, for proxied records), looked up at most once a minute per host. A request alone is not enough: a pre-validated hostname is on Cloudflare's edge before the customer moves DNS, so anyone can reach it. Then `users.custom_domain` is set, and every link URL is built on it. |
| Re-check | An active domain trusts Cloudflare's own status: `moved` means it no longer points at the fallback origin. The domain then stops being canonical, and is deleted after 7 days unless it comes back. |
| Remove | Suspends: `users.custom_domain` is cleared at once, the host is still served, and the hostname is deleted 7 days later. A domain that never served is deleted at once. |

The hourly cron (`sweepCustomDomains`) checks pending domains not checked for ten minutes, re-checks active ones once a day and deletes the ones past their grace, 50 of each per run. The dashboard card checks every minute while it is open on a pending domain.

A request on any host that is not the root domain, one of its subdomains, `APP_HOST`, the `PUBLIC_BASE_URL` or `WEB_URL` host, `localhost`, an IP or `*.workers.dev` is looked up in `custom_domains` (states `ready`, `active` and `moved`, and suspended ones within their grace). The answer is cached per isolate for a minute, misses included, so a tap on the default hosts costs no extra read and a tap on a custom host at most one a minute.
