# Testing strategy

*Explanation. For the commands and the procedures, read
[Testing a change](testing.md).*

The suite tests pure logic with `node --test` and checks everything else by
eye in a browser, and the coverage total is low because the report counts
the browser half too.

## The pure and glue split

Almost every module is either pure logic, which takes its inputs as
arguments (including the random number generator and the current time) and
returns new values, or DOM glue, which builds elements, mounts them, and
wires events.

Pure modules get unit tests. Each `tests/*.test.js` file pairs with one
`src/**/*.js` module, and the tests call the functions and classes directly
with an injected random number generator or plain fixture data. They build
no DOM, no canvas, and no mock of a browser API.

Glue modules get a browser instead, because a mock of the DOM proves only
that the code called the functions the mock expected, not that a GM can see
the panel or click the button. The map, the panels, and the dialogs are
checked by looking at them.

The same split leaves the project with no test framework and no browser
polyfill in its dependencies, because nothing in the suite needs one.

## The coverage total

The coverage report counts only the files that a test loaded. A module that
nothing imports does not appear at 0 percent but is missing from the table
completely, so a naive total is an average over the tested files alone.

`tests/moduleLoad.test.js` closes that gap by importing every file under
`src/` except `main.js`, so every module has a row and the total covers the
whole tree. That test doubles as a load check, because a renamed export or
a circular import in a file with no test of its own fails there.

Because every file has a row, the total sits far below the per-file numbers
of the pure modules. That low total is accurate, and these rows pull it
down:

| What | Why it scores low |
| --- | --- |
| `src/ui/*` panels, dialogs, and widgets | They build and mount elements. A DOM-less runner can call almost none of it |
| `src/app/*Wiring.js` | Each one mounts panels and registers handlers against a live app. The per-feature logic that the suites do cover lives in the neighboring `src/app/` modules |
| The canvas renderers: `MapRenderer`, `MapMarkers`, `MapDecorations`, `CanvasText`, `MapExport` | They draw to a 2D context. Only a browser shows what they drew |
| `src/storage/fileIO.js` | Download and upload primitives, which need a browser |
| `src/main.js` | Not loaded at all. It builds the app on load, so it needs a document |

A low number on one of those files is expected, while a low number anywhere
else is work to do.

A high line count on a module that is mostly `el(...)` calls is easy to
misread, because it means a test built the DOM and not that a test looked at
what the DOM built.

The coverage script excludes `tests/**`. Without that flag, the runner
reports the test files beside the modules they exercise, and a test file
runs from top to bottom, so it always scores near 100 percent and raises
the total several points above the real score of the app code.

## Browser-only wrappers

Some modules wrap browser APIs that the Node runner does not have:
`trySaveToLocalStorage`, `loadFromLocalStorage`, `downloadState`, and
`readStateFromFile` in `storage/SaveManager.js`. They cannot get a unit
test, not even with a DOM-less stub.

The project adds no polyfill and no mock dependency for them. It keeps them
as thin wrappers over pure functions that already have tests, which are
`serialize` and `deserialize`, and checks the wrapper itself in a real
browser, where a save-then-load click sequence is an end-to-end check.

The same rule applies inside `src/ui/`. The pure helpers that happen to live
there are tested where they sit: `fitDimensions` and `encodeAttempts` in
`tests/imageField.test.js`, and `clampToViewport` in
`tests/context-menu.test.js`. They are arithmetic, so they need no DOM.

## Preview pages

The preview pages in `tests/` mount the real modules against hand-built
fixtures, without the rest of the app. They exist because the full app is a
poor place to find a rendering fault: a tile that does not abut its neighbor
is obvious in a grid of every tile and hard to see on a map with a party on
it.

A preview page costs maintenance, because it goes stale when a mount
signature changes, and a stale page can mask the error it was built to
show. Keep the pages current, or delete one when its module is gone.

## Faults the suite cannot find

The suite proves rules, not appearance. It cannot tell you that a panel
overflows its column, that a contrast ratio is too low, that a focus ring
disappeared, or that the map draws a line between two tiles. Those faults
reach a GM, and only a browser finds them first.
