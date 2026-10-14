# Campaign Builder

Campaign Builder is a browser app for building and running the world of a D&D campaign, or of a similar tabletop campaign. It shows the world that the players move through: the map, the fog of war, the party, the fights, and the story so far. It does not act as the game master (GM). The GM makes every rules call and moves the story forward.

The app runs entirely in one browser tab. It has no server and no account. It keeps each campaign in the local storage of the browser, and you move a campaign between browsers with a JSON export file.

![Play mode: the party and the dice tray on the left, the fog-revealed map, and the Session tab on the right](docs/images/play-mode-light.png)

## Quick start

You need [Node.js](https://nodejs.org/) 22 or later and [pnpm](https://pnpm.io/) 11.

1. Clone the repository, and open a terminal in it.
2. Install the development tools:

   ```bash
   pnpm install
   ```

3. Start the dev server:

   ```bash
   pnpm run dev
   ```

4. Open `http://127.0.0.1:8080` in a browser.

The app opens in Play mode with a blank campaign. On the first visit, a **Welcome, GM** card offers three ways to start: build by hand, generate a world, or load the example campaign. Click **Welcome** in the header to open the card again. At any time, click **Load example** in the header to load the example campaign. If port 8080 is in use, the dev server fails to start, so stop the other process first.

A hosted build runs at <https://cartographer.tbmh.org>. The hosted build can be older than the source in this repository. Each origin has its own local storage, so a campaign that you save on the hosted build does not appear on your dev server. Use **Export** and **Import** to move it.

## Features

### World building

- Paint a tiled map with the built-in tile art, or generate a map with the procedural generator and then edit it.
- Nest maps in a hierarchy. A world contains regions, a region contains towns and dungeons, and a building contains its floors.
- Link a tile to a child map, so the party can zoom from a region into a town.
- Lock a map behind a key item. The party stops at the way in. The GM sees who has the key and unlocks it.
- Mark points of interest. Each tile has notes that only the GM sees.
- Get a warning in Build mode when a map has no way in or out.
- Export any map as a PNG image.

The data model accepts custom tile images, but the app has no control that adds one yet.

### Sessions

- Move the party across the map. The fog of war hides every area that the party has not seen, and it clears as the party walks.
- Light the rooms of a building, so the whole room shows when the party walks in.
- Leave a sub-region from any side that touches the map above it. Where two regions share a border, the party walks straight across into the next region.
- Take stairs and doors between the floors of a building.
- Split the party into more than one group on the map.
- See a mini-map in the corner inside a sub-region. It shows where the party stands on the map one level up.
- Advance an in-game clock of six watches per day, and take short and long rests. A walk tells the GM how much time it took, and asks before it runs into the night.
- Keep a quest log, a list of NPCs, handouts with pictures, and a travelogue of what happened.
- Let a finished quest reveal the quests it leads to, and pay out its gold and experience points to the party.
- Get a prompt when the party stands on the tile of a hidden handout.
- Search the whole campaign from the header box: maps, quests, NPCs, handouts, notes, and the travelogue. A match opens its map tile or its row in the sidebar, and a Player tab finds only what it can see.
- Bring an NPC along, so it travels with the party.

### Combat

- Run a fight on a full-width combat screen, with a turn ribbon above the initiative order.
- Pick a target from the combatant cards. Each card shows armor, weapons, and spell slots.
- Attack or cast with one click on the turn of the active combatant, and read the result in the combat log.
- Check the difficulty of a fight before it starts. The Encounters panel shows the experience-point value of the foes against the budget for the party's levels, and only the GM sees it.
- Add foes that stand nearby to a fight, before it starts or while it runs.
- Give a boss legendary actions and legendary resistance, and spend them from its combatant card.
- Keep a fight open after the last enemy falls, until the GM ends it.

### Characters and creatures

- Keep full character sheets: class and subclass, race, background, proficiencies, hit dice, and spellcasting.
- Level up one class level at a time, with multiclassing, subclasses, and a choice of an ability score improvement or a feat.
- Pick the choices of a class feature at level-up, such as the Expertise of the Rogue.
- Track items, spell slots, and other resources that a character uses up.
- Drink a healing potion, or any item that has heal dice, from the inventory.
- Buy library equipment with the coins of a character. The built-in items have their SRD prices.
- Keep every creature in one list, from major enemies with hit points to friendly and neutral NPCs. A creature has a challenge rating and its trained saving throws and skills, and the app works out each bonus.
- Roll any combination of dice in the dice tray.

### Library

- Curate templates for equipment, creatures, spells, feats, and random tables in Library mode. The templates do not belong to one campaign.
- Roll on a weighted random table from the dice tray, such as wilderness encounters or loot. The result goes into the travelogue, and a hidden roll hides it from the players.
- Start from the built-in 5th edition (5e) defaults, and override or add entries.
- Export your library to a JSON file. Save the file over `library/campaign-library.json`, and every new browser or clone loads it at startup.
- Include the library in a campaign export. A campaign import offers to restore it.

### Player displays

- Open a second browser tab in the Player role for a screen that the players see. A Player tab shows only the revealed map, and it shows enemy health as a band instead of exact hit points.
- Bind a Player tab to one character, so that player runs their own turns in a fight.
- Keep the tabs of one browser in step. Each save in the GM tab reaches the other tabs without a reload.

The Player role hides GM information on the screen, but it is not a security control. A person at that browser can read the whole campaign from its storage. See [Limits of the Player view](docs/gm-reference/campaign.md#limits-of-the-player-view).

### Appearance

- Switch between the light and dark themes in the header, or follow the setting of the operating system. The app keeps the choice for each browser.

![Build mode: world tree, editable map, and the paint palette](docs/images/build-mode.png)

![Combat: the full-width fight screen with the turn ribbon, the board, the combat log, and the dice tray](docs/images/combat-screen.png)

![Play mode in the dark theme, with the character sheet of Ser Aldric in the Sheet tab](docs/images/play-mode-dark.png)

## Documentation for GMs

You can read every document below on the [docs site](https://cartographer.tbmh.org/docs/), with a sidebar and a list of the headings on each page.

| Document | Use it to |
| --- | --- |
| [First session as GM](docs/tutorial-gm-first-session.md) | Load the example campaign and run one session from start to end |
| [GM guide](docs/gm-guide.md) | Find the steps for one task, such as painting a region or staging an encounter |
| [GM reference](docs/gm-reference.md) | Look up a control, a field, a limit, or a rule |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) tells you how to set up the tools, run the checks, and send a change. [docs/README.md](docs/README.md) lists every document by kind. To learn the code, start with [Your first code change](docs/tutorial-first-code-change.md), then read [Architecture](docs/architecture.md).
