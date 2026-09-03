# Architecture

*Explanation. [`docs/README.md`](README.md) lists every document by kind.*

Campaign Builder is a single-page browser app. It has no build step, no
framework, and no runtime dependencies.

The browser loads `index.html`. This file pulls in `style.css` and
`src/main.js` as a native ES module. Every other file is imported from
`src/main.js`.

If you can read plain JavaScript, you can read the whole codebase.

Each deeper subsystem has its own guide:

| Guide | Kind | What it covers |
| --- | --- | --- |
| [The app wiring layer](architecture/app-wiring.md) | Reference | How `main.js` composes the app, the `AppContext` object, and what each `src/app/` module owns |
| [The map](architecture/map.md) | Explanation | Tiles, the node hierarchy, region grouping, rendering, fog of war, and party movement |
| [Entities](architecture/entities.md) | Explanation | Encounters, resources, and the character model (classes, races, proficiencies, leveling) |
| [Combat](architecture/combat.md) | Explanation | Combat mode: the full-width fight screen, who owns the running fight, and how the screen stays current |
| [Persistence](architecture/persistence.md) | Explanation | How a campaign becomes a string, the packing layers, undo history, and the custom library |
| [UI components](architecture/ui-components.md) | Reference | The shared widget builders, the panel contract, the design tokens, and the CSS class vocabulary |
| [Conventions](architecture/conventions.md) | Reference | Performance patterns, UI and CSS rules, and how code here gets tested |

Read this page first. After that, start with the guide that covers the area
you change. Each guide stands alone.

If you have not changed anything here yet, do the
[first code change](tutorial-first-code-change.md) tutorial. It walks the
whole loop once, from a running app to a tested change.

## The big picture

```
  index.html + style.css
          |
          v
  src/main.js ................ composition root: builds one AppContext,
          |                    then calls each wiring module in order
          v
  src/app/*.js ............... wiring modules, one per feature area;
          |                    mount panels, register views and actions,
          |                    hold per-feature UI state
     _____|______________________________
    |            |            |          |
    v            v            v          v
  src/ui/      src/map/    src/entities/  src/dice/, src/party/,
  DOM widgets  canvas +    pure data      src/library/, src/campaign/
  (panels,     pure map    models         (more pure logic)
  dialogs,     logic
  forms)          |
                  v
             src/storage/ ..... serialization, localStorage,
                                file export/import, undo history
```

The diagram shows the direction of the arrows. UI widgets and wiring modules
call *down* into the pure modules (`map/`, `entities/`, `storage/`, `dice/`,
`party/`, `library/`). The pure modules never import from `ui/` or `app/`. The
pure modules never touch the DOM. This rule keeps most of the codebase
testable with `node --test` alone. See
[Conventions](architecture/conventions.md) for the pattern in detail.

## Directory map

```
src/
  main.js         composition root (see the wiring guide)
  app/            wiring modules, one per feature area
  types/          .ts declaration files, no runtime code
  campaign/       campaign construction: blank/example builders, initial load
  map/            tile grid, node hierarchy, canvas rendering, fog of war
  dice/           dice roll logic
  entities/       encounter/resource/character models
  library/        built-in default templates + custom-library merge logic
  party/          party position tracking; triggers fog reveal
  storage/        serialization, localStorage/file persistence, undo history
  ui/             thin DOM widgets (DiceTray, CharacterSheet, panels, dialogs)
styles/           feature-scoped CSS sheets; style.css @imports them in order
tests/            node --test suites for the pure modules
docs/             you are here
```

The project uses plain JavaScript, but the project is fully typechecked. Types
live in `.ts` files that contain only declarations. The `.js` files reference
these types through JSDoc comments. `tsconfig.json` sets `allowJs` and
`checkJs`. As a result, `pnpm run typecheck` checks the whole project and
emits nothing.

`style.css` is an import manifest. It `@import`s the feature sheets under
`styles/`, with base tokens and primitives first and the responsive overrides
last. This states the cascade order in exactly one place.

## Pure logic and DOM glue

Almost every module here is one of two kinds:

1. **Pure logic** takes its inputs as arguments, including side effects such
   as RNG or the current time, and returns new values. It never changes what
   it received. It never touches the DOM. Examples: `dice/`'s
   `roll(selection, rng)`, `map/MapNavigator.js`, `map/FogOfWar.js`, all of
   `entities/`, and the serialize and deserialize functions of
   `storage/SaveManager.js`.
2. **Thin DOM glue** connects this logic to elements and events. Examples: the
   widgets in `ui/`, the canvas event handlers, and the wiring modules in
   `app/`.

Unit tests cover pure logic. DOM glue is checked in the browser instead
(see `docs/testing.md`). When you add a feature, decide which part is a pure
function and which part is glue. Then split the code at that point. Both
halves stay simpler this way. Anything you can construct without the DOM
belongs in a pure module.

The example world's maps live in `campaign/ExampleWorld.js`. Its populace
lives in `campaign/ExampleContent.js`. Neither lives in the wiring module that
loads them.

The pure modules share one more pattern. Functions take a value and return a
new value instead of changing the value in place. `applyDamage(encounter, n)`
returns a new encounter. `setTile(node, tile)` returns a new node. Several
caches depend on this pattern. Once code hands out an object, no code changes
that object in place. As a result, a cache keyed on the object itself never
goes stale. The [Conventions](architecture/conventions.md) guide covers these
caches and explains why the code enforces immutability instead of assuming
it.
