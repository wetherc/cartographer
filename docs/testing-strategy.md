---
---
# Testing strategy

*Explanation. For the commands and the procedures, read
[Testing a change](testing.md).*

The suite tests pure logic with `node --test`, and a person checks
everything else in a browser. The coverage total is lower than the scores
of the pure modules, because the report also counts the DOM code that no
Node test can run.

## The split between pure logic and DOM glue

Almost every module is either pure logic or DOM glue. Pure logic takes its
inputs as arguments, including the random number generator and the current
time, and returns new values. DOM glue builds elements, mounts them, and
connects events.

Pure modules get unit tests. The tests call the functions and classes
directly, with an injected random number generator or plain fixture data.
They build no DOM and no canvas.

Most files in `tests/` take the name of the module that they test, such as
`tests/Conditions.test.js` for `src/entities/Conditions.js`. Other files
are scenario files. A scenario file follows one feature across several
modules, and its name is the name of the feature, such as
`tests/acBuffWiring.test.js` or `tests/CrossTabSync.test.js`. So a module
can have no test file of its own name and still have tests. Search `tests/`
for the module name before you add a new file.

Each module under `src/` has a basename that no other file in `src/` uses,
even when case is ignored. macOS and Windows treat `potions.js` and
`Potions.js` as the same name, so the flat `tests/` directory could hold
only one `Potions.test.js` for the two modules. Give the app half of such a
pair a role suffix, such as `potionsWiring.js` beside `entities/Potions.js`.
`tests/moduleLoad.test.js` fails when two files in `src/`, or two files in
`tests/`, have basenames that match when case is ignored.

The helpers in `tests/helpers/` stand in for the browser and for the
running app:

- `env.js` installs an in-memory `localStorage` (with an optional quota
  that throws `QuotaExceededError`) and a small `window` that can deliver
  a `storage` event. The storage suites use it to run the save, history,
  and cross-tab paths under `node --test`.
- `app.js` builds a stub `AppContext` with `stubApp`. The stub records
  each action call, log line, and refresh, so a suite for a `src/app/`
  module asserts on what a path did without a running app.

Glue modules get a check in a browser instead. A mock of the DOM proves
only that the code called the functions that the mock expected. It does not
prove that a GM can see the panel or click the button, so a person looks at
the map, the panels, and the dialogs.

Because of this split, the project needs no test framework, no browser
polyfill, and no mock library in its dependencies. The stubs in `tests/helpers/` are
plain JavaScript in the repository.

## The coverage total

The coverage report of Node counts only the files that a test loaded. A
module that no test imports is missing from the table, and it does not
appear at 0 percent. Without a fix, the total is an average over the tested
files alone.

`tests/moduleLoad.test.js` imports every file under `src/` except
`main.js` and `boot.js`, so every other module has a row and the total
covers the whole tree. This test is also a load check. A renamed export
fails there, even in a file with no test of its own. It loads the modules in
one fixed order, so it misses an import cycle that throws only when the
browser enters the cycle from another module. `tests/importCycles.test.js`
checks the static import graph of `src/` and fails on any cycle.

`main.js` builds the app as it loads, and `boot.js` writes to the document
as it loads. Both need a document, so neither is in the table.

Because every other file has a row, the line total sits well below the
per-file scores of the pure modules. For example, the line total is near
79 percent, while each module in `src/entities/` covers 100 percent of its lines. These
rows pull the total down:

| Files | Reason for the low score |
| --- | --- |
| `src/ui/*` panels, dialogs, and widgets | They build and mount elements, and a runner with no DOM can call almost none of that code |
| `src/app/*Wiring.js` | Each one mounts panels and registers handlers against a live app. The other `src/app/` modules keep the per-feature logic, and the suites cover it there |
| The `src/app/` action modules: `campaignActions`, `replaceActions`, `historySteps`, `externalSaves`, `nodeActions`, `generateAction`, `rosterActions`, `creatureForm`, `encounterPanels`, `splitParty`, and `sessionControls` | Each one opens dialogs, listens for clicks, or reloads the page. Their decisions live in pure modules with their own tests, such as `view/NodeForms.js`, `view/ReplaceFlow.js`, `view/SaveReport.js`, `map/NodeCleanup.js`, and `storage/SaveNotices.js` |
| The small `src/app/` glue modules: `headerMenu`, `mapBuildTools`, `mapChrome`, `mapNarration`, `mapPick`, `mapTeleport`, `onboarding`, `onboardingNext`, `phoneViews`, `shortcuts`, `shortenedLoadPrompts`, and the dialog of `healCure` | They toggle elements, ask a question in a dialog, or move the view. `mapTeleport` reads its landing from `view/TeleportLanding.js`, and `healCure` builds its dialog with `view/CureDialog.js` |
| The canvas modules: `MapCanvas`, `MapCanvasPointer`, `MapRenderer`, `TerrainPasses`, `MapMarkers`, `MapDecorations`, `RegionOverlay`, `CanvasText`, and `MapExport` | They draw to a 2D context or handle pointer events, and only a browser shows what they drew. Their layout math lives in tested modules such as `RegionOverlayLayout.js`, `RegionLabels.js`, `MapGeometry.js`, and `CoordLabels.js` |
| `src/storage/fileIO.js` and `src/storage/IndexedDbAssets.js` | They keep the download, upload, and IndexedDB primitives, which need a browser |
| `docs/gallery/runtime.js` | It runs the widget gallery page in a browser |

A low score on one of these files is expected. A low score on any other
file shows missing tests.

The branch and function scores of a file mean little when its line score
is low. Node counts only the branches and the functions that a test
reached, so a file whose functions never run can show 100 percent of its
branches. For example, a wiring module can show a line score under 10
percent, a branch score of 100 percent, and a function score of 0 percent.
This also lifts the branch total of the whole report well above the line
total. Read the line score first, and trust the branch score only on a file
whose lines the tests run.

A high line score on a module that consists mostly of `el(...)` calls is
not proof of a check. It shows that a test built the DOM, not that a test
looked at what the DOM shows.

The coverage script excludes `tests/**`. A test file runs from top to
bottom, so it scores near 100 percent. Without the exclusion, the report
lists the test files beside the modules, and the total rises several points
above the real score of the app code.

## Browser-only wrappers

Some modules wrap browser APIs that Node does not have. In
`src/storage/SaveStorage.js`, these are `trySaveToLocalStorage` and
`loadFromLocalStorage`. In `src/storage/CampaignFile.js`, these are
`downloadCampaignFile` and `readCampaignFromFile`.

The two `localStorage` wrappers have unit tests. `tests/SaveManager.test.js`
installs the in-memory `localStorage` from `tests/helpers/env.js`, saves a
campaign, loads it back, and simulates a failed write. The stub does not
know the real quota of a browser, so a person also checks a save and a load
in a real browser.

`downloadCampaignFile` and `readCampaignFromFile` need a file download and a
`File` object, and no helper stubs those. Each of them stays thin, and it
calls the pure functions `serializeCampaignFile` and `parseCampaignFile`,
which have tests.
A person checks an export and an import in a real browser.

The same rule applies inside `src/ui/`. The tests cover each pure helper in
that directory where it lives: `fitDimensions` and `encodeSizes` in
`tests/imageField.test.js`, and `clampToViewport` in
`tests/context-menu.test.js`. These helpers do arithmetic only, so they
need no DOM.

## Preview pages

The preview pages in `tests/` mount the real modules over hand-built
fixtures, without the rest of the app. A rendering fault is hard to find in
the full app. For example, a grid of every tile shows at once a tile that
does not join its neighbor. On a map with a party on it, the same fault is
hard to see.

Each preview page needs upkeep. When a mount signature changes, the page
goes stale, and a stale page can hide the error that it exists to show.
Update a page when its module changes, and delete the page when its module
goes away.

## Faults the suite cannot find

The suite proves rules, not appearance. It cannot find these faults:

- A panel that overflows its column.
- A contrast ratio that is too low.
- A focus ring that is gone.
- A line that the map draws between two tiles.

A GM sees each of these faults, and only a check in a browser finds them
first.
