# Your first code change

*Tutorial. Follow the steps in order. You change one line, add one test,
and undo both at the end, so nothing stays in the repository.*

In this tutorial, you add a status condition to the built-in list, prove it
with a test, and see it in the browser. On the way, you run the four checks
for every change: the unit tests, the linter, the typecheck, and a look at
the page. The whole loop takes about fifteen minutes.

## Prerequisites

- A clone of the repository.
- Node. The suite runs on Node 22.
- `pnpm` 11.17 or later. The `devEngines` field in `package.json` asks for
  this version, and `pnpm` downloads it if your copy is older.

## 1. Install the tools and start the app

1. Install the development tools:

   ```bash
   pnpm install
   ```

2. Start the dev server:

   ```bash
   pnpm run dev
   ```

   The server bundles the sources into `dist/` and prints its address:

   ```
   [watch] Server listening on http://127.0.0.1:8080
   ```

3. Open `http://127.0.0.1:8080` in a browser.

The server rebuilds the bundle each time you save a source file. It does
not reload the page, so reload the page yourself after each change.

Leave this terminal open, and use a second terminal for the commands
below. If the server stops with an "address already in use" error, another
process has port 8080. Stop that process and start the server again.

## 2. Find the module

The status conditions live in one pure module:

```
src/entities/Conditions.js
```

Open the file. The `CONDITIONS` array is the pick-list that the Add
condition dialog offers. Each name is a plain string.

This module is *pure logic*. It takes values and returns new values, and it
never touches the DOM. Almost every rule in the app lives in a module like
this one, and the DOM code lives in `src/ui/`.
[Architecture](architecture.md) explains the split.

## 3. Make the change

Add `'Cursed'` to the array, in alphabetical order after `CONCENTRATING`:

```js
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  CONCENTRATING,
  'Cursed',
  'Deafened',
  // ... the rest
];
```

`CONCENTRATING` is a constant for the string `'Concentrating'`, so
`'Cursed'` comes after it.

## 4. Write a test

The tests live in `tests/`. The tests for `src/entities/Conditions.js` are
in `tests/Conditions.test.js`.

1. Open `tests/Conditions.test.js`.
2. Find the import from `'../src/entities/Conditions.js'` at the top of the
   file. Add `CONDITIONS,` as the first name in its list, and keep the other
   names:

   ```js
   import {
     CONDITIONS,
     createCondition,
     // ... the other names that the file imports
   } from '../src/entities/Conditions.js';
   ```

   Do not replace the whole import with this snippet. The existing tests
   use the other names, and they fail if you remove them.

3. Add this test at the end of the file:

   ```js
   test('the pick-list offers Cursed', () => {
     assert.ok(CONDITIONS.includes('Cursed'));
   });
   ```

## 5. Run the test

Run the one test file. One file runs in well under a second, and the whole
suite takes several seconds.

```bash
node --test tests/Conditions.test.js
```

The summary at the end lists the count of tests, passes, and failures. The
count of tests is one more than before your change, the pass count is the
same as the test count, and the fail count is `0`:

```
# tests <count>
# pass <count>
# fail 0
```

To see the count before your change, run the same command with
`git stash` first and `git stash pop` after.

If the test fails, read the first assertion in the output. It names the
file and the line that failed.

## 6. Run the other checks

Run each of these commands before a commit:

```bash
pnpm test
pnpm run lint
pnpm run typecheck
```

| Command | What it checks | A clean run ends with |
| --- | --- | --- |
| `pnpm test` | Every test file under `tests/` | A line such as `<count> tests  <count> passed  0 failed`, with your test included |
| `pnpm run lint` | Style and logic rules, such as unused variables and loose equality | No output after the `eslint .` line |
| `pnpm run typecheck` | The JSDoc types in the `.js` files against the declarations in `src/types/` | No output after the `tsc --noEmit` line |

The test count changes as the project grows, so this page does not give a
total. A failure count other than `0` blocks the commit.

The pre-commit hook runs the same three checks. To turn the hook on for
this clone, run this command once:

```bash
git config core.hooksPath hooks
```

## 7. See the change in the browser

The unit tests build no DOM, so a change that reaches the UI also needs a
look in the browser.

1. Reload the browser tab with the app.
2. Click **Load example** in the header. If the current campaign is not
   blank, a confirmation dialog opens. Click **Load example** in it.
3. Make sure that **Play** is selected in the mode switch.
4. Open the **Session** tab in the sidebar, and find the **Encounters**
   panel.
5. Open the **Nearby encounters** tab. Each line is one group of foes, such
   as "Gray Wolf x4". If the tab reads "No encounters nearby.", click a tile
   a few steps from the party marker, and look again.
6. Click a foe line to open it. The full row of each foe in the group shows
   below the line.
7. On a foe row, click the **Condition** button. The Add condition dialog
   opens.
8. Open the **Condition** dropdown. `Cursed` is in the list.

If the row already has condition chips, the button is a **+** icon with
the label "Add condition".

Keep the browser console open while you check. A missing asset shows as a
404 error there and nowhere else.

## 8. Undo the change

1. Remove `'Cursed'` from `src/entities/Conditions.js`.
2. Remove the test and the `CONDITIONS` import from
   `tests/Conditions.test.js`.
3. Run `node --test tests/Conditions.test.js` again. The test count is
   one less than in step 5, and the fail count is `0`.
4. Run `git status`. It lists no changed files.
5. Stop the dev server with Ctrl+C.

## Next steps

- Read [Testing a change](testing.md) for the preview pages and the other
  browser checks.
- Read [Architecture](architecture.md) to find where the other subsystems
  live.
