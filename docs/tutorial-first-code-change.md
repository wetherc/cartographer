# Tutorial: your first code change

*Tutorial. Follow the steps in order. You will change one line, add one
test, and undo the change at the end. Nothing here stays in the repository.*

In about fifteen minutes you will start the app, add a status condition to
the built-in list, prove it with a test, and see it in the browser. On the
way you will meet the four checks that every change here passes.

You need Node, `pnpm`, and a clone of the repository.

## 1. Install the tools and start the app

```bash
pnpm install
pnpm run dev
```

The dev server bundles the sources into `dist/` and serves them. Open the
address it prints, which is `http://localhost:8080` by default. The server
rebuilds each time you save a source file.

Leave this terminal running, and use a second terminal for the commands
below.

## 2. Find the module

The status conditions live in one pure module:

```
src/entities/Conditions.js
```

Open it. The `CONDITIONS` array is the pick-list that the UI offers. Each
name is a plain string, because a GM can type a condition that is not in
the list.

This module is *pure logic*: it takes values and returns new values, and it
never touches the DOM. Almost every rule in the app lives in a module like
this one, while the DOM half sits in `src/ui/`.
[Architecture](architecture.md) explains the split.

## 3. Make the change

Add one entry to the array, in alphabetical order:

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

## 4. Write a test

The tests sit in `tests/`, one file per module. Open
`tests/Conditions.test.js` and add this test at the end:

```js
test('the pick-list offers Cursed', () => {
  assert.ok(CONDITIONS.includes('Cursed'));
});
```

Then add `CONDITIONS` to the import at the top of the file:

```js
import {
  CONDITIONS,
  createCondition,
  addCondition,
  removeCondition,
  tickConditions,
} from '../src/entities/Conditions.js';
```

## 5. Run the test

Run the one file while you work, because it is much faster than the whole
suite:

```bash
node --test tests/Conditions.test.js
```

The run reports one more passing test than before. If it fails, read the
first assertion in the output, which names the line that failed.

## 6. Run the other checks

Run all three before any commit:

```bash
pnpm test
pnpm run lint
pnpm run typecheck
```

`pnpm test` runs every suite. `pnpm run lint` catches unused variables,
shadowing, `var`, and loose equality. `pnpm run typecheck` compares the
JSDoc types in the `.js` files against the declarations in `src/types/`.

The pre-commit hook runs the same three commands. To enable it once for
this clone:

```bash
git config core.hooksPath hooks
```

## 7. See the change in the browser

The unit tests never build DOM, so a change that reaches the UI needs an
eye on it.

1. Go back to the browser tab with the app.
2. Click **Load example** in the header, and confirm.
3. Switch to **Play** mode and move the party onto a tile with an
   encounter.
4. Click the **Condition** button on the encounter row. The Add condition
   dialog opens.
5. Open the **Condition** dropdown. `Cursed` is in the list.

Open the browser console as well, because an error there is easy to miss
and a missing asset shows up nowhere else.

## 8. Undo the change

1. Remove `'Cursed'` from `src/entities/Conditions.js`.
2. Remove the test and the `CONDITIONS` import from
   `tests/Conditions.test.js`.
3. Run `node --test tests/Conditions.test.js` again. It passes.

## What next

You have used the whole loop: change a pure module, test it, check the
types and the style, and look at the result. Read
[Testing a change](testing.md) for the rest of the loop, including the
preview pages and the browser checks, and
[Architecture](architecture.md) to see where the other subsystems live.
