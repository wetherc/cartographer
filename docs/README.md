---
---
# Documentation

This page lists every document in `docs/`. Each document is one of four
kinds, and the kind tells you what the document does for you.

| Kind | What it does | When you read it |
| --- | --- | --- |
| Tutorial | Takes you through one complete piece of work, step by step | You are new and want to learn by doing |
| How-to guide | Gives the steps for one task you already want to do | You know the goal and want the steps |
| Reference | Describes what exists: controls, fields, rules, and modules | You need a fact while you work |
| Explanation | Says why the app or the code works the way it does | You want the background |

A document stays inside its kind. A tutorial does not list every option, a
reference does not teach, and an explanation gives no steps.

If you run a campaign, start with [First session as GM](tutorial-gm-first-session.md).
If you change the code, start with [First code change](tutorial-first-code-change.md)
and then read [Architecture](architecture.md).

The deploy also publishes these documents as a website at
<https://cartographer.tbmh.org/docs/>. Its home page is [index.md](index.md),
which covers what the README covers. [Contributing](../CONTRIBUTING.md#the-docs-site)
describes how the site is built.

## Tutorials

| Document | What you do |
| --- | --- |
| [First session as GM](tutorial-gm-first-session.md) | Load the example campaign, move the party, and run one fight |
| [First code change](tutorial-first-code-change.md) | Start the app, change one module, test the change, and see it in the browser |

## How-to guides

| Document | Tasks it covers |
| --- | --- |
| [GM guide](gm-guide.md) | Build a world, run a session, track characters, curate the library |
| [Contributing](../CONTRIBUTING.md) | Set up the tools, run the checks, build, and send a change |
| [Testing a change](testing.md) | Run the unit tests, the typecheck, the linter, and the browser checks |
| [Adding a tile](adding-a-tile.md) | Draw a tile, register it, and check that it joins its neighbors |

## Reference

| Document | What it describes |
| --- | --- |
| [GM reference](gm-reference.md) | Modes, roles, panels, keyboard control, and the rules the app applies |
| [Tile assets](tile-assets.md) | The tile catalog and the art conventions for each tile family |
| [UI components](architecture/ui-components.md) | The shared widget builders, the panel contract, and the CSS vocabulary |
| [The app wiring layer](architecture/app-wiring.md) | The `AppContext` object and what each `src/app/` module owns |
| [Conventions](architecture/conventions.md) | The performance, UI, and testing rules that code here follows |
| [Benchmarks](../bench/README.md) | The performance harnesses, their options, and how to read their output |
| [Bundled fonts](../fonts/README.md) | The three typefaces, their licenses, and where the styles use them |

## Explanation

| Document | What it explains |
| --- | --- |
| [Architecture](architecture.md) | How the codebase is organized, and the split between pure logic and DOM glue |
| [The map](architecture/map.md) | Tiles, the node hierarchy, rendering, fog of war, and party movement |
| [Entities](architecture/entities.md) | Creatures, resources, and the character model |
| [Combat](architecture/combat.md) | The fight screen, the one module that writes the fight, and the view derived from it |
| [Persistence](architecture/persistence.md) | How a campaign becomes a string, the packing layers, and undo history |
| [Testing strategy](testing-strategy.md) | Why the coverage total is low, and what the suite cannot reach |
| [Curated spells](spells-missing.md) | Why the app ships 111 spells and not the full SRD |

## Browser pages

The two HTML pages in `docs/` and the tile preview in `tests/` sit outside
the four kinds. `pnpm run guide` generates `dev-guide.html`, so do not edit
it by hand. `gallery.html` and the scripts in `docs/gallery/` are written by
hand. The docs site also publishes all three, under
<https://cartographer.tbmh.org/docs/>, with the tile preview at
`tile-gallery.html`.

| Page | What it shows | How to open it |
| --- | --- | --- |
| `dev-guide.html` | A tour of the codebase: the import map, the mount order, the packing layers of a save, and a checklist for a pull request | Open the file in a browser. Rebuild it with `pnpm run guide` (see [Contributing](../CONTRIBUTING.md#the-developer-guide)) |
| `gallery.html` | Every shared builder in `src/ui/`, drawn from the real modules, with the call that built it and the classes that the call adds | Start `pnpm run dev`, and open `http://127.0.0.1:8080/docs/gallery.html`. The page loads ES modules, so it does not work from a `file://` address |
| `tests/tile-preview.html` | The tile art of each family, side by side, so every join is visible | Start `pnpm run dev`, and open `http://127.0.0.1:8080/tests/tile-preview.html`. [Testing a change](testing.md) lists the other preview pages |
