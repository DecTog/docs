# DecTog documentation

Source of <https://docs.dectog.com>, the canonical documentation for
[DecTog](https://dectog.com): the server ([`DecTog/dectog`](https://github.com/DecTog/dectog),
AGPL-3.0) and the Flutter SDK ([`DecTog/flutter_dectog`](https://github.com/DecTog/flutter_dectog),
MIT). Built with [Astro Starlight](https://starlight.astro.build) and served from a Cloudflare
Worker as static assets.

Every page describes what the code does today. Where the product's own wording and the code
disagree, the docs follow the code and say so.

## Working on the docs

```bash
npm ci
npm run dev        # http://localhost:4321, live reload
npm run build      # validates internal links, builds the search index, writes dist/
npm run serve:cf   # serves dist/ through wrangler on http://localhost:8788 (production-like)
```

Node 22 or newer (`.nvmrc` says 24).

### Adding a page

1. Create `src/content/docs/<group>/<slug>.md` (or `.mdx` when you need components).
2. Frontmatter:

   ```yaml
   ---
   title: Temporary links
   description: One sentence used in search results and llms.txt.
   sidebar:
     order: 5 # position inside the group
   ---
   ```

3. The sidebar groups are fixed in `astro.config.mjs` (`start`, `links`, `sdk`, `dashboard`,
   `api`, `self-hosting`, `guides`, `contributing`); pages inside a group are picked up
   automatically and ordered by `sidebar.order`.
4. Link to other pages with absolute paths and a trailing slash: `/api/links/`. Broken
   internal links fail the build.
5. Starlight components (`Steps`, `Tabs`, `Aside`, `Card`) come from
   `@astrojs/starlight/components`.

### Conventions

- State behaviour, not intentions: numbers, limits, defaults and error strings come from the
  server and SDK source, and the page says which.
- The footer on every page states the versions the docs apply to (`flutter_dectog` 1.0.x,
  server migration 0027). Bump it in `src/components/Footer.astro` when that changes.
- `https://docs.dectog.com/llms.txt` and `/llms-full.txt` are generated at build time for AI
  agents; `dectog.com/SKILL.md` links to them.

## Deployment

Pushes to `main` build and deploy through `.github/workflows/deploy.yml`
(`cloudflare/wrangler-action`). The workflow needs two repository secrets:

| Secret                  | Value                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token from the "Edit Cloudflare Workers" template, scoped to the account and zone |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account id                                                              |

Manual deploy from a machine logged in with `wrangler login`:

```bash
npm run deploy     # astro build && wrangler deploy
```

`wrangler.jsonc` binds the route `docs.dectog.com/*` in the `dectog.com` zone. That route is
more specific than the main worker's `*.dectog.com/*`, so no change to the main worker is
needed. Deleting this worker (`npx wrangler delete`) hands the host back to the main worker.

## License

Site code (configuration, components, styles): [MIT](LICENSE).
Documentation content under `src/content`: [CC BY 4.0](LICENSE-CONTENT).
