# Testing

## Unit tests

Node's built-in test runner, no framework dependency:

```
node --test tests/TilePalette.test.js    # single file — prefer this while iterating
node --test tests/*.test.js              # full suite before committing
```

Each `tests/*.test.js` file pairs with one `src/**/*.js` module. Tests exercise pure functions/classes directly (e.g. `roll(selection, rng)`, `MapNavigator`, `findRegionGroups`) with an injected RNG or plain fixture data — no DOM, no canvas, no mocking of browser APIs.

## Typecheck

```
pnpm --package=typescript dlx tsc --noEmit
```

(Not `pnpx tsc` — with no local TypeScript install, the bare `tsc` binary name resolves to npm's placeholder package, which exits without checking anything.)

Catches JSDoc/type-declaration mismatches in `.js` files against `src/types/*.ts`. Run this after any non-trivial change, not just ones that touch types directly — `checkJs` will flag call-signature mismatches anywhere.

## Lint

```
pnpm --package=eslint dlx eslint .
```

Flat config in `eslint.config.js`, core rules only (no plugin packages). `no-undef` is deliberately off — the typecheck already resolves identifiers with full DOM knowledge; the linter covers what tsc doesn't (unused vars, shadowing, `var`, loose equality, and similar).

## Pre-commit hook

`hooks/pre-commit` runs all three of the above (lint, full test suite, typecheck) and blocks the commit on any failure. Enable once per clone:

```
git config core.hooksPath hooks
```

## Visual verification

Unit tests and the typecheck don't touch the DOM or `<canvas>`, so any change to rendering, layout, or interaction needs a manual check in a browser. Convention used so far:

1. Serve the project root (e.g. `pnpx http-server -p 8934`) and use Playwright's browser tools against `http://localhost:8934/...` — do not start a second server if one is already running.
2. Manual preview pages live in `tests/` alongside the automated suite but are excluded from it by the `.test.js` naming convention (e.g. `tests/tile-preview.html`, `tests/map-canvas-preview.html`, `tests/ui-panels-preview.html`, `tests/save-manager-preview.html`). They build a small hand-constructed scenario (a palette, a tile grid, a couple of hierarchy levels, a sample character) and mount the real modules exactly as `main.js` would.
3. Check the browser console for errors (a 404 on an asset path is easy to miss otherwise) in addition to taking a screenshot.
4. For interaction (clicks, drag, wheel), dispatch synthetic `PointerEvent`/`WheelEvent`s via `browser_evaluate` when a plain click isn't precise enough (e.g. clicking a specific tile inside a canvas rather than the canvas element as a whole, or a specific button among several with the same tag).

Keep preview pages up to date as the modules they demo change shape — an out-of-date preview page will silently mask a real bug next time someone reaches for it.

## Browser-only APIs (localStorage, Blob, FileReader)

Some modules (`storage/SaveManager.js`'s `saveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile`) wrap browser APIs that don't exist in Node's test runner, so they can't be unit tested at all — not even with a DOM-less stub. Rather than pulling in a polyfill or mocking dependency, treat these the same as canvas rendering: keep them as thin wrappers around already-unit-tested pure functions (`serialize`/`deserialize`), and verify the wrapper itself in a real browser via Playwright (a real Chromium instance has working `localStorage`, so a save-then-load click sequence is a legitimate end-to-end check, not just a visual one).
