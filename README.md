<p align="center">
  <a href="https://dectog.com"><img src=".github/dectog-readme.png" alt="DecTog: Documentation" width="800"></a>
</p>

<div align="center">

# DecTog documentation

*The source of [docs.dectog.com](https://docs.dectog.com)*

[![Site code: MIT](https://img.shields.io/badge/Site%20code-MIT-blue?style=flat-square)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/Content-CC%20BY%204.0-lightgrey?style=flat-square)](LICENSE-CONTENT)
[![Astro Starlight](https://img.shields.io/badge/Astro-Starlight-BC52EE?style=flat-square&logo=astro&logoColor=white)](https://starlight.astro.build)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

[Working on the docs](#working-on-the-docs) • [Adding a page](#adding-a-page) • [Look and layout](#look-and-layout) • [Conventions](#conventions) • [Deployment](#deployment)

</div>

This repository holds the canonical documentation for [DecTog](https://dectog.com), the
self-hosted deep linking and install attribution service: quickstart, link routing, the Flutter
and React Native SDKs, the dashboard, the REST API and self-hosting. It is built with
[Astro Starlight](https://starlight.astro.build) and served from a Cloudflare Worker as static
assets.

Every page describes what the code does today. Where the product's own wording and the code
disagree, the docs follow the code and say so.

| Repository | Contents |
|---|---|
| [`DecTog/dectog`](https://github.com/DecTog/dectog) | The server: Cloudflare Worker, D1 database, Next.js dashboard and marketing site |
| [`DecTog/flutter_dectog`](https://github.com/DecTog/flutter_dectog) | The Flutter SDK |
| [`DecTog/react-native-dectog`](https://github.com/DecTog/react-native-dectog) | The React Native and Expo SDK |
| `DecTog/docs` | This site |

## Working on the docs

Node 22.12 or newer (`.nvmrc` says 24).

```bash
npm ci
npm run dev        # http://localhost:4321, live reload
npm run build      # validates internal links, builds the search index, writes dist/
npm run serve:cf   # serves dist/ through wrangler on http://localhost:8788 (production-like)
```

### Adding a page

1. Create `src/content/docs/<group>/<slug>.md` (or `.mdx` when you need components).
2. Frontmatter:

   ```yaml
   ---
   title: Temporary links
   description: One sentence shown under the title and used in search results and llms.txt.
   sidebar:
     order: 5 # position inside the group
   ---
   ```

3. The sidebar groups are fixed in `astro.config.mjs` (`start`, `links`, `sdk`, `react-native`,
   `dashboard`, `api`, `self-hosting`, `guides`, `contributing`); pages inside a group are
   picked up automatically and ordered by `sidebar.order`.
4. Link to other pages with absolute paths and a trailing slash: `/api/links/`. Broken internal
   links fail the build.
5. Starlight components (`Steps`, `Tabs`, `Aside`, `Card`) come from
   `@astrojs/starlight/components`.
6. On a step-by-step page, title each step with a `##` heading inside `<Steps>`
   (`1. ## Sign up`). The steps then appear in "On this page".

### Look and layout

The site wears the dectog.com identity on top of Starlight:

- `src/styles/custom.css` holds the color, type and size tokens for both themes; `chrome.css`
  styles the header, sidebar, table of contents and footer; `content.css` styles what Markdown
  renders. Code block frames and syntax colors are in `ec.config.mjs`.
- `src/components/` overrides Starlight's header, site title, page title, home page hero, mobile
  menu footer and footer (registered under `components` in `astro.config.mjs`).
  `src/components/home/` holds the sections of the home page, used from
  `src/content/docs/index.mdx`.
- Outfit, Inter and Fira Code are self-hosted through the `@fontsource-variable` packages.

### Conventions

- State behaviour, not intentions: numbers, limits, defaults and error strings come from the
  server and SDK source, and the page says which.
- The footer on every page states the versions the docs apply to (`flutter_dectog` 1.0.x,
  `react-native-dectog` 1.0.x, server migration `0001_schema`). When that changes, bump it in
  `src/components/Footer.astro` and in the `starlightLlmsTxt` `details` in `astro.config.mjs`,
  which feed `llms.txt`.
- `https://docs.dectog.com/llms.txt` and `/llms-full.txt` are generated at build time for AI
  agents; `dectog.com/SKILL.md` links to them.
- `sdk/api-reference.md` is generated from `flutter_dectog/doc/api-reference.md`, which also
  builds the SDK's `llms.txt`. Edit it in the SDK repo, then run `npm run sync:sdk-reference`
  here (`-- --check` reports drift).

## Deployment

Pushes to `main` build and deploy through `.github/workflows/deploy.yml`
(`cloudflare/wrangler-action`). The workflow needs two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token from the "Edit Cloudflare Workers" template, scoped to the account and zone |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account id |

Manual deploy from a machine logged in with `wrangler login`:

```bash
npm run deploy     # astro build && wrangler deploy
```

> [!NOTE]
> `wrangler.jsonc` binds the route `docs.dectog.com/*` in the `dectog.com` zone. That route is
> more specific than the main worker's `*.dectog.com/*`, so no change to the main worker is
> needed. Deleting this worker (`npx wrangler delete`) hands the host back to the main worker.
