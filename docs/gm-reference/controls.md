---
---
# Keyboard and mouse control

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

## Keyboard control

Press `?` anywhere for the shortcut reference.

| Key | Action |
| --- | --- |
| ? | Show the shortcut reference |
| / | Focus the campaign search box |
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+Z | In Build mode, undo the last stroke. In Play and Library mode, undo to the previous save |
| Ctrl/Cmd+Shift+Z | In Build mode, redo the last undone stroke. In Play and Library mode, redo the last undone save |
| B, P | Switch to Build or Play mode |
| C | In Play mode, open or close the full character sheet |
| Escape | Close a dialog or the full sheet, or put down the fog brush |
| Arrows on the map | Move the map cursor |
| Enter, Space on the map | Act on the cursor cell |
| +, - on the map | Zoom |
| Arrow off an edge, twice | Leave the area through that side. The first press lights the exit, and the second press travels |
| Shift+F10, Menu key on the map | Open the tile menu for the cursor cell (Build mode) |
| Arrows, Home, End in the World tree | Move between rows, and open or close a row |
| Enter, Space in the World tree | Open the map of the row |
| Shift+F10, Menu key in the World tree | Open the row menu |
| Tab, first press on the page | Show the skip links **Skip to the map** (Play and Build mode) and **Skip to the build tools** (Build mode) |

Save, Undo, Redo, and the mode keys work in a GM tab only. The map keys
work after you click the map or move focus to it.

The map is a focusable widget with a visible focus ring. A screen-reader
live region names the current node, its size, the party position, and the
number of points of interest. The region updates as these values change.

A list after the map names the points of interest, and a screen reader
reads it on demand. In Play mode, the list names only the points of
interest that the tooltip names: revealed, discovered if discoverable, and
within detection range. It reads the notes in a GM tab only.

A second live region names the cursor cell after each arrow key. It gives
the column and row, the art, and the point of interest. In Play mode, an
unexplored cell reads only as unexplored. In Build mode, Enter or Space on
the cursor paints or erases the cell, and the same region names the result,
for example "Painted Grass 1 at column 7, row 6".

The ways out of a sub-region are real buttons. Tab past the map, and they
show over it, each with its way out. For example: "Return to Barrow of the
Old King, through the stairs up at column 11, row 7".

The turn ribbon and the board of the combat screen are one tab stop each.
Arrow keys move between chips and between cards, and Enter or Space picks a
target. A live region announces each turn. When one side is down, it says
"The fight is over." once and stops reading turns. Each action pip is a
toggle button named for its cost, such as "Bonus action spent", and a
screen reader reads whether it is pressed.

## Mouse and touch control

| Input | Build mode | Play mode |
| --- | --- | --- |
| Left button | Paint, erase, inspect, or link a region | Move the party or a character, or use a fog brush |
| Right button drag | Pan the map | Pan the map |
| Right click without a drag | Open the tile menu | Nothing |
| Wheel | Zoom at the pointer | Zoom at the pointer |
| Two-finger drag | Pan the map | Pan the map |
| Pinch | Zoom | Zoom |

The map grid shows X and Y labels along the top and left edges. When the
grid edge scrolls out of view, the labels stay at the edges of the viewport
at partial opacity.
