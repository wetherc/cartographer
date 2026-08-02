# Testing strategy

*Explanation. For the commands and the procedures, read
[Testing a change](testing.md).*

The suite here tests pure logic with `node --test` and checks everything
else by eye in a browser. This document says why, and what that costs.

## One split decides everything

Almost every module is either pure logic or DOM glue. A pure module takes
its inputs as arguments, including the random number generator and the
current time, and returns new values. A glue module builds elements, mounts
them, and wires events.

Pure modules get unit tests. Each `tests/*.test.js` file pairs with one
`src/**/*.js` module. The tests call the functions and classes directly,
with an injected random number generator or plain fixture data. They build
no DOM, no canvas, and no mock of a browser API.

Glue modules get a browser instead. This is a deliberate trade. A mock of
the DOM proves that the code called the functions the mock expected, not
that a GM can see the panel or click the button. The map, the panels, and
the dialogs are visual questions, so they get a visual answer.

The split is also why the project has no test framework and no browser
polyfill in its dependencies. Nothing in the suite needs one.

## Why the coverage total is low

The coverage report counts only the files that a test loaded. A module that
nothing imports does not show up at 0 percent. It is missing from the table
completely, and the total is then an average over the tested files alone.

`tests/moduleLoad.test.js` closes that gap. It imports every file under
`src/` except `main.js`, so every module has a row and the total covers the
whole tree. That test doubles as a load check. A renamed export or a
circular import in a file with no test of its own fails there.

Because every file has a row, the total sits far below the per-file numbers
of the pure modules. That is the true figure. These rows pull it down:

| What | Why it scores low |
| --- | --- |
| `src/ui/*` panels, dialogs, and widgets | They build and mount elements. A DOM-less runner can call almost none of it |
| `src/app/*Wiring.js` | Each one mounts panels and registers handlers against a live app. The per-feature logic that the suites do cover was pulled out into the neighboring `src/app/` modules |
| The canvas renderers: `MapRenderer`, `MapMarkers`, `MapDecorations`, `CanvasText`, `MapExport` | They draw to a 2D context. What they draw is a visual question |
| `src/storage/fileIO.js` | Download and upload primitives, which need a browser |
| `src/main.js` | Not loaded at all. It builds the app on load, so it needs a document |

A low number on one of those files is expected. A low number anywhere else
is work to do.

The reverse case is easier to miss. A high line count on a module that is
mostly `el(...)` calls means a test built the DOM. It does not mean a test
looked at what the DOM built.

The coverage script excludes `tests/**`. Without that flag, the runner
reports the test files beside the modules they exercise. A test file runs
from top to bottom, so it always scores near 100 percent, and it raises the
total several points above the real score of the app code.

## Browser-only wrappers stay thin

Some modules wrap browser APIs that the Node runner does not have:
`trySaveToLocalStorage`, `loadFromLocalStorage`, `downloadState`, and
`readStateFromFile` in `storage/SaveManager.js`. They cannot get a unit
test, not even with a DOM-less stub.

The project adds no polyfill and no mock dependency for them. It keeps them
as thin wrappers over pure functions that already have tests, which are
`serialize` and `deserialize`. The wrapper itself is checked in a real
browser, where a save-then-load click sequence is an end-to-end check.

The same rule holds inside `src/ui/`. The pure helpers that happen to live
there are tested where they sit: `fitDimensions` and `encodeAttempts` in
`tests/imageField.test.js`, and `clampToViewport` in
`tests/context-menu.test.js`. They are arithmetic, so the DOM around them
is beside the point.

## What the preview pages are for

The preview pages in `tests/` mount the real modules against hand-built
fixtures, without the rest of the app. They exist because the full app is a
poor place to find a rendering fault. A tile that does not abut its
neighbor is obvious in a grid of every tile, and hard to see on a map with
a party on it.

A preview page carries a maintenance cost. It goes stale when a mount
signature changes, and a stale page can mask the very error it was built to
show. Keep the pages current, or delete one when its module no longer
exists.

## What this strategy does not cover

The suite proves rules, not appearance. It cannot tell you that a panel
overflows its column, that a contrast ratio is too low, that a focus ring
disappeared, or that the map draws a seam. Those faults reach a GM, and
only a browser finds them first.
