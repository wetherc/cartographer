# Benchmarks

The project has four benchmark harnesses. Each one measures a different part
of the app.

- `pnpm bench` drives the real app in Chrome and reports what a tab costs: DOM
  nodes, listeners, heap, layout and script time, long tasks, and a sampled CPU
  profile per scenario.
- `pnpm bench:pure` times the pure modules in Node, with no browser. Generation,
  serialization, fog reveal, and the world tree run here.
- `pnpm bench:scale` times the whole-state paths as the world grows, from the
  example campaign up to two hundred extra generated regions. Its table shows
  which paths grow with the world and where each one crosses the 50 ms line
  that a GM feels as a stall. Run it before and after a change to the save,
  diff, or reconcile paths.
- `pnpm bench:commit` is the fast check that the pre-commit hook runs. It times
  the same whole-state paths at one large world size and compares each median
  against a budget from `budgets.json`. It runs in under a second.

None of them adds a dependency. The browser harness talks the Chrome DevTools
Protocol over the `WebSocket` that Node 22 ships, so there is no Playwright or
Puppeteer install.

## Running the browser harness

```
pnpm bench                          every scenario, headless
pnpm bench -- --headful             the same run in a visible window
pnpm bench -- --only=paint-stroke   one scenario
pnpm bench -- --port=8934           a dev server that is already running
pnpm bench -- --budget=120000       a longer per-scenario cap
```

The harness serves the repository with `python3 -m http.server` when the port is
closed, and it stops only a server that it started. Chrome runs with a
throwaway profile, so your own browser stays closed and every run starts with an
empty localStorage.

Set `CHROME_PATH` when Chrome is not in the usual place for the platform.

## What a run writes

Each run makes one directory under `bench/results/`:

- `summary.md`: the table to read, and the ten hottest functions per scenario.
- `metrics.json`: every reading, for a diff between two runs.
- `<scenario>.cpuprofile`: a sampled profile at 100 microseconds. Open it in the
  DevTools Performance panel for a flame chart. Chrome loads the file through
  the Load button in that panel.

Results are not committed.

## The commit check

The pre-commit hook runs `bench:commit` when a commit touches `src/`. The
check is informational. The table prints on every run. A path over its budget
prints a loud warning, and the commit still goes through. The warning is a
prompt to look at the change before you push it.

The budgets live in `budgets.json`. They sit well above the medians of a
healthy run, so machine speed and background noise do not trip them. A breach
means a code path does more work than before. When a change moves a cost on
purpose,
re-measure with `pnpm bench:commit` and raise the budget in the same commit.

## The scenarios

| Scenario | What it drives |
| --- | --- |
| `boot` | A cold load, up to the first mounted panel |
| `load-example` | Build the example campaign, persist it, reload onto it |
| `paint-stroke` | One authoring stroke of 24 cells |
| `generate-map` | Procedural generation through the Generate dialog |
| `zoom-pan` | Twenty wheel-zoom steps at the canvas center |
| `play-pan` | One right-drag pan across the fog-revealed map in Play mode |
| `panel-tabs` | Thirty sidebar tab switches |
| `rehydrate` | Fifty cross-tab save adoptions |
| `combat-turns` | Start a fight, advance twenty turns, end it |

Order matters. `load-example` reloads onto the example campaign, and the
scenarios after it read that campaign. When `--only` names one of those
scenarios without `load-example`, the runner adds `load-example` in front
and says so. Without it, the selected scenarios would drive an empty campaign
and report nothing. Every scenario drives the UI the way a
GM does, through a click, a drag, a wheel gesture, or a `storage` event. None of
them reach into app state, so the numbers cover the same code a real action
runs.

A scenario reports `skipped` when the control it needs is absent. That is not a
failure. The fight scenario, for example, needs an encounter on the party's
tile, so it loads a save that puts the party there (`seed.js`) before it gives
up.

## Reading the numbers

- **Wall** is the whole scenario, including the harness waits. Compare it
  between runs, not against a budget.
- **Script, Layout, Style** come from Chrome's own counters, as a delta over the
  scenario. A scenario that reloads the document resets those counters, so its
  row reads `(reload)`.
- **Long tasks** are the entries over 50 ms. These are what a GM feels as a
  stall. A row with none can still be slow in total.
- **Frame p95** is the 95th percentile gap between animation frames. A p95 far
  above the p50 means a stall, which a mean would hide.
- **Nodes and Listeners** are the leak signal. `rehydrate` and `panel-tabs` both
  repeat one rebuild many times and finish where they started, so growth in
  those two rows points at something a rebuild does not release.
- **Hot functions** are self time from the sampled profile. `(program)` and
  `(idle)` are the browser itself, not app code.

## Adding a scenario

Add an entry to `SCENARIOS` in `scenarios.js` with a `name`, a `description`,
and an async `run(page, ctx)`. Use the helpers on `page`: `clickSelector`,
`clickText`, `box`, `mouse`, `wheel`, `waitFor`, and `eval`. Return a small
record of what the scenario did, or `{ skipped: reason }`.

Two rules keep a scenario honest. Drive the UI, never app internals. If the
action reloads the document, use `page.clickForReload`, because the evaluation
that ran the click dies with the old document and never answers.
