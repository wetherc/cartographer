---
---
# Benchmarks

*Reference.*

The harnesses in this directory measure how fast the app runs and how much
memory it uses. None of them adds a dependency.

| Command | What it measures | Where it runs |
| --- | --- | --- |
| `pnpm bench` | What a tab costs in the real app: DOM nodes, listeners, heap, layout and script time, long tasks, and a sampled CPU profile for each scenario | Chrome |
| `pnpm bench:pure` | The pure modules: generation, serialization, fog reveal, and the world tree | Node |
| `pnpm bench:scale` | The whole-state paths as the world grows, from the example campaign up to 400 extra generated regions | Node |
| `pnpm bench:step` | One Play-mode party step on square nodes from 48 to 400 cells on a side | Node |
| `pnpm bench:commit` | The whole-state paths at one large world size, against the budgets in `budgets.json`. The pre-commit hook runs it | Node |

The `bench:scale` table shows which paths grow with the world, and where
each one passes 50 ms, the length of a stall that a GM notices. Its `adopt`
column times the full read that a follower tab does: `deserialize` of a
save with one changed node, with the live nodes passed in. Run it before
and after a change to the save, diff, or reconcile paths.

The `bench:step` table shows whether a party step grows with the size of
the node. `bench:commit` finishes in about one second.

## Run the browser harness

You need Google Chrome. If Chrome is not in the usual place for your
platform, set `CHROME_PATH` to the executable.

```
pnpm bench                                every scenario, headless
pnpm bench -- --headful                   the same run in a visible window
pnpm bench -- --only=paint-stroke         one scenario
pnpm bench -- --only=paint-stroke,zoom-pan  two scenarios
pnpm bench -- --port=9000                 a server that already runs on port 9000
pnpm bench -- --budget=120000             a longer time cap for each scenario, in ms (default 60000)
```

The harness uses port 8934 unless you pass `--port`. If no server listens on
the port, the harness serves the repository with a small Node static
server, and it stops only a server that it started. Do not use
`python3 -m http.server` as the server. The app requests about 340 modules
at once on boot, and that server resets some of the connections, so the
page loads with no app.

Chrome runs with a new, empty profile for each run. Your own browser
profile stays untouched, and every run starts with an empty localStorage.

The harness talks the Chrome DevTools Protocol over the `WebSocket` global
of Node 22, so it needs no Playwright or Puppeteer install.

## Output of a run

Each run writes one directory under `bench/results/`. Git ignores this
directory.

| File | Contents |
| --- | --- |
| `summary.md` | The table to read, and the ten functions with the most self time in each scenario |
| `metrics.json` | Every reading, so that you can compare two runs |
| `<scenario>.cpuprofile` | A CPU profile sampled every 100 microseconds |

To see a flame chart, open the DevTools Performance panel in Chrome, click
the Load button, and pick a `.cpuprofile` file.

## Scenarios

| Scenario | What it does |
| --- | --- |
| `boot` | A cold load, up to the first mounted panel |
| `load-example` | Builds the example campaign, saves it, and reloads onto it |
| `paint-stroke` | One authoring stroke of 24 cells |
| `generate-map` | Procedural generation through the Generate dialog |
| `zoom-pan` | Twenty wheel-zoom steps at the center of the canvas |
| `play-pan` | One right-drag pan across the fog-revealed map in Play mode |
| `panel-tabs` | Thirty sidebar tab switches |
| `rehydrate` | Fifty cross-tab save adoptions, each a full read of the save |
| `combat-turns` | Starts a fight, advances twenty turns, and ends it |
| `rehydrate-focus` | Ten cross-tab save adoptions, and a check that keyboard focus stays in place. It reports `focusKept`, not a time |

The runner always adds `boot`, because `boot` opens the app. The scenarios
after `load-example` read the example campaign. If `--only` names one of
them without `load-example`, the runner adds `load-example` in front and
prints a note. Without it, those scenarios would drive an empty campaign
and measure nothing. `rehydrate-focus` reloads onto a seed save, so it runs
last.

A scenario reports `skipped` when the control that it needs is absent, and
the run continues. For example, the fight scenario needs an encounter on
the party's tile, so it first loads a save that puts the party there
(`seed.js`). `load-example` is the only scenario marked `prerequisite`. If
it skips or fails, the runner stops and exits with status 1, because the
scenarios after it have no campaign to read.

Every scenario drives the UI as a GM does, with a click, a drag, a wheel
gesture, or a `storage` event. No scenario reads or writes app state
directly, so each number covers the same code that a real action runs.

## Reading the numbers

| Column | Meaning |
| --- | --- |
| Wall | The whole scenario, including the waits of the harness. Compare it between runs, not against a budget |
| Script, Layout, Style | The change in the Chrome counters over the scenario. A scenario that reloads the document resets these counters, so its row reads `(reload)` |
| Long tasks | The tasks over 50 ms, which a GM notices as a stall. A row with no long tasks can still be slow in total |
| Frame p95 | The 95th percentile gap between animation frames. A p95 far above the p50 shows a stall that a mean hides |
| Nodes, Listeners | The signal for a leak. `rehydrate` and `panel-tabs` repeat one rebuild many times and end where they started, so growth in those two rows points to something that a rebuild does not release |
| Hot functions | Self time from the sampled profile. `(program)` and `(idle)` are the browser itself, not app code |

## The commit check

The pre-commit hook runs `bench:commit` when a commit changes `src/`. The
check prints its table on every run. If a path is over its budget, it
prints a warning, and the commit still goes through. Look at the change
before you push it.

The budgets in `budgets.json` are well above the medians of a normal run,
so machine speed and background load do not trip them. A path over its
budget does more work than the budget allows. If a change adds cost on
purpose, run `pnpm bench:commit` again and raise the budget in the same
commit.

| Row | Budget | Normal reading | What it measures |
| --- | --- | --- | --- |
| `heapPerTile` | 220 bytes | about 150 bytes | The heap that a load and one save keep, divided by the tile count (`heap.js`) |
| `adopt` | 12 ms | about 5 ms | The full read of a follower tab when the undo log cannot supply the change |
| `partyStep` | 0.3 ms | about 0.01 ms | One party step on the example world node |
| `partyStep200` | 0.3 ms | about 0.04 ms | One party step on a fogged 200x200 node |

The other rows (`serialize`, `deserialize`, `toTileGrid`, `reconcile`,
`diffWarm`, `diffCold`, `fogReveal`, and `worldTree`) time one path each,
with the budgets in `budgets.json`.

### `heapPerTile`

This row loads the campaign from its save, saves it once, and divides the
heap that the result keeps by the tile count. The reading covers the live
tiles and every cache that a load and a save fill. A cache that keeps one
record per tile for the whole session puts the row over its budget. For
example, a cache of packed tiles in the dictionary mode of V8 reads about
690 bytes.

### `adopt`

This row runs `deserialize` of a save with one changed node, with the live
nodes passed in, and then `reconcile`. Each unchanged node matches its
cached encoded form and keeps its live object, so the row reads about 5 ms.
A read that decodes every node reads about 25 ms, the same as the
`reconcile` row, and goes over the budget.

### `partyStep` and `partyStep200`

The `partyStep` row and the `step ms` column of the scale table time one
Play-mode party step, averaged over a walk along the middle row of the
node. A step is the fog reveal plus the values that the next frame and the
map description read: the region groups, slots, outlines, and image chunks,
the lookup of revealed ids, the span blocks, and `describeNode`
(`party-step.js`). The region caches key on tile stamps, so a step that
only reveals fog costs about 0.01 ms. A cache that keys on the node
rebuilds on every step.

The `partyStep200` row walks the same step on a fogged 200x200 node
(`sweepNode` in `party-step.js`). A step reader that scans every tile makes
this row read about 0.9 ms, over its budget. The example world node is too
small to show that scan. `pnpm bench:step` prints the same walk at each
node size:

| Node | Tiles | Step with the fog readers | Step with a scan of every tile |
| --- | --- | --- | --- |
| 48x48 | 2,304 | 0.010 ms | 0.060 ms |
| 100x100 | 10,000 | 0.010 ms | 0.225 ms |
| 200x200 | 40,000 | 0.037 ms | 0.891 ms |
| 400x400 | 160,000 | 0.120 ms | 3.473 ms |

The part of a step that still grows with the node is the copy of the tile
array in `withTilesReplaced`.

## Add a scenario

1. Add an entry to `SCENARIOS` in `scenarios.js`, with a `name`, a
   `description`, and an async `run(page, ctx)`.
2. Drive the UI with the helpers on `page`: `clickSelector`, `clickText`,
   `box`, `mouse`, `wheel`, `waitFor`, and `eval`. Do not call app
   internals, because the numbers then stop matching what a real action
   costs.
3. If the action reloads the document, use `page.clickForReload`. A plain
   click never returns, because its evaluation ends with the old document.
4. If the click reloads the document only sometimes, call `page.nextLoad()`
   before the click, and await the result after it.
5. Return a small record of what the scenario did, or `{ skipped: reason }`.
