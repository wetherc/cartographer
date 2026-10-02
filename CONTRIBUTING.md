---
---
# Contributing to Campaign Builder

*How-to guide. [docs/README.md](docs/README.md) lists every document by kind.*

This guide tells you how to set up the development tools, run the app and its checks, and send a change. To walk through one complete change first, follow [Your first code change](docs/tutorial-first-code-change.md).

## Design principles

- **Plain JavaScript.** The app is written in modern JavaScript as native ES modules, and it uses only standard browser APIs. It has no runtime dependencies and no framework.
- **Types without a compile step.** Type declarations live in `.ts` files under `src/types/`, and the `.js` files use them through JSDoc comments, for example `@typedef {import('../types/map.js').Tile}`. TypeScript only checks the code. It emits nothing.
- **A bundler for serving only.** esbuild bundles the sources for the dev server and for the production build. The runtime code does not depend on esbuild, and `index.html` loads `src/main.js` directly when a static server serves the repository root.
- **Pure logic apart from DOM glue.** Rules, data models, and the save format live in modules that do not touch the DOM, so unit tests cover them in Node. [Architecture](docs/architecture.md) describes the split.

## Prerequisites

- Node.js 22 or later. The browser benchmark uses the `WebSocket` global that Node 22 added.
- pnpm 11. The `devEngines` field in `package.json` names the version, and pnpm downloads it if yours does not match.
- Google Chrome, only if you run `pnpm bench`.

## Set up the tools

1. Install the development tools that the lockfile pins (esbuild, TypeScript, ESLint, and Prettier):

   ```bash
   pnpm install
   ```

2. Turn on the pre-commit hook for this clone:

   ```bash
   git config core.hooksPath hooks
   ```

The hook runs the tools from `node_modules`, so step 1 must come first. See [The pre-commit hook](#the-pre-commit-hook) for what it checks.

## Start the dev server

Start the server, and leave the terminal open:

```bash
pnpm run dev
```

The server prints `http://127.0.0.1:8080`. Open that address in a browser.

The dev server bundles the sources into `dist/` and serves `dist/` on port 8080. It accepts connections from the same computer only. When you save a file under `src/` or a stylesheet, esbuild rebuilds the bundle, and you reload the page to see the change. The page does not reload by itself.

The server writes `dist/index.html` and copies `assets/` once, at start. If you change `index.html` or a file under `assets/`, stop the server and start it again.

The server also serves `docs/`, `src/`, `styles/`, and `fonts/` as plain files through links in `dist/`. Pages that load the source modules directly, such as the widget gallery at `http://127.0.0.1:8080/docs/gallery.html`, use these links.

## Run the checks

| Command | What it does |
| --- | --- |
| `pnpm test` | Runs every unit test in `tests/` with the Node test runner. The output has one line for each test file, grouped by the area under `src/`. Only a failing file lists its tests |
| `TEST_VERBOSE=1 pnpm test` | Runs the same tests, and lists the name of every test |
| `node --test tests/Conditions.test.js` | Runs one test file. Use it while you work on one module |
| `pnpm run test:flat` | Runs every test with the default reporter of Node |
| `pnpm run coverage` | Runs every test, and reports line, branch, and function coverage for each file |
| `pnpm run lint` | Runs ESLint over the tree |
| `pnpm run typecheck` | Runs the TypeScript checker over `src/` and `docs/gallery/` |
| `pnpm run guide:check` | Fails if `docs/dev-guide.html` does not match the current source tree |

Do not use `pnpx tsc` for the typecheck. It downloads a placeholder package named `tsc` that checks nothing.

The tests run against the source files, not the bundle. [Testing a change](docs/testing.md) describes the test output, the browser checks, and the preview pages.

## The pre-commit hook

The hook in `hooks/pre-commit` runs these steps in order, and stops the commit at the first failure:

1. It formats the staged `.js`, `.ts`, and `.css` files with Prettier, and stages them again.
2. It rebuilds `docs/dev-guide.html` and stages it, if the commit changes `src/`, `tests/`, `package.json`, or the guide scripts.
3. It runs ESLint.
4. It runs the unit tests.
5. It runs the typecheck.
6. It runs `pnpm run bench:commit`, if the commit changes `src/`. This step prints a warning when a code path is over its time budget, and it never stops the commit.

> **Warning:** Step 1 stages the whole file again. If you staged only part of a file, the hook also stages the rest of that file. To prevent this, commit or stash the other changes first.

Prettier formats code only. It skips Markdown, HTML, and JSON files, as `.prettierignore` sets.

## The developer guide

`docs/dev-guide.html` is a generated tour of the codebase. Open it in a browser to see the import map, the mount order in `src/main.js`, the packing layers of a save, and a checklist for a pull request.

Do not edit the page by hand. Rebuild it with this command:

```bash
pnpm run guide
```

The build reads counts, import edges, the mount order, registry entries, storage keys, code snippets, and save sizes from the repository. The prose and the classifications live in `scripts/dev-guide/content.mjs`. The build checks every file and symbol that the prose names, so a rename fails the build and does not leave stale text.

## Benchmarks

`pnpm bench` and the four `pnpm run bench:*` scripts measure the app in Chrome and the pure modules in Node. [bench/README.md](bench/README.md) describes each harness, its options, and its output.

## Production build and deploy

Build the production files:

```bash
pnpm run build
```

The build writes minified bundles to `dist/`. Each bundle name has a content hash, so a browser never serves a cached bundle from an older deploy with a newer `index.html`. The build also copies `assets/`, `CNAME`, and `library/campaign-library.json`.

> **Warning:** `pnpm run deploy` force-pushes `dist/` to the `gh-pages` branch of the public repository, and it replaces the published site. Only a maintainer runs it.

The deploy script installs the exact versions in the lockfile, builds, and pushes. The commit on `gh-pages` names the version from `package.json`.

## The docs site

The production build also copies the documentation into `dist/`, and GitHub Pages builds it with Jekyll when the deploy pushes the branch. The docs are served at <https://cartographer.tbmh.org/docs/>. The Markdown files keep their paths from the repository, so a relative link works the same on GitHub and on the site. The Jekyll plugin `jekyll-relative-links` changes each `.md` link to the built page. `docs/index.md` is the home page of the site.

The files that only the site uses are in `site/`, which has the same layout as the root of the `gh-pages` branch:

| File | What it does |
| --- | --- |
| `site/_config.yml` | The Jekyll settings, the plugin list, and the default layout for each page |
| `site/_layouts/docs.html` | The page template: header, sidebar, page text, and the previous and next links |
| `site/_data/docs_nav.yml` | The sidebar, in reading order |
| `site/docs/assets/` | The stylesheet and the script of the site |
| `site/robots.txt` | Allows every crawler, and gives the address of `sitemap.xml`, which `jekyll-sitemap` writes |

`scripts/docs-site.js` lists the files to copy. It adds an empty front matter block to each Markdown file, because Jekyll skips a `README.md` or `CONTRIBUTING.md` that has none. The UI gallery, `docs/gallery.html`, imports the source modules unbundled, so the site also ships `src/`, `styles/`, and `style.css` at their repository paths. The tile preview, `tests/tile-preview.html`, ships as `docs/tile-gallery.html`, which keeps its links to `../assets/tiles/` working.

When you add a document, add it to `site/_data/docs_nav.yml`. `tests/DocsSite.test.js` fails when a page is missing from the sidebar, when a sidebar entry has no page, or when a relative link or a heading anchor has no target.

To see the site before a deploy, start Docker and run this command:

```bash
pnpm run docs:preview
```

The script builds `dist/` and runs the `github-pages` gem in a container, which is the Jekyll build of the server. Open `http://127.0.0.1:4000/docs/`. The first run builds the container image, which takes a few minutes. The preview does not rebuild after an edit, so stop it and run it again.

## Send a change

- Keep each pull request to one feature or one fix.
- Add unit tests for new pure logic.
- If you change the UI or the canvas, open the app in a browser and check the change. Read the browser console for errors.
- Make sure that the tests, the linter, and the typecheck pass before you open the pull request.
