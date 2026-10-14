---
title: Security
description: How to report a vulnerability, and what is true today of DecTog's dependencies, builds and releases.
sidebar:
  order: 6
---

## Reporting a vulnerability

Report privately, never in a public issue: through GitHub's private vulnerability reporting on the repository (the **Security** tab, **Report a vulnerability**), or by email to hello@dectog.com with `SECURITY` in the subject. A report is acknowledged within 48 hours, assessed within 5 working days, and a confirmed high or critical issue is fixed or mitigated within 30 days. Each repository's `SECURITY.md` lists what is in scope.

## Dependencies and builds

What holds today, in the server (`dectog`), the Flutter SDK (`flutter_dectog`) and this site:

| | Server | SDK | Docs |
|---|---|---|---|
| Lockfiles committed, installed exactly in CI | yes (`npm ci`) | the example app's (`pubspec.lock`); a package leaves resolution to the app | yes (`npm ci`) |
| Weekly dependency updates (Dependabot), CI on each | npm, GitHub Actions | pub (package, companion package, example), Gradle, GitHub Actions | npm, GitHub Actions |
| Advisories checked in CI | `npm audit`: high or critical fails the Worker; critical fails the dashboard | `flutter pub outdated` printed on every run | `npm audit`: critical fails |
| GitHub Actions pinned to commit SHAs | yes | yes | yes |
| How a release ships | deployed by hand from a reviewed commit; no workflow holds Cloudflare credentials | published by CI from a version tag that must match the package version, with pub.dev's OIDC publishing (no long-lived token) | built by CI; deployed by hand until the deploy token is set |

The dashboard and this site are static builds: their npm packages run only while they are built, on their own sources, so a high advisory there is a build-time risk, not a running one. The dashboard's Next.js 15 bundles a PostCSS release with such advisories (GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q and two follow-ups), which need attacker-controlled CSS at build time; the Next.js 16 upgrade removes them.

DecTog has not made a tagged release yet. Release notes, the supported-versions table and the first pub.dev publish come with it.
