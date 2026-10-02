---
---
# Tutorial: your first session as GM

*Tutorial. Do the steps in order. Each part builds on the part before it.*

In this tutorial, you load a ready-made world and walk a party across it.
Then you find an enemy, fight it, and set up a second screen for your
players. The full walk takes about twenty minutes. At the end, you know
where each part of the app is.

## Before you start

You need the app open in a browser. To start it on your computer, follow
[Local setup](index.md#local-setup) on the documentation home page.

> **Warning:** Load example replaces the campaign that is open now. If you
> have a campaign of your own, click **Export** first to keep a copy of it.
> The confirmation also says whether **Undo** can restore the campaign.

## 1. Load the example world

1. Click **Load example** in the header.
2. If a confirmation opens, click **Load example** in it. The app asks only
   when a campaign is already open.

The map shows Briarwick Vale. It is one of nine regions of a generated
continent that is called The Marches. The party stands on the road beside
the town of Briarwick. The campaign already has quests, NPCs, enemies, and a
party of four level-4 characters.

## 2. Look at the world tree

The world tree shows how the world is built. A node is one map, and a tile
on a map can lead into another node.

1. Click **Build** in the mode switch.
2. Find the **World** tree on the left side of the screen.

The top row is the world map, The Marches. The nine regions are below it.
Each region contains its own places. For example, Briarwick Vale contains the
town of Briarwick, and The Barrowdowns contains Thornhold Keep and the
Barrow of the Old King.

3. Click the chevron beside **Briarwick Vale**. Its towns, keep, and
   barrows open below it.
4. Click **Briarwick**. The map shows the town.
5. Click **The Marches** at the top of the tree. The map shows the world
   map again.

## 3. Move the party

1. Click **Play** in the mode switch.
2. Find the party token on the map.
3. Click a tile two or three cells from the token.

The party walks to the tile, and the fog clears around its new position. A
tile stays revealed after the party leaves it.

If a dialog says that walls or obstacles block every path, click
**Cancel** and pick a closer tile.

## 4. Enter a town

1. Find the settlement marker of Briarwick. It is one tile south of the
   place where the party started.
2. Move the party onto that tile.

The map changes to the map of the town. The party stands on the border of
the town, on the side that it came from. An arrow that reads **Leave to
Briarwick Vale** sits at each edge of the map that is near the party.

3. Walk one or two tiles inside the town.
4. Click one of the **Leave to Briarwick Vale** arrows.

The party walks back out to Briarwick Vale. It stands beside the town tile,
on the side of the arrow that you clicked. The tile link does this in both
directions, so you do not make a separate exit.

5. Click the **Log** tab in the sidebar. The travelogue records each map
   that the party enters and each place that it discovers.
6. Click the **Session** tab to come back.

## 5. Find an enemy

1. In the **Session** tab, find the **Encounters** panel.
2. Click the **Nearby encounters** tab. It lists the creatures near the
   party, with their HP and their column and row.

In the example, a Goblin Scout stands beside the burned farmstead, east of
Briarwick. A red diamond marks its tile on the map. Markers show only near
the party, so move closer if you do not see the diamond.

3. Move the party onto the tile of the Goblin Scout.

A dialog that reads **Encounter!** names the creature, its HP, and the map.
The dialog also names any other foe on a tile next to the party, because
those foes are part of the same encounter.

4. Click **Not now**. The creature shows in the **Active encounter** tab.
   The other button, **Set up combat**, opens the setup dialog of the next
   section at once.

The Active encounter tab also shows one line for you alone. It rates the
fight against the party, for example "Trivial: 50 XP".

## 6. Run the fight

1. Click **Start combat** in the Active encounter tab. The **Set up
   combat** dialog opens.
2. Click **Roll initiative**. Each combatant gets a d20 plus their DEX
   modifier.
3. Click **Start combat**.

The combat screen replaces the map and uses the full width of the window.
It has four areas:

- The turn ribbon across the top shows the round and the initiative order.
  It also has the **Back to map**, **Next turn**, and **End combat**
  buttons.
- The column on the left shows the combatant whose turn it is, with their
  attack and spell buttons. The dice tray is below it.
- The board in the center shows one card for each combatant, with the party
  on one side and the foes on the other.
- The combat log is on the right.

4. When a party member has the turn, click the **Goblin Scout** card. The
   card becomes the target.
5. In the left column, click one of the weapon buttons.
6. Press Enter in the attack dialog.

The attack roll goes into the combat log. If the attack hits, the app
subtracts the damage from the HP of the goblin.

7. Click **Next turn**. Play the turn of the goblin in the same way, with a
   party member as the target.
8. Continue until the goblin drops to 0 HP.

A banner says that the party is victorious. The fight stays open, so the
party can heal and you can read the log.

9. Click **End combat**.
10. In the **End the fight and award XP** dialog, click **End and award**. Each
    character gets an equal share of the XP.

The map comes back. The Encounters panel still lists the goblin at 0 HP.
The app keeps the record of a defeated foe instead of deleting it.

## 7. Manage a character

1. In the **Party** panel, click **Mirelle**. The character
   sheet opens in the Sheet tab of the sidebar.
2. Find the HP bar. Under it, **Damage** and **Heal** move HP by the amount
   in the field between them, which starts at 1.
3. Find the **Slots** row. Mirelle is a cleric, so the sheet shows spell slots.
4. Click a filled slot pip. The pip empties, and the slot is spent.
5. In the **Session** tab, find the **Time** panel.
6. Click **Long rest**.

The spent slot comes back. A long rest restores HP, spell slots, and the
other resources of every character, and it moves the clock forward.

## 8. Set up a player display

The Player view is what your players see. It hides your notes, the exact
HP of each foe, and every tile that the party has not revealed.

1. Click **Save** in the header.
2. In the **Party** panel, click **Spectator tab** below the roster. A new
   browser tab opens in the Player view.
3. Put the new tab beside the first one.
4. Go back to the first tab and move the party one tile.
5. Click **Save**.

The Player tab follows the move without a reload. The Player tab shows only
what you have saved. With this setup, one laptop can drive a display at the
table, and you do not need a server.

## 9. Save your work

1. Click **Save**, or press Ctrl+S (Cmd+S on a Mac). A message confirms the
   save.
2. Click **Export**. The browser downloads the whole campaign as a `.json`
   file.

The campaign is stored in the local storage of this one browser. The
exported file is the only copy outside it. To load the file again, click
**Import**.

## Next steps

You have done each part of a session: build, play, fight, and save.

- To build a world of your own, follow the tasks in the
  [GM guide](gm-guide.md).
- To find what a control or a rule does, read the
  [GM reference](gm-reference.md).
- To see what the example campaign contains, read
  [The example campaign](gm-reference.md#the-example-campaign) in the GM
  reference.
