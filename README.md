# Campaign Builder

This project is a self-contained suite for creating and managing the world of a D&D (or equivalent) campaign. It is not intended to GM for you, only to visualize the world the players are moving through.

![Play mode: the fog-revealed map with the session panels alongside](docs/images/play-mode-light.png)

## Features

With Campaign Builder, you can:

  - Visually construct a tiled world, with regions, sub-regions, and major and minor points of interest
    - You can use a suite of pre-built tiled images, or supply your own [WIP]
    - All tiles have metadata associated with them to allow you to specify major features that players can discover and interact with
    - Groups of tiles can be hierarchical, with a world containing regions, regions containing sub-regions, and so on
    - You can visually zoom into and out of different hierarchical levels (e.g., from a region you can zoom into a particular sub-region and show the point of interest tiles)
    - The way back out is derived from the links you already drew: a sub-region can be walked off any side that touches the map above it, and an interior leaves through its outer door or the staircase connecting it to the level above or below. Build mode warns you when a node has no way in or out
    - You can progressively reveal parts of the map as your party travels. Unexplored areas remain greyed out until your party moves closer
    - Track your party's location on the map at all times
  - Add major enemies/encounters with life tracking
  - Add resource tracking (items, D&D-style spell slots, and other expendable character-based resources)
  - Add character sheets with full character stats, class (and subclass), race, background, assembled proficiencies, hit dice, spellcasting, and level/progression tracking with per-level class assignment, multiclassing, and ability-score-improvement/feat choices
  - Simulate dice rolls and their results for any combination of dice needed in an interaction
  - Curate a campaign-independent library of equipment, enemies, and NPC templates (the Library mode in the header): the built-in 5e defaults are all listed and individually customizable, and your overrides and additions export to a portable JSON file — saved over `library/campaign-library.json` it auto-loads into any fresh browser or clone
  - Switch the whole UI between light and dark with the header's theme switch — or leave it on System to follow the operating system's preference; the choice persists per browser

![Build mode: world tree, editable map, and the paint palette](docs/images/build-mode.png)

![Play mode in the dark theme](docs/images/play-mode-dark.png)

See [`docs/gm-guide.md`](docs/gm-guide.md) for more, including the Library mode.

## Contributing

This project welcomes contributions. For guidance on setting up the development environment, running tests, and understanding the codebase, please see the [**`CONTRIBUTING.md`**](CONTRIBUTING.md) file.

See [`docs/gm-guide.md`](docs/gm-guide.md) for a GM-facing walkthrough of running and building a campaign, [`docs/architecture.md`](docs/architecture.md) for module layout and the map data model, [`docs/testing.md`](docs/testing.md) for how to test and visually verify changes, and [`docs/tile-assets.md`](docs/tile-assets.md) for tile art conventions.
