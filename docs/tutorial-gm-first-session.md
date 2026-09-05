# Tutorial: your first session as GM

*Tutorial. Follow the steps in order. Each step works on the example
campaign, so nothing here can damage a campaign of your own.*

In about twenty minutes you will load a ready-made world, walk a party
across it, find an enemy, fight it, and set up a second screen for your
players. At the end you will know where every part of the app lives.

You need the app open in a browser. The README tells you how to start it.

## 1. Load the example world

1. Click **Load example** in the header.
2. Confirm the replacement.

The map fills with an overworld: a coastline, roads, forests, and a few
towns. This campaign has quests, NPCs, enemies, and a party of two
characters already in it.

## 2. Look at the world tree

1. Click **Build** in the mode switch.
2. Read the left rail. This is the world tree.

The top row is the world map, and under it sit the regions and interiors:
wilderness, the town of Briarwick, the port of Saltmere, a dungeon, and a
keep. The tree is how the world is built, because a node contains tiles and
a tile can lead into another node.

3. Click one of the child nodes. The map shows that node instead.
4. Click the world map row again to come back.

## 3. Move the party

1. Click **Play** in the mode switch.
2. Find the party marker on the map.
3. Click a tile a short way from the marker.

The party moves, and the fog opens around the new position. A revealed tile
stays revealed for the rest of the campaign.

4. Move a few more tiles, and watch the travelogue in the **Log** tab. It
   records where the party went.

## 4. Zoom into a town

1. Move the party onto a tile with a settlement marker.
2. The map changes to the map of that town. The party lands on the border
   tile it approached from.
3. Walk one or two tiles inside the town.
4. Look at the margin of the map. An arrow reads **Return to** and the name
   of the map above.
5. Click that arrow. The party walks back out onto the tile it came from.

You did not author either direction, because the link on the tile takes the
party both ways.

## 5. Find an enemy

1. Open the **Session** tab in the sidebar and read the **Encounters**
   panel. The **Nearby encounters** tab lists what stands close to the
   party.
2. Move the party toward one of them. When it comes close, a red diamond
   appears on its tile.
3. Move onto that tile. A modal names the encounter, its region, and its
   coordinates.
4. Close the modal. The encounter moves into the **Active encounter** tab.

## 6. Run the fight

1. Click **Start combat** in the Active encounter tab.
2. In the setup dialog, click **Roll initiative**. Every combatant gets d20
   plus their DEX modifier.
3. Start the fight. The map steps aside, and the combat screen takes the
   full width.

Look at the four areas: the active combatant on the left, the board of
cards in the center, the log and dice tray on the right, and the turn
ribbon along the bottom.

4. When a party member has the turn, click the enemy card to target it.
5. Click one of the weapon buttons under the active combatant.
6. Press Enter in the dialog. The roll lands in the log, and the app takes
   the damage off the enemy.
7. Click **Next turn** and play the enemy turn the same way.
8. Keep going until one side drops. Then click **End combat**.

The defeated enemy stays in the panel, styled as defeated, because the app
keeps the record instead of deleting it.

## 7. Manage a character

1. Open the **Party** roster and select a character.
2. Read the character card. The HP bar has damage and heal steppers on
   either side.
3. If the character is a caster, click a filled spell-slot pip. The slot is
   spent.
4. Open the **Time** panel and click **Long rest**. The slots come back.

## 8. Set up a player display

1. Click **Save** in the header.
2. Open a second browser tab on the same address, and add `?role=player` to
   the URL.
3. Put that tab beside the first one.

The second tab shows the same world with the player view: no secret notes,
no exact enemy HP, and only the tiles you have revealed.

4. Go back to your first tab and move the party one tile.
5. Click **Save**. The second tab follows without a reload.

This is how you drive a table display from one laptop, with no server.

## 9. Save your work

1. Click **Save**, or press Ctrl/Cmd+S. A toast confirms the save.
2. Click **Export**. This downloads the whole campaign as a `.json` file.

The campaign lives in the local storage of this one browser, so the
exported file is the only copy outside it.

## What next

You have run the whole loop: build, play, fight, save. To build a world of
your own, follow the recipes in the [GM guide](gm-guide.md). To look up
what a control or a rule does, read the [GM reference](gm-reference.md).
