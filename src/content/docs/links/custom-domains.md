---
title: Custom domains
description: Put your links on a subdomain of your own, like go.yourbrand.com, with the certificate issued before you move the DNS, and what changes for your apps.
sidebar:
  order: 6
---

Your links can live on a subdomain of your own: `https://go.yourbrand.com/sale` instead of `https://yourname.dectog.com/sale`. One custom domain per account. Links on your DecTog subdomain keep working either way, so links already shared never break.

The deployment has to offer it: it needs Cloudflare for SaaS and three settings, described in [Self-hosting: custom domains](/self-hosting/custom-domains/). Until then the Settings card says it is not set up.

## Add the domain

1. In **Settings > Custom domain**, enter the subdomain, for example `go.yourbrand.com`, and select **Add**. A subdomain, not the bare `yourbrand.com`: a CNAME record cannot sit on a domain apex at most DNS hosts.
2. The card lists three DNS records. Add them at your DNS host:

| Type | Name | Value | Why |
|---|---|---|---|
| TXT | `_cf-custom-hostname.go.yourbrand.com` | a token | Proves the domain is yours |
| TXT | `_acme-challenge.go.yourbrand.com` | a token | Lets Cloudflare issue the certificate |
| CNAME | `go.yourbrand.com` | the deployment's target, `domains.dectog.com` on hosted DecTog | Sends the domain to DecTog. Add it last. |

3. Wait. The card checks every minute while it is open, and the server once an hour otherwise; **Check now** asks at once.

The two TXT records let the certificate issue while `go.yourbrand.com` still points wherever it does today. That is what makes moving a live link domain over (from Branch or Firebase Dynamic Links, say) free of downtime: the CNAME changes only once DecTog can already answer on it with HTTPS. If the subdomain is new and nothing uses it yet, you can add the CNAME straight away and skip the TXT records; Cloudflare then validates over HTTP once the CNAME points at it.

## The states

| State | Meaning | What to do |
|---|---|---|
| **Waiting for DNS** | Cloudflare has not seen the TXT records (or the CNAME) yet. Its message is shown under the records. | Add the records; DNS changes can take a while to spread. |
| **Issuing certificate** | Ownership is proven; the certificate is being issued. | Wait a few minutes. |
| **Ready: point the CNAME** | The hostname and its certificate are live. | Add (or change) the CNAME. |
| **Active** | The CNAME points at DecTog: the server saw it in DNS, or a request arrived through it. Every new link URL uses the domain. | Add it to your apps (below). |
| **No longer points here** | It was active, and Cloudflare reports the CNAME moved away. Links are built on your DecTog subdomain again. | Restore the CNAME; otherwise the domain is removed 7 days later. |
| **Failed** | Cloudflare refused the hostname or gave up validating it. | Remove it and add it again, or check the records. |

A DNS host that hides the CNAME behind its own proxy (a proxied record on a domain that is itself on Cloudflare) never shows it to a DNS lookup; such a domain turns active with the first tap that reaches it.

## What changes once it is active

- Every link URL the API, the dashboard, the SDK, webhooks and install verdicts return is `https://go.yourbrand.com/<slug>`. So are the QR page's code, the preview's `og:url` and the link the iOS tap-to-store page copies to the pasteboard, which keeps deterministic iOS attribution working on the new domain.
- The domain serves your links, `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, and its root redirects to your app's Fallback URL when one is set. It never serves another account's link, not even through `/r/<username>/<slug>`.
- Your DecTog subdomain keeps serving every link.

## Add it to your apps

Universal Links and App Links are per host, so the apps need the new host next to the old one. The **Apps** page's "Copy for AI" prompts list both once the domain is active.

- **iOS:** add `applinks:go.yourbrand.com` to the Associated Domains, next to `applinks:yourname.dectog.com`, in every entitlements file.
- **Android:** add `<data android:host="go.yourbrand.com"/>` to the `autoVerify` intent filter that has your DecTog host.
- **SDK:** list the domain in `DectogConfig(linkDomains: ['go.yourbrand.com'])`. The SDK also learns the active domain from the server, but only after its first answer; listing it covers a link that opens the app on its very first start.

Ship a build with these before you share links on the new domain: until then, taps on it open the browser and route through the stores like any other tap.

## Remove it

**Remove** asks first. A domain that was serving is suspended rather than deleted: new links are built on your DecTog subdomain at once, taps on the domain keep working for 7 days, and **Restore** undoes the removal in that time. After 7 days the hostname is deleted. A domain that never went live is deleted at once.
