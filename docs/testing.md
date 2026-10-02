---
---
# Testing a change

*How-to guide. Each section is one task. To learn why the suite works this
way, and what it cannot reach, read [Testing strategy](testing-strategy.md).*

Every change passes three automated checks and one manual check. The unit
tests, the linter, and the typecheck run in Node. The browser check covers
rendering, layout, and interaction, which no Node test can see.

Before you start, run `pnpm install` once in your clone. Each check runs
the tool versions that the lockfile pins.

## Run the unit tests

Node runs the tests with its built-in runner, so the project has no test
framework.

1. While you work on one module, run its test file alone:

   ```bash
   node --test tests/TilePalette.test.js
   ```

2. Before a commit, run the whole suite:

   ```bash
   pnpm test
   ```

`pnpm test` prints one block for each area under `src/`. Each block lists
one line for each test file, with its test count and run time:

```
map (75 modules, 930 tests, all passing)
  . Autotile 6 tests, 7ms
  . BuildingLayouts 4 tests, 8ms
  . Campaigns 14 tests, 160ms, 7 printed lines
```

The last line gives the totals:

```
3464 tests  3464 passed  0 failed  5.66s
```

A passing file lists no test names. A failing file lists its tests, marks
each failed test, and prints the error under it. Each failure appears again
in a `Failures` list at the bottom of the output.

### Captured output

The reporter captures what a test file writes to stdout or stderr. It
counts those lines on the line of that file, as in `7 printed lines` above.
Some suites warn on purpose. For example, `Campaigns.test.js` loads an
unreadable save to test the fallback. Without the capture, that warning
prints above the summary and looks like an error.

A failing file always shows what it printed. A passing file shows it only
when you set `TEST_OUTPUT=1`.

### Output switches

| Command | Output |
| --- | --- |
| `pnpm test` | One line for each test file, and the tests of each failing file |
| `TEST_VERBOSE=1 pnpm test` | The name of every test. A test that takes 100 ms or more also shows its time |
| `TEST_OUTPUT=1 pnpm test` | The default output, plus what each file printed |
| `pnpm run test:flat` | The default TAP output of Node, with no summary |

`hooks/pre-commit` runs the suite through the same reporter.

## Keep the vocabulary tests passing

`tests/uiVocabulary.test.js` reads `src/` and `styles/` as text. It checks
the UI rules that no lint rule can state:

- A builder owns its CSS classes, and no other file types those class
  names by hand.
- A link is built only through `src/ui/buttons.js`.
- A shared module names no class from the vocabulary of one feature.
- Code assigns `innerHTML` only to clear an element, never to insert
  markup.
- `style.css` imports every sheet under `styles/`, and imports no missing
  sheet.

The test runs with the rest of the suite. A failure names the file, the
line, and the call to use instead.

If you add a builder with a class of its own, add its block to the
`OWNERS` table in that test file. See
[UI components](architecture/ui-components.md) for the rules themselves.

## Run the typecheck

```bash
pnpm run typecheck
```

The typecheck compares the JSDoc types in the `.js` files against the
declarations in `src/types/*.ts`. A clean run prints nothing after the
`tsc --noEmit` line.

Run it after each change that is not trivial, even when the change touches
no type. `checkJs` reports a call-signature mismatch anywhere in the tree,
so a changed parameter can fail in a file you did not edit.

## Run the linter

```bash
pnpm run lint
```

The flat config in `eslint.config.js` uses core ESLint rules only. It
lints `src/`, `tests/`, `bench/`, and `docs/gallery/`. The rules catch
unused variables, shadowed names, `var`, `let` where `const` works, loose
equality, string concatenation where a template literal works, and
`console.log`. `console.warn` and `console.error` are allowed.

The config turns off `no-undef`. The typecheck already resolves each
identifier with full knowledge of the DOM, so `no-undef` would only add
false reports for browser globals.

## Enable the pre-commit hook

Run this command once for each clone:

```bash
git config core.hooksPath hooks
```

On each commit, `hooks/pre-commit` does these steps in order:

1. It formats the staged `.js`, `.ts`, and `.css` files with Prettier, and
   stages the result.
2. It regenerates `docs/dev-guide.html` when the commit touches `src/`,
   `tests/`, `package.json`, or the guide scripts.
3. It runs the linter, the full test suite, and the typecheck. If any of
   the three fails, the hook stops the commit.
4. It runs `node bench/commit-bench.js` when the commit touches `src/`.

The formatter re-stages each whole file. If a file is partly staged, the
hook also stages its unstaged changes. Commit or set aside those changes
first if you want to keep them out of the commit.

The benchmark step times the size-sensitive pure paths at a large world
size, such as save, load, diff, reconcile, and fog reveal. It compares each
median against a budget in `bench/budgets.json`:

```
bench: +50 large regions, 300 creatures
  serialize        1.4 ms   budget   40 ms
  deserialize     20.7 ms   budget   25 ms
  reconcile       25.8 ms   budget   80 ms
```

A path over its budget prints a warning, so you see a performance
regression at the commit that caused it. The benchmark never stops a
commit. Run it by hand with `pnpm bench:commit`. `bench/README.md`
describes the budgets.

## Read the coverage report

```bash
pnpm coverage
```

Node measures the coverage, and the same reporter prints it after the test
summary. The table has one row for each file, grouped by the area under
`src/`. Each row gives the line, branch, and function percentages, then the
ranges of uncovered lines:

```
Coverage (line / branch / function)
  map
    MapRenderer.js                45.0% 100.0%   7.1%  82-97, 106-107, ...
  all files                       77.9%  98.4%  89.6%
```

The total is lower than the numbers of the pure modules, most of which
reach 100 percent. [Testing strategy](testing-strategy.md) lists the files
where a low number is expected. A low number on any other file shows
missing tests.

## Check a change in the browser

The unit tests build no DOM and no canvas. A change to rendering, layout,
or interaction needs a check in a real browser.

1. Start the app with `pnpm run dev`, and open `http://127.0.0.1:8080`.
   If a dev server already runs, use it and do not start a second one.
2. Drive the page with the Playwright browser tools.
3. Take a screenshot of the result.
4. Read the browser console. A 404 error on an asset path shows only
   there.
5. Switch between the light and dark themes with the theme switch in the
   header, and check the result in both.
6. Stop the dev server when you finish.

To reach an element that a plain click cannot target, dispatch a synthetic
`PointerEvent` or `WheelEvent` through `browser_evaluate`. Use this method
to click one tile inside the canvas, or one of several buttons with the
same label.

## Check a module against a preview page

A preview page mounts the real modules over a small, hand-built scenario,
the way `main.js` mounts them. Use a preview page to see one module
without the rest of the app.

| Page | What it mounts |
| --- | --- |
| `tests/tile-preview.html` | The tile art of each family, side by side, so every join is visible |
| `tests/map-canvas-preview.html` | The map canvas and the breadcrumb over a hand-built grid |
| `tests/ui-panels-preview.html` | The character sheet, the inventory panel, and the encounter panel |
| `tests/save-manager-preview.html` | The save and load path |
| `docs/gallery.html` | Every shared builder in `src/ui/`, with its call and its classes |

The pages in `tests/` do not end in `.test.js`, so the test runner skips
them. They read `src/` and `assets/` directly, so serve the project root:

1. From the project root, start a static server:

   ```bash
   python3 -m http.server 8934
   ```

2. Open `http://localhost:8934/tests/tile-preview.html`.
3. Stop the server with Ctrl+C when you finish.

The dev server also serves the gallery, at
`http://127.0.0.1:8080/docs/gallery.html`. `pnpm run dev` links `docs/`,
`src/`, `styles/`, and `fonts/` into `dist/`, so the gallery loads the
source modules and not the bundle.

When a module that a preview page mounts changes its interface, update the
page in the same change. A stale page can fail for its own reasons and hide
a real error.

After a change to a shared builder, check the gallery in both themes,
because it draws every builder on one screen. The stories live in
`docs/gallery/sections/`. Each story reads its code snippet from the source
of its own render function, so the snippet changes when the call changes.

## Check keyboard focus across a panel rebuild

Several panels rebuild by clearing their root element and building it
again. `src/ui/focusMemory.js` puts the keyboard focus back on the matching
control, and `src/ui/listPanel.js` calls it for every panel that it builds.
The unit tests of `focusMemory.js` use stub nodes, so they prove the
matching rule and not the browser behavior.

Do this check when you change the controls of a panel or their labels:

1. Focus a control that the rebuild keeps, for example the damage amount
   field on an encounter row.
2. Confirm that `document.activeElement` is that control. A hidden control,
   such as one on an unselected tab, cannot take focus.
3. Record the accessible name of the focused control.
4. Trigger a rebuild. A cross-tab save adoption is the most direct trigger:

   ```js
   const key = 'campaign-builder:save';
   window.dispatchEvent(
     new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }),
   );
   ```

5. Compare the accessible name of `document.activeElement` with the name
   from step 3. The names match when focus came back.

Compare the names and not the elements. The rebuild creates a new element
with the same name and role.

The `rehydrate-focus` scenario in `bench/scenarios.js` runs the same check
over ten adoptions and reports `focusKept`. The benchmark needs Chrome. Run
the one scenario with this command:

```bash
pnpm bench -- --only=rehydrate-focus
```

## Check a browser-only wrapper

Some modules wrap browser APIs that Node does not have. In
`src/storage/SaveManager.js`, these are `trySaveToLocalStorage`,
`loadFromLocalStorage`, `downloadState`, and `readStateFromFile`. They have
no unit tests, so check them in a real browser. Chromium has a working
`localStorage`, so a save followed by a load is an end-to-end check.

`src/storage/IndexedDbAssets.js` is also a browser-only wrapper. The unit
tests of `AssetMirror.js` run over the in-memory store in
`src/storage/AssetBackend.js`, so check the IndexedDB path by hand:

1. Attach an image to a handout, reveal the handout, and click **Save**.
   In the Application panel of the developer tools, the image payload is
   under IndexedDB, in the `campaign-builder` database. `localStorage` has
   no `campaign-builder:assets` key.
2. Reload the page. The image shows.
3. Open a second tab. In the first tab, attach another image and save. The
   second tab shows the new image without a reload.
4. Copy the payloads into a `campaign-builder:assets` key in
   `localStorage`, delete the database, and reload. The images show, the
   database contains the payloads again, and the key is gone.
5. Add an init script that makes `IDBFactory.prototype.open` throw, then
   attach an image. The payload goes into the `campaign-builder:assets` key
   in `localStorage`, and the image shows after a reload.
