# Testing

## Unit tests

The built-in test runner of Node runs the tests. The project uses no test framework as a dependency.

```
node --test tests/TilePalette.test.js    # single file — prefer this while iterating
node --test tests/*.test.js              # full suite before committing
```

Each `tests/*.test.js` file pairs with one `src/**/*.js` module. The tests call pure functions and classes directly, for example `roll(selection, rng)`, `MapNavigator`, and `findRegionGroups`. The tests use an injected random number generator or plain fixture data. The tests use no DOM, no canvas, and no mock of a browser API.

## Coverage

```
pnpm coverage
```

Node itself produces the coverage report, with one row for each file plus a total. The script passes `--test-coverage-exclude='tests/**'`. Without this flag, the runner also reports the test files next to the modules the tests exercise. A test file runs from top to bottom, so it always scores near 100 percent. If the test files stay in the report, they raise the total several points above the real score of the app code.

The report counts only files that a test loaded. A module that nothing imports does not show up at 0 percent. It is missing from the table completely, and the total is then an average over the tested files alone. `tests/moduleLoad.test.js` closes that gap: it imports every file under `src/` except `main.js`, so every module has a row and the total covers the whole tree. That test doubles as a load check. A renamed export or a circular import in a file with no test of its own fails there.

Because of this, the total sits far below the per-file numbers of the pure modules, and that is the honest figure. The rows that pull it down are the ones the suite cannot reach:

| What | Why it scores low |
| --- | --- |
| `src/ui/*` panels, dialogs, and widgets | They build and mount elements. A DOM-less runner can call almost none of it. |
| `src/app/*Wiring.js` | Each one mounts panels and registers handlers against a live app. The per-feature logic that suites do cover was pulled out into the neighboring `src/app/` modules. |
| The canvas renderers: `MapRenderer`, `MapMarkers`, `MapDecorations`, `CanvasText`, `MapExport` | They draw to a 2D context. What they draw is a visual question. |
| `src/storage/fileIO.js` | Download and upload primitives, which need a browser. |
| `src/main.js` | Not loaded at all. It builds the app when it loads, so it needs a document. |

Every one of those is checked in a browser instead, by the procedure below. Treat a low number on one of them as expected, and a low number anywhere else as work to do. Watch for the reverse case too: a high line count on a module that is mostly `el(...)` calls means a test built the DOM, not that a test checked what the DOM built.

## Typecheck

```
pnpm --package=typescript dlx tsc --noEmit
```

(Not `pnpx tsc`. There is no local install of TypeScript. Because of this, the bare `tsc` command name resolves to the placeholder package of npm. This package exits immediately. It does not type-check the code.)

The typecheck finds mismatches between the JSDoc type declarations in `.js` files and `src/types/*.ts`. Run the typecheck after any change that is not trivial. Run it even when the change does not touch types directly. `checkJs` flags a call-signature mismatch anywhere in the code.

## Lint

```
pnpm --package=eslint dlx eslint .
```

The flat config lives in `eslint.config.js`. It uses only core rules, with no plugin packages. `no-undef` is off on purpose. The typecheck already resolves identifiers with full knowledge of the DOM. The linter covers what tsc does not cover: unused variables, shadowing, `var`, and loose equality.

## Pre-commit hook

`hooks/pre-commit` runs the lint, the full test suite, and the typecheck. It blocks the commit if any of the three fails.

Enable the hook one time for each clone:

```
git config core.hooksPath hooks
```

## Visual verification

The unit tests and the typecheck do not touch the DOM or the `<canvas>` element. Because of this, a change to rendering, to layout, or to interaction needs a manual check in a browser. Follow this procedure:

1. Serve the project root, for example with `pnpx http-server -p 8934`. Use the browser tools of Playwright against `http://localhost:8934/...`. If a server is already running, do not start a second one.
2. Manual preview pages live in `tests/`, next to the automated suite. The `.test.js` naming convention excludes them from the automated suite, for example `tests/tile-preview.html`, `tests/map-canvas-preview.html`, `tests/ui-panels-preview.html`, and `tests/save-manager-preview.html`. Each page builds a small scenario by hand: a palette, a tile grid, a couple of hierarchy levels, and a sample character. Each page mounts the real modules in the same way as `main.js`.
3. Take a screenshot of the page. Also read the browser console for errors. A 404 error on an asset path is easy to miss without this step.
4. For interaction such as a click, a drag, or a wheel event: if a plain click is not precise enough, dispatch a synthetic `PointerEvent` or `WheelEvent` through `browser_evaluate`. For example, click a specific tile inside a canvas instead of the whole canvas element. Another example is a click on one button among several buttons with the same tag.

Keep the preview pages current as the modules they show change shape. An old preview page can hide a real error the next time someone uses it.

## Keyboard focus across a panel rebuild

Several panels rebuild by clearing their root element. `src/ui/focusMemory.js` puts the keyboard position back after the clear, and `src/ui/listPanel.js` calls it for every panel it builds. Its unit tests run against stub nodes, so they prove the matching rule and not the browser behavior. Check the browser behavior when you change a panel's controls or their labels.

The check needs a control that survives the rebuild. Focus one, for example the damage amount field on an encounter row, then trigger the rebuild and read `document.activeElement`. A cross-tab save adoption is the easiest trigger:

```js
const key = 'campaign-builder:save';
window.dispatchEvent(
  new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }),
);
```

Two things make this check report a false result. Focusing a control that is hidden, for example one on an unselected tab, does nothing at all, so compare `document.activeElement` against the control before you trigger the rebuild. Reading the old element afterwards also proves nothing, because the rebuilt control is a different element with the same signature. Compare the accessible names instead.

The `rehydrate-focus` scenario of `bench/app-bench.js` runs the same check over ten adoptions and reports `focusKept`.

## Browser-only APIs (localStorage, Blob, FileReader)

Some modules wrap browser APIs that do not exist in the test runner of Node. Examples are `trySaveToLocalStorage`, `loadFromLocalStorage`, `downloadState`, and `readStateFromFile` in `storage/SaveManager.js`'s exports. These modules cannot get a unit test at all, not even with a DOM-less stub.

The project does not add a polyfill or a mock dependency for this. Instead, treat these modules the same as canvas rendering. Keep them as thin wrappers around pure functions that already have a unit test: `serialize` and `deserialize`. Make sure that the wrapper itself works in a real browser through Playwright. A real Chromium instance has working `localStorage`. Because of this, a save-then-load click sequence is a real end-to-end check, not only a visual one.
