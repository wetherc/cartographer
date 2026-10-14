# The library

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

Library mode curates the templates that the preset pickers offer, and the
random tables that the dice tray rolls. It has five tabs.

| Tab | Contents |
| --- | --- |
| Equipment | Every weapon, armor, gear item, and consumable that the item form offers, in five subtabs: Weapons, Armor, Rings, Consumables, and Gear |
| Creatures | Stock creatures in two subtabs. Foes lists the hostile templates, and People lists the rest. The hand-off icon opens the matching campaign dialog, filled in |
| Spells | The spell catalog that the Spellbook tab picks from, grouped by spell level. The app ships 131 built-in spells |
| Feats | The feat catalog that the level-up feat choice offers. The app ships 16 built-in feats |
| Tables | The random tables that the dice tray rolls. The app ships three built-in tables: Wilderness encounters, Trinkets and loot, and Settlement names |

| Row badge | Meaning | Row control |
| --- | --- | --- |
| customized | You edited a built-in default, and the app stores an override | Revert (the counter-clockwise arrow) |
| custom | You added a new entry | Delete (the red trash icon) |

A custom entry overrides a default with the same name. For equipment, the
name and the type must both match. An edit that changes the disposition of
a creature moves the entry to the other subtab.

The Spells tab has **Class**, **Level**, and **School** filters beside the
name filter, and the Creatures tab has a **Challenge rating** filter on
both subtabs.
Each filter offers only the values that the entries of the subtab in view have, and a filter with no values hides.

The equipment form shows its **Preset** picker only for a new entry. An
edit of an existing entry hides it, because a pick would overwrite the
stats of the entry.

Customizations live outside the campaign. New and Load example replace the
campaign and never change the library. A campaign export bundles the
customizations, and a campaign import offers to restore them. See
[Campaign controls](campaign.md#campaign-controls).

| Library file control | What it does |
| --- | --- |
| Export library | Downloads `campaign-library.json` |
| Import library | Loads an exported file into this browser. When you have customizations, a confirmation shows the entry counts of your library and of the file before it replaces them. A file with none of the five library lists (equipment, creatures, spells, feats, tables), such as a campaign export, is refused with "That file is not a library file." |
| Reset library | Removes all customizations and restores the built-in defaults. It is disabled while the library has no customizations |

The Library file card sits at the top of Library mode, above the tabs.
The header stays in view, and the list of the open tab scrolls on its own.
A new entry or an edit opens in a dialog over the list. Press Escape or
**Cancel** to close it with no change. The list keeps its place, so you
return to the row that you edited.

A form with a blank **Name** does not save. It shows "Name is required."
above its buttons and moves the focus to Name. In the creature form, an
ability score runs from 1 to 30, and Max HP and AC start at 1. When you
leave a number field, a value outside its range changes to the nearest
allowed value, so a typed STR of 99 becomes 30. The creature dialog of
Build and Play uses the same ranges.

At startup, if the browser has no customizations, the app loads
`library/campaign-library.json` from the project directory. The merged
lists apply at once everywhere that the app reads the presets.

## Random tables

A random table has a name and a list of rows. Each row has a weight and a
text. A roll picks one row, and a row with weight 2 comes up twice as often
as a row with weight 1.

| Table form field | What it does |
| --- | --- |
| Name | The table name. It is the merge key, so a table with the name of a built-in table overrides it |
| Weight | A whole number from 1 to 1000. An empty or invalid weight saves as 1 |
| Row | The text that the roll gives. Write `{place}` for a generated place name, such as "Ashford" or "Kelamere". A row with no text is dropped on save |
| Chance | The percent chance of the row, from its weight and the total of all weights. It updates as you type |
| Add row, Remove row | Add an empty row at the end, or remove one row |

A table with no row text cannot be saved, and the form shows "Add at least
one row with text." The app does not roll dice that a row names, such as
"1d4 + 2 wolves". Roll them in the dice tray. To roll a table, see
[Dice tray](story.md#dice-tray).
