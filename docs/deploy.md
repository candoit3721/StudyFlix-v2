# Deploying under a base path

StudyFlix v2 is a static site that can be served from a domain root (`https://example.org/`) or from a GitHub Pages project subpath (`https://candoit3721.github.io/StudyFlix-v2/`).
The **base path** decides which one a build is for.
It is chosen at build time, so moving the site is a setting, not a code change.

## How the base works

- The base comes from the `SITE_BASE` environment variable, read in `astro.config.mjs`.
  `scripts/site-base.mjs` normalizes it: unset, empty or `/` means the root, `StudyFlix-v2` becomes `/StudyFlix-v2/`, and values with `://`, `..`, `?`, `#`, a double slash or whitespace fail the build with a clear error.
  The case is kept, because GitHub Pages paths are case-sensitive.
- Astro prefixes its own bundled assets (`_astro/` CSS, JS and fonts) with the base.
  Everything else goes through one of two helpers:
  - the catalog (`src/model/catalog.ts`) builds every learner, course, lesson and curriculum `url` under the base;
  - `withBase('/path/')` (`src/lib/paths.ts`) prefixes any other in-site URL, such as the wordmark, `favicon.svg` and the account page.
- The 404 page uses absolute, base-prefixed URLs, because GitHub Pages serves `404.html` for a missing path at any depth.
- Progress is stored under `studyflix:v2:*` keys.
  Every `candoit3721.github.io` project site shares one origin and one `localStorage`, so the prefix keeps this site's progress separate.

**The rule: never hard-code a root-relative URL** (`href="/..."`, `src="/..."`) in `src/`.
Use a catalog `url` or `withBase()`.
The same goes for links in lesson Markdown: a link such as `[see](/courses/...)` in `content/` would bypass the base (there are none today).

## The `SITE_BASE` repository variable

CI (`.github/workflows/ci.yml`) builds with `SITE_BASE` set to the repository variable `SITE_BASE` if it exists, and otherwise to `/<repository name>/`.
So with no variable, this repository deploys to `/StudyFlix-v2/`, which is where GitHub Pages serves a project site.

**When the custom domain moves to this repository, set the repository variable `SITE_BASE` to `/`** (Settings, Secrets and variables, Actions, Variables).
The next build on `main` is then served from the domain root.
No code changes are needed.

## Checking a subpath build locally

Local commands use the root unless `SITE_BASE` is set:

```sh
npm run dev                                   # http://localhost:4321/
SITE_BASE=/StudyFlix-v2/ npm run dev          # http://localhost:4321/StudyFlix-v2/

SITE_BASE=/StudyFlix-v2/ npm run build
SITE_BASE=/StudyFlix-v2/ npx astro preview    # preview reads the base from the config too
```

`npm run verify` proves both bases.
`npm run test:e2e` tests `dist/` at the base it was built with, and `npm run test:e2e:other-base` (`scripts/e2e-other-base.mjs`) then builds `dist-other-base/` with the other base (`/StudyFlix-v2/` when `SITE_BASE` is the root, `/` otherwise) and runs the whole Playwright suite against it.
The every-page crawl in `tests/e2e/site.spec.ts` fails on any same-origin link or asset outside the base and on any failed same-origin request.

In e2e tests, go to pages and compare URLs through `site('/path/')` from `tests/e2e/helpers.ts`.
With a subpath `baseURL`, `page.goto('/path/')` would drop the base.
