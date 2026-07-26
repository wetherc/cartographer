# Campaign Builder

This project is a self-contained suite for creating and managing the world of a D&D (or equivalent) campaign. Notably, this is not intended to GM for you; only to visualize the world that the players are interacting with in a dynamic and engaging way.

![Play mode: the fog-revealed map with the session panels alongside](docs/images/play-mode-light.png)

## Features

With Campaign Builder, you can:

  - Visually construct a tiled world, with regions, sub-regions, and major and minor points of interest
    - You can use a suite of pre-built tiled images, or supply your own [WIP]
    - All tiles have metadata associated with them to allow you to specify major features that players can discover and interact with
    - Groups of tiles can be hierarchical, with a world containing regions, regions containing sub-regions, and so on
    - You can visually zoom into and out of different hierarchical levels (e.g., from a region you can zoom into a particular sub-region and show the point of interest tiles)
    - You can progressively reveal parts of the map as your party travels. Unexplored areas remain greyed out until your party moves closer
    - Track your party's location on the map at all times
  - Add major enemies/encounters with life tracking
  - Add resource tracking (items, D&D-style spell slots, and other expendable character-based resources)
  - Add character sheets with full character stats, class (and subclass), race, background, assembled proficiencies, hit dice, spellcasting, and level/progression tracking with per-level class assignment, multiclassing, and ability-score-improvement/feat choices
  - Simulate dice rolls and their results for any combination of dice needed in an interaction
  - Curate a campaign-independent library of equipment, enemies, and NPC templates (the Library mode in the header): the built-in 5e defaults are all listed and individually customizable, and your overrides and additions export to a portable JSON file — kept as the gitignored `library/campaign-library.json` it stays out of version control and auto-loads into any fresh browser or clone
  - Switch the whole UI between light and dark with the header's theme switch — or leave it on System to follow the operating system's preference; the choice persists per browser

![Build mode: world tree, editable map, and the paint palette](docs/images/build-mode.png)

![Play mode in the dark theme](docs/images/play-mode-dark.png)

See [`docs/gm-guide.md`](docs/gm-guide.md) for more, including the Library mode.

## Development

No build step. Plain HTML/CSS/JS served as native ES modules; the app is `index.html` + `style.css` + `src/main.js`. `style.css` is an import manifest for the feature-scoped sheets under `styles/`, listed in cascade order.

The `library/` directory at the project root is gitignored: it holds the GM's exported `campaign-library.json` (custom equipment/bestiary/NPC templates), which the app fetches at startup when the browser has no stored library.

Serve the project root over HTTP (module imports don't work over `file://`) and open it in a browser, e.g.:

```
pnpx http-server -p 8934
```

Types live in `src/types/*.ts` as declaration files; `.js` files reference them via JSDoc (`@typedef {import('../types/map.js').Tile}`). Typecheck with:

```
pnpm --package=typescript dlx tsc --noEmit
```

(Not `pnpx tsc` — with no local TypeScript install, the bare `tsc` binary name
resolves to npm's placeholder package, which exits without checking anything.)

Tests use Node's built-in test runner, no extra dependencies:

```
node --test tests/some-module.test.js   # single file, preferred while iterating
node --test tests/*.test.js             # full suite
```

Lint with ESLint (flat config in `eslint.config.js`, fetched on demand — still
no installed dependencies):

```
pnpm --package=eslint dlx eslint .
```

A versioned pre-commit hook in `hooks/pre-commit` runs the linter, the full
test suite, and the typecheck. Enable it once per clone with:

```
git config core.hooksPath hooks
```

See [`docs/gm-guide.md`](docs/gm-guide.md) for a GM-facing walkthrough of running and building a campaign, [`docs/architecture.md`](docs/architecture.md) for module layout and the map data model, [`docs/testing.md`](docs/testing.md) for how to test and visually verify changes, and [`docs/tile-assets.md`](docs/tile-assets.md) for tile art conventions. `PLAN.md` tracks the current build order and status.

## Contributing

- Keep dependencies at zero. If a feature seems to need one, look for a plain DOM/Canvas/`fetch` way to do it first.
- Match the existing module shape: pure, dependency-injected logic (e.g. `roll(selection, rng)`, `MapNavigator`, `RegionGroups.findRegionGroups`) separated from thin DOM-wiring code (`ui/*.js`, `MapCanvas`'s event handlers). Pure logic gets unit tests; DOM/canvas rendering gets checked visually instead.
- Add unit tests for new pure logic and run `tsc --noEmit` before committing; both are expected to pass cleanly.
- For any UI/canvas change, visually verify it in a browser (Playwright against the running dev server, or by hand) — passing tests confirm correctness, not that a feature looks or feels right.
