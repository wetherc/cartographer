# Documentation

Each document here is a tutorial, a how-to guide, a reference, or an
explanation, and the kind tells you what the document does for you.

| Kind | What it does | When you read it |
| --- | --- | --- |
| Tutorial | Takes you through one complete piece of work, step by step | You are new and want to learn by doing |
| How-to guide | Gives the steps for one task you already want to do | You know the goal and want the recipe |
| Reference | Describes what exists: controls, fields, rules, and modules | You need a fact while you work |
| Explanation | Says why the app or the code works the way it does | You want the background |

A document stays inside its kind, so a tutorial does not list every option,
a reference does not teach, and an explanation gives no steps.

## Tutorials

| Document | What you build |
| --- | --- |
| [First session as GM](tutorial-gm-first-session.md) | You load the example campaign, move the party, and run one fight |
| [First code change](tutorial-first-code-change.md) | You start the app, change one module, test the change, and see it in the browser |

## How-to guides

| Document | Tasks it covers |
| --- | --- |
| [GM guide](gm-guide.md) | Build a world, run a session, track characters, curate the library |
| [Testing a change](testing.md) | Run the unit tests, the typecheck, the linter, and the browser checks |
| [Adding a tile](adding-a-tile.md) | Draw a tile, register it, and check that it abuts its neighbors |

## Reference

| Document | What it describes |
| --- | --- |
| [GM reference](gm-reference.md) | Modes, roles, panels, keyboard control, and the rules the app applies |
| [Tile assets](tile-assets.md) | The tile catalog and the art conventions for each tile family |
| [UI components](architecture/ui-components.md) | The shared widget builders, the panel contract, and the CSS vocabulary |
| [The app wiring layer](architecture/app-wiring.md) | The `AppContext` object and what each `src/app/` module owns |
| [Conventions](architecture/conventions.md) | The performance, UI, and testing rules that code here follows |

## Explanation

| Document | What it explains |
| --- | --- |
| [Architecture](architecture.md) | How the codebase is organized, and the split between pure logic and DOM glue |
| [The map](architecture/map.md) | Tiles, the node hierarchy, rendering, fog of war, and party movement |
| [Entities](architecture/entities.md) | Encounters, resources, and the character model |
| [Combat](architecture/combat.md) | The fight screen, its one writer, and its derived view |
| [Persistence](architecture/persistence.md) | How a campaign becomes a string, the packing layers, and undo history |
| [Testing strategy](testing-strategy.md) | Why the coverage total is low, and what the suite cannot reach |
| [Curated spells](spells-missing.md) | Why the app ships 54 spells and not the full SRD |

`dev-guide.html` sits beside these documents. It is a generated tour of the
codebase, not one of the four kinds. `CONTRIBUTING.md` in the project root
tells you how to rebuild it.

`gallery.html` sits beside them too. It renders every shared builder in
`src/ui/` from the real modules, with the call that built each one and the
classes that call produces. Open it over the dev server at
`http://localhost:8934/docs/gallery.html`, since it loads ES modules. Open
it when you need to see a widget before you use it.
