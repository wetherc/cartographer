# Architecture

Campaign Builder is a single-page browser app with no build step, no framework,
and no runtime dependencies. The browser loads `index.html`, which pulls in
`style.css` and `src/main.js` as a native ES module, and everything else is
imported from there. If you can read plain JavaScript, you can read this whole
codebase.

The deeper subsystems each have their own guide:

| Guide | What it covers |
| --- | --- |
| [The app wiring layer](architecture/app-wiring.md) | How `main.js` composes the app, the `AppContext` object, and what each `src/app/` module owns |
| [The map](architecture/map.md) | Tiles, the node hierarchy, region grouping, rendering, fog of war, and party movement |
| [Entities](architecture/entities.md) | Encounters, resources, and the character model (classes, races, proficiencies, leveling) |
| [Persistence](architecture/persistence.md) | How a campaign becomes a string, the packing layers, undo history, and the custom library |
| [UI components](architecture/ui-components.md) | The shared widget builders, the panel contract, the design tokens, and the CSS class vocabulary |
| [Conventions](architecture/conventions.md) | Performance patterns, UI and CSS rules, and how code here gets tested |

Read this page first. After that, start with whichever guide covers the area
you are changing; each stands alone.

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

What matters in that diagram is the direction of the arrows. UI widgets and wiring
modules call *down* into the pure modules (`map/`, `entities/`, `storage/`,
`dice/`, `party/`, `library/`); the pure modules never import from `ui/` or
`app/` and never touch the DOM. That rule is what keeps most of the codebase
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

The project is plain JavaScript, but it is fully typechecked. Types live in `.ts`
files that contain only declarations, and the `.js` files reference them through
JSDoc comments. `tsconfig.json` sets
`allowJs`/`checkJs`, so `pnpm --package=typescript dlx tsc --noEmit` checks
everything without emitting anything.

`style.css` is just an import manifest: it `@import`s the feature sheets under
`styles/` (base tokens and primitives first, the responsive overrides last), so
the cascade order is stated in exactly one place.

## Pure logic and DOM glue

Almost every module here is one of two kinds:

1. **Pure logic** that takes its inputs, including side effects like RNG or
   the current time, as arguments and returns new values. It never mutates
   what it was given and never touches the DOM. Examples: `dice/`'s
   `roll(selection, rng)`, `map/MapNavigator.js`, `map/FogOfWar.js`, all of
   `entities/`, and `storage/SaveManager.js`'s serialize/deserialize.
2. **Thin DOM glue** that wires that logic to elements and events: the widgets
   in `ui/`, the canvas event handlers, the wiring modules in `app/`.

Pure logic gets unit tests. DOM glue gets looked at in a browser instead (see
`docs/testing.md`). When you add a feature, decide which part is a pure
function and which part is glue, then split it there; both halves stay simpler
that way. Anything constructible without the DOM belongs in a pure module. The
example world's maps live in `campaign/ExampleWorld.js` and its populace in
`campaign/ExampleContent.js`, not in the wiring that loads them.

The pure modules also share an update style: functions take a value and return
a new one instead of mutating. `applyDamage(encounter, n)` hands back a new
encounter; `setTile(node, tile)` hands back a new node. Several caches lean on
this: an object that has been handed out is never changed in place, so a
cache keyed on the object itself can never go stale. The
[Conventions](architecture/conventions.md) guide covers those caches and why
the immutability is enforced rather than assumed.
