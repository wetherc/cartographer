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

Pure modules get unit tests. Each `tests/*.test.js` file pairs with one
module under `src/`. The tests call the functions and classes directly,
with an injected random number generator or plain fixture data. They build
no DOM, no canvas, and no mock of a browser API.

Glue modules get a check in a browser instead. A mock of the DOM proves
only that the code called the functions that the mock expected. It does not
prove that a GM can see the panel or click the button, so a person looks at
the map, the panels, and the dialogs.

Because of this split, the project needs no test framework and no browser
polyfill in its dependencies.

## The coverage total

The coverage report of Node counts only the files that a test loaded. A
module that no test imports is missing from the table, and it does not
appear at 0 percent. Without a fix, the total is an average over the tested
files alone.

`tests/moduleLoad.test.js` imports every file under `src/` except
`main.js` and `boot.js`, so every other module has a row and the total
covers the whole tree. This test is also a load check. A renamed export or
a circular import fails there, even in a file with no test of its own.

`main.js` builds the app as it loads, and `boot.js` writes to the document
as it loads. Both need a document, so neither is in the table.

Because every other file has a row, the line total sits well below the
per-file scores of the pure modules. For example, the line total is near
78 percent, while each module in `src/entities/` covers 100 percent of its lines. These
rows pull the total down:

| Files | Reason for the low score |
| --- | --- |
| `src/ui/*` panels, dialogs, and widgets | They build and mount elements, and a runner with no DOM can call almost none of that code |
| `src/app/*Wiring.js` | Each one mounts panels and registers handlers against a live app. The other `src/app/` modules keep the per-feature logic, and the suites cover it there |
| The canvas renderers: `MapRenderer`, `MapMarkers`, `MapDecorations`, `CanvasText`, and `MapExport` | They draw to a 2D context, and only a browser shows what they drew |
| `src/storage/fileIO.js` | It keeps the download and upload primitives, which need a browser |

A low score on one of these files is expected. A low score on any other
file shows missing tests.

A high line score on a module that consists mostly of `el(...)` calls is
not proof of a check. It shows that a test built the DOM, not that a test
looked at what the DOM shows.

The coverage script excludes `tests/**`. A test file runs from top to
bottom, so it scores near 100 percent. Without the exclusion, the report
lists the test files beside the modules, and the total rises several points
above the real score of the app code.

## Browser-only wrappers

Some modules wrap browser APIs that Node does not have. In
`src/storage/SaveManager.js`, these are `trySaveToLocalStorage`,
`loadFromLocalStorage`, `downloadState`, and `readStateFromFile`. They
cannot get a unit test, even with a stub that replaces the DOM.

The project adds no polyfill and no mock library for them. Each wrapper
stays thin, and it calls pure functions that already have tests:
`serialize` and `deserialize`. A person checks the wrapper in a real
browser, where a save followed by a load is an end-to-end check.

The same rule applies inside `src/ui/`. The tests cover each pure helper in
that directory where it lives: `fitDimensions` and `encodeAttempts` in
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
