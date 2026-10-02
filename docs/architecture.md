---
---
# Architecture

*Explanation. [`docs/README.md`](README.md) lists every document by kind.*

Campaign Builder is a single-page browser app with no framework and no
runtime dependencies. `index.html` loads `style.css`, the small blocking
script `src/boot.js`, and `src/main.js` as a native ES module. Every other
source file is imported from `src/main.js`. To read the codebase, you need
plain JavaScript and the DOM.

esbuild bundles the sources for the dev server and for the production
build, but the code does not depend on it. The same `index.html` runs the
unbundled sources when a static server serves the repository root.
[CONTRIBUTING.md](../CONTRIBUTING.md) describes both builds.

Each deeper subsystem has its own guide:

| Guide | Kind | What it covers |
| --- | --- | --- |
| [The app wiring layer](architecture/app-wiring.md) | Reference | How `main.js` composes the app, the `AppContext` object, and what each `src/app/` module owns |
| [The map](architecture/map.md) | Explanation | Tiles, the node hierarchy, region grouping, rendering, fog of war, and party movement |
| [Entities](architecture/entities.md) | Explanation | Creatures, resources, and the character model (classes, races, proficiencies, leveling) |
| [Combat](architecture/combat.md) | Explanation | Combat mode: the full-width fight screen, who owns the running fight, and how the screen stays current |
| [Persistence](architecture/persistence.md) | Explanation | How a campaign becomes a string, the packing layers, undo history, and the custom library |
| [UI components](architecture/ui-components.md) | Reference | The shared widget builders, the panel contract, the design tokens, and the CSS class vocabulary |
| [Conventions](architecture/conventions.md) | Reference | Performance patterns, UI and CSS rules, and how code here gets tested |

Read this page first, and then read the guide for the area that you change.
Each guide assumes only what this page says. If you have not changed
anything here yet, follow the [first code change](tutorial-first-code-change.md)
tutorial. It goes once through the whole loop, from a running app to a
tested change.

## The big picture

```
  index.html + style.css
          |
          +--> src/boot.js ....... before the first paint: applies the
          |                        saved theme and the viewer role
          v
  src/main.js ................ composition root: builds one AppContext,
          |                    then calls each wiring module in order
          v
  src/app/*.js ............... wiring modules, one per feature area;
          |                    mount panels, register views and actions,
          |                    keep per-feature UI state
     _____|________________________________________
    |            |            |                    |
    v            v            v                    v
  src/ui/      src/map/    src/entities/,      src/dice/, src/party/,
  DOM widgets  canvas +    src/combat/         src/quest/, src/handout/,
  (panels,     pure map    pure rules and      src/time/, src/log/,
  dialogs,     logic       data models         src/view/, src/library/,
  forms)          |                            src/campaign/, src/util/
                  v
             src/storage/ ..... serialization, localStorage,
                                file export/import, undo history
```

UI widgets and wiring modules call *down* into the pure modules. The pure
modules do not import from `ui/` or `app/`, so `node --test` covers most of
the codebase with no browser. A few files in the pure directories use a
browser API directly, and the browser checks cover them:

- `map/TileRaster.js` and `map/MapExport.js` draw to an offscreen canvas.
- `storage/fileIO.js` starts a file download.
- `storage/SaveManager.js`, `storage/PlayerPatch.js`, and
  `storage/GMLock.js` listen for the `storage` event of other tabs.
- `view/CharacterClaim.js` builds the character picker of a Player tab
  with the helpers in `ui/`.

The [Conventions](architecture/conventions.md) guide describes the pattern
in detail.

## Directory map

```
index.html        the page: layout, Content Security Policy, script tags
style.css         the stylesheet manifest (see below)
src/
  main.js         composition root (see the wiring guide)
  boot.js         before-paint script: theme and viewer role
  app/            wiring modules, one per feature area
  ui/             DOM widgets: panels, dialogs, forms, the combat screen
  map/            tile grid, node hierarchy, generators, canvas rendering, fog of war
  entities/       creature, resource, equipment, and character models
  combat/         initiative, attack resolution, action budget, reactions
  data/           frozen 5e catalogs: classes, races, backgrounds, spells, feats
  campaign/       blank and example campaign builders, and the initial load
  party/          party position and split-party tokens; moving the party reveals fog
  quest/          quests, objectives, and quest links
  handout/        handout records, visibility filters, and form helpers
  time/           the in-game clock of watches and days
  log/            the travelogue
  dice/           dice roll logic
  library/        built-in templates merged with the GM's custom library
  view/           view rules: stat bars, the shortcut table, theme, player lock
  storage/        serialization, localStorage and file persistence, undo history
  util/           small helpers: clamping, memoizing, deep freeze, seeded random
  types/          .ts declaration files, no runtime code
styles/           feature-scoped CSS sheets
assets/tiles/     tile art, one directory per tile family
fonts/            the bundled typefaces (see fonts/README.md)
library/          campaign-library.json, the custom library loaded at startup
tests/            node --test suites, and HTML preview pages for the browser
bench/            performance harnesses (see bench/README.md)
scripts/          the esbuild build, the deploy script, the developer guide build,
                  the list of docs site files
site/             the Jekyll layout, settings, and assets of the docs site
hooks/            the versioned pre-commit hook
docs/             this documentation
```

The project is written in plain JavaScript, and TypeScript checks it. Types
live in `.ts` files that contain only declarations, and the `.js` files
reference those types through JSDoc comments. `tsconfig.json` sets `allowJs`,
`checkJs`, and `strict`, and includes `src/` and `docs/gallery/`. The
command `pnpm run typecheck` checks those two trees and emits nothing. It
does not check `tests/` or `bench/`.

`style.css` is an import manifest. It `@import`s the feature sheets under
`styles/` in cascade order. `base.css` comes first with the design tokens
and the shared primitives, and `responsive.css` comes last with the
overrides for narrow screens. The order lives in this one file, so it shows
which sheet overrides which.

## Pure logic and DOM glue

Almost every module here is either pure logic or thin DOM glue. Pure
logic takes its inputs as arguments, including side effects such as the
random number generator or the current time. It returns new values, and it
does not change what it received or touch the DOM. Glue connects that logic
to elements and events.

`dice/`'s `roll(selection, rng)`, `map/MapNavigator.js`, `map/FogOfWar.js`,
all of `entities/`, and the serialize and deserialize functions of
`storage/SaveManager.js` are pure logic. The widgets in `ui/`, the canvas
event handlers, and the wiring modules in `app/` are glue.

Unit tests cover the pure logic, and browser checks cover the glue (see
[Testing a change](testing.md)). When you add a feature, decide which part
is a pure function and which part is glue, and split the code at that point.
Anything that you can construct without the DOM belongs in a pure module.
For the same reason, `campaign/` builds the example campaign, and the
wiring module only loads it:

| File | What it builds |
| --- | --- |
| `ExampleWorld.js` | The generated world from one fixed seed, and the region names |
| `ExampleRegions.js` | The hand edits of each region, and the story places |
| `ExampleStaging.js` | The helpers that expand sites into sub-maps and pick tiles for the story places |
| `ExampleRoads.js` | The helper that paints a road spur from a region road to a border cell |
| `ExampleContent.js` | The populace, combined from the files below |
| `ExampleParty.js` | The four level-4 characters |
| `ExampleCast.js` | The foes and the bestiary |
| `ExamplePeople.js` | The people of the Marches: townsfolk, patrons, and the Castellan |
| `ExampleStatBlocks.js` | The ability scores of each kind of foe |
| `ExampleStory.js` | The quests with their steps and links |
| `ExampleHandouts.js` | The handouts, bound to their story places |

`Campaigns.js` combines the maps and the content, and it also builds the
blank campaign and loads the saved one at startup.

Pure functions return a new value instead of changing the value in place.
For example, `applyDamage(creature, n)` returns a new creature, and
`setTile(node, tile)` returns a new node. Several caches depend on this
rule. Code never changes an object in place after it hands the object out,
so a cache keyed on the object itself never serves stale data. The
[Conventions](architecture/conventions.md) guide covers these caches and
explains why the code enforces immutability at runtime.
