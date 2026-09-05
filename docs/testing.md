# Testing a change

*How-to guide. Each section is one task. To learn why the suite is built
this way, and what it cannot reach, read
[Testing strategy](testing-strategy.md).*

## Run the unit tests

While you work on one module, run its file alone:

```bash
node --test tests/TilePalette.test.js
```

Before a commit, run the whole suite:

```bash
pnpm test
```

Node runs the tests with its built-in runner, so the project has no test
framework.

`pnpm test` prints a summary: the area under `src/`, then one line for each
test file in it, with its test count and run time. A passing file lists no
test names. A failing file lists its tests, marks the ones that failed, and
prints the error under each. Every failure appears again in a `Failures`
recap at the bottom, and the last line gives the totals. `TEST_VERBOSE=1`
lists the name of every test, and a test that takes 100 ms or more shows
its time.

Anything a test file writes to stdout or stderr is captured and counted on
the line of that file, as `11 printed lines`, because several suites drive a
path that warns on purpose, such as the fallback for an unreadable save in
`Campaigns.test.js`, and uncaptured warnings print above the tree and read
as loose errors. A file that fails shows the text of what it printed. Any
other file shows it only with `TEST_OUTPUT=1`.

These switches change the output:

```bash
TEST_VERBOSE=1 pnpm test  # list every test, not only the failures
TEST_OUTPUT=1 pnpm test   # also print what each file wrote
pnpm run test:flat        # the default TAP output of Node
```

`hooks/pre-commit` runs the suite through the same reporter, so a clean
commit prints one line per module.

## Keep the vocabulary tests passing

`tests/uiVocabulary.test.js` reads `src/` and `styles/` as text and checks
the UI rules that no linter states: a builder owns its classes, a shared
module names no feature's vocabulary, `innerHTML` is only ever cleared, and
`style.css` imports every sheet. It runs with the rest of the suite, and a
failure names the file, the line, and the call to make instead.

Adding a builder with a class of its own means adding its block to the
owners table in that file. See
[UI components](architecture/ui-components.md) for the rules themselves.

## Run the typecheck

```bash
pnpm run typecheck
```

This compares the JSDoc types in the `.js` files against the declarations
in `src/types/*.ts`. Run it after any change that is not trivial, even when
the change does not touch a type, because `checkJs` reports a
call-signature mismatch anywhere in the tree.

## Run the linter

```bash
pnpm run lint
```

The flat config lives in `eslint.config.js` and uses core rules only.
`no-undef` is off, because the typecheck already resolves identifiers with
full knowledge of the DOM. The linter covers unused variables, shadowing,
`var`, and loose equality.

## Enable the pre-commit hook

Run this command once for each clone:

```bash
git config core.hooksPath hooks
```

`hooks/pre-commit` formats the staged files, regenerates the developer
guide when the source tree changed, and then runs the linter, the full
suite, and the typecheck. It blocks the commit if any of the three fails.

When a commit touches `src/`, the hook also runs `pnpm bench:commit`. That
check times the size-sensitive save, diff, and reconcile paths at a large
world size and compares each one against a budget. It never blocks a
commit. A path over its budget prints a loud warning instead, so you see a
performance regression at the commit that caused it. `bench/README.md`
describes the budgets.

## Read the coverage report

```bash
pnpm coverage
```

Node measures the coverage, and the same reporter prints it: one row per
file, grouped by `src/` area, with the line, branch, and function
percentages and the uncovered line ranges. A total row closes the table.

The total sits far below the per-file numbers of the pure modules, which is
expected. [Testing strategy](testing-strategy.md) lists the rows that pull
it down, and the rows where a low number is work to do.

## Check a change in the browser

The unit tests build no DOM and no canvas, so a change to rendering, to
layout, or to interaction needs an eye on it.

1. Start the app with `pnpm run dev`, and open the address it prints. If a
   server is already running, do not start a second one.
2. Drive the page with the browser tools of Playwright.
3. Take a screenshot of the result.
4. Read the browser console. A 404 on an asset path shows up nowhere else.
5. Check both themes with the theme switch in the header.

For an interaction that a plain click cannot reach, dispatch a synthetic
`PointerEvent` or `WheelEvent` through `browser_evaluate`. Use this to
click one tile inside a canvas, or one button among several with the same
tag.

## Check a module against a preview page

The preview pages live in `tests/`, beside the automated suite. The
`.test.js` naming convention keeps them out of the suite.

| Page | What it mounts |
| --- | --- |
| `tests/tile-preview.html` | The tiles of the palette, side by side |
| `tests/map-canvas-preview.html` | The map canvas over a hand-built grid |
| `tests/ui-panels-preview.html` | The character sheet, inventory, and encounter panels |
| `tests/save-manager-preview.html` | The save and load path |
| `docs/gallery.html` | Every shared builder in `src/ui/`, with its call and its classes |

Each page builds a small scenario by hand and mounts the real modules the
way `main.js` does. These pages read `src/` and `assets/` directly, so
serve the project root to open one:

```bash
python3 -m http.server 8934
```

Then open `http://localhost:8934/tests/tile-preview.html`. The gallery is
also served by `pnpm run dev`, at `http://localhost:8080/docs/gallery.html`,
because the dev server links the source directories into `dist/`.

Keep a preview page current when the modules it mounts change their
interface, because a stale page can hide a real error the next time someone
opens it.

The gallery is the page to check after a change to a shared builder, since
it draws every one of them on one screen in both themes. Its stories live in
`docs/gallery/sections/`, and a story's code snippet is read from the source
of its own render function, so a changed call updates the snippet with it.

## Check keyboard focus across a panel rebuild

Several panels rebuild by clearing their root element.
`src/ui/focusMemory.js` puts the keyboard position back, and
`src/ui/listPanel.js` calls it for every panel it builds. Its unit tests
run against stub nodes, so they prove the matching rule and not the browser
behavior. Do this check when you change the controls of a panel or their
labels.

1. Focus a control that the rebuild keeps, for example the damage amount
   field on an encounter row.
2. Compare `document.activeElement` against that control. A hidden control,
   for example one on an unselected tab, takes no focus at all.
3. Trigger a rebuild. A cross-tab save adoption is the easiest trigger:

   ```js
   const key = 'campaign-builder:save';
   window.dispatchEvent(
     new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }),
   );
   ```

4. Compare the accessible names before and after rather than the elements,
   because the rebuilt control is a different element with the same
   signature.

The `rehydrate-focus` scenario of `bench/app-bench.js` runs the same check
over ten adoptions and reports `focusKept`.

## Check a browser-only wrapper

Some modules wrap browser APIs that the Node runner does not have, for
example `trySaveToLocalStorage`, `loadFromLocalStorage`, `downloadState`,
and `readStateFromFile` in `storage/SaveManager.js`. These have no unit
test at all, so check them in a real browser instead. A Chromium instance
has working `localStorage`, so a save-then-load click sequence is an
end-to-end check and not only a visual one.
