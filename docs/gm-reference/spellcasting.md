# Spellcasting

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

Spells come from the Spells tab of the library. A character learns and
prepares them in the Spellbook tab, and casts them from the action bar in
a fight or from the sheet outside one.

## Spellbook tab

The Spellbook tab of the character detail card lists every spell that the
class of the character can learn, grouped by spell level. It also lists
any spell that the character knows from another source. Each spell is a
card with its name and one line with the school, the casting time, and the
range. The cards fill one column in the sidebar and several in the full
sheet.

| Element | Meaning |
| --- | --- |
| Heading | The caster classes, the prepared count against the limit (for a class that prepares), and the cantrip count against the limit |
| Level heading | The spell level, and the free slots of that level, as "3 of 4 slots". A pact slot casts every spell up to its level, so free pact slots show under that level and each lower one, as "1 of 2 pact slots" |
| Known badge | The character knows the spell |
| Prepared badge | The character prepared the spell |
| Spell card | Opens the spell detail, with Learn, Prepare, Unprepare, and Forget |

A multiclass caster picks the class that a new spell records under. The
list offers the caster classes whose spell list has the spell. If no class
has it, the list offers every caster class. A spectator sees the details
but no actions.

## Cast dialog

| Field | Shows for | Meaning |
| --- | --- | --- |
| Cast at level | A leveled spell | The slot level to spend. Only levels with an unspent slot show |
| Cast as ritual (10 minutes longer) | A ritual spell, for a Bard, Cleric, Druid, or Wizard | Casts at the spell level and spends no slot. The slot picker hides while the box is ticked |
| Target or Recipient | A spell with one target | The creature that the spell affects. The caption names the range of the spell, such as "Recipient (range 60 feet)" or "Target (touch)". The app does not check the distance |
| Targets | A spell with more than one target | Up to the cap of the spell. An upcast spell such as Hold Person reaches one more creature per level. The caption names the range too |
| Projectile allocation | A spell with several projectiles | How many projectiles go to each target. The total follows the slot level |
| Resist | A buff with a list of damage types, such as Protection from Energy | The damage type that the chip resists |
| Attack roll | An attack spell, except one whose projectiles hit automatically, such as Magic Missile | Auto (from conditions), Normal, Advantage, or Disadvantage. Starts on Auto, which folds in the slants of conditions. Any other value replaces those slants for this roll, the same as in the weapon attack dialog |
| Save DC on a hit | An attack spell whose hit brings a save, such as Ray of Sickness | The DC of that save. Starts at the spell save DC of the caster |
| Save DC | A save spell that rolls a save. Sleep, Color Spray, and Power Word Kill roll none | Starts at 8 plus the proficiency bonus plus the spell ability modifier |
| Save roll | A save spell that rolls a save | Auto (from conditions), Normal, Advantage, or Disadvantage. Auto folds in the slants of each target. Any other value replaces them for every target |
| Ignore components | A spell with a material component | Casts without a check of the inventory. The label adds "(not carried)" when the character lacks the component |
| Ignore armor | A caster in untrained armor | Casts anyway |
| Ignore action cost | A turn that already spent the cost | Casts anyway |
| Ignore the bonus action spell rule | A cast on the caster's own turn that the rule blocks | Casts anyway. The label names the reason |

If you press **Cast** with no target or recipient ticked, the dialog stays
open and shows "Pick at least one target." No slot is spent. A utility spell
or a summons needs no target.

The spell attack bonus is the proficiency bonus plus the spell ability
modifier. From exhaustion level 3, the spell attack rolls at disadvantage.

The app follows the bonus action spell rule on the caster's own turn. After
a spell cast with the bonus action, the caster can cast only a cantrip with
a casting time of one action for the rest of the turn. A spell of 1st level
or higher, a reaction spell, and a spell cast with the second action of
Action Surge are all blocked. After a spell of 1st level or higher cast with
the action, a bonus action spell is blocked. An action cantrip blocks
nothing. The rule does not apply on another combatant's turn, so Shield
stays open after a bonus action spell. A repeat of a spell that an earlier
turn paid for is not a new cast, and the rule skips it. Giving back the
bonus action on the action bar also clears the spell that it paid for.

A hit of Ray of Sickness also rolls the CON save of the target. The target
list shows that save bonus beside the AC. A hit of Vampiric Touch gives the
caster hit points equal to half the damage the target took, after its
resistances, and the log records the amount.

Sleep and Color Spray roll a pool of hit points in place of a save, and
Power Word Kill compares the current HP of the target with its limit of
100. The dialog lists the targets by name only, because none of them rolls
a save. The app reads the HP of each target when you click Cast, not when
the dialog opens. See [Hit-point rules](../spells-missing.md#hit-point-rules).

A spell can have creature-type rules, which the spell form in the Library
sets under **No effect on**, **Only affects**, **No effect if immune to**,
**Save at disadvantage**, and **Maximum damage**. The app applies them to
each target by its creature type. Hold Person and Charm Person affect only
humanoids, and a creature with no type still counts, so you decide for it. Sleep passes over undead and creatures immune to
Charmed, and the log names the reason. The healing spells have no effect on
undead or constructs. Blight skips undead and constructs, and a plant saves
at disadvantage and takes the maximum damage. Sunburst and Sunbeam give
undead and oozes disadvantage on the save. See
[Creature types](../spells-missing.md#creature-types).

A Chill Touch hit stops the target from regaining hit points until the start
of the next turn of the caster, and a heal on it logs that it has no effect.
An undead target also attacks the caster at disadvantage until the end of the
next turn of the caster. The spell form sets this second chip under **Extra
chip on some creature types**, which shows once **A hit imposes a
condition** is ticked. The group names the creature types, the chip name, the
turn that ends it, and its mods, which include **Stops healing** and
**Attacks the caster at disadvantage**. The extra chip has no save.

A buff with a range of Self, such as Shield, offers only the caster as its
target. The chip of Shield, Shield of Faith, Mage Armor, or Barkskin changes
the AC that the sheet, the combatant cards, and every later attack read. On
a creature, Mage Armor replaces the authored AC when 13 plus DEX is higher,
and a creature has no shield field, so a shield that is part of the
authored AC does not add to the Mage Armor AC. See
[Armor class](../spells-missing.md#armor-class).

Aid raises the HP maximum and current HP of its targets while its chip lasts.
False Life and Heroism grant temporary hit points, and the log records each
grant. Heroism grants them at the start of each turn of its target, and it
ends and blocks Frightened. The temporary hit points of a spell end with its
chip. See [Hit points and immunity](../spells-missing.md#hit-points-and-immunity).

Faerie Fire gives advantage on attack rolls against each creature that
fails its save, and Blur gives disadvantage on attack rolls against the
caster. Protection from Evil and Good gives disadvantage only to an attacker
whose creature type is on its list, so a creature with no type set gets no
disadvantage. Greater Invisibility leaves an Invisible chip. A hit of
Guiding Bolt leaves a chip that gives advantage on the next attack roll
against the target, and a failed save against Vicious Mockery leaves a chip
that gives disadvantage on the next attack roll of the target. Each of
these two chips ends on that roll, hit or miss, and the log notes it. A
weapon attack and a spell attack both read all of these chips, and the log
line of a weapon attack names each chip that slanted it.

Haste gives its target +2 AC, advantage on DEX saves, and one more weapon
swing on each of its turns. The combat card counts the extra swing in the
swings left. When Haste ends by any path, including a chip that you remove
by hand, the target gets a Lethargic chip, and the log notes it. **Next
turn** steps past a lethargic combatant on its next turn, and the chip ends
at the end of that turn. The target keeps its concentration and its
reactions. See [Speed of action](../spells-missing.md#speed-of-action).

A spell that the caster still keeps open from an earlier turn, such as Spiritual
Weapon, casts as a repeat. The dialog is titled **Repeat** and has no slot
picker and no ritual box. A repeat spends no slot and skips the component
and armor checks, because the first cast passed them. It still costs the
action or bonus action that the spell names.

The app refuses a cast for these reasons, in this order, and spends nothing
on a refusal:

1. A material component is missing. A component with a cost, or one that
   the spell destroys, must be the item itself. Any other component is
   covered by a component pouch or a focus.
2. The caster wears armor that it is not trained for.
3. The turn cannot pay the action cost, or the casting time is longer than
   one turn.

Only a character has an inventory, so a creature is never asked for a
component. A cast that consumes its component removes the item from the
inventory.

## Concentration

A caster, character or creature, keeps at most one concentration spell. A
new concentration spell ends the old one.

| Event | Result |
| --- | --- |
| Damage | A CON save against DC 10 or half the damage, whichever is higher. A failure ends the spell. A character with the War Caster feat rolls the save with advantage |
| A condition that loses the turn | Ends the spell |
| 0 HP for a creature | Ends the spell |
| The duration runs out | Ends the spell |
| Drop control | Ends the spell |

When a concentration spell ends, the conditions that it put on other
creatures end, and the creatures that it summoned leave.

## Summons

A summoning spell puts creatures from a library template on the tile of
the party, at full health. The built-in example is Conjure Animals, which
brings eight Wolf creatures, sixteen with a 5th-level slot, twenty-four
with a 7th-level slot, and thirty-two with a 9th-level slot. If the library has no template with the name
that the spell gives, the cast dialog refuses the spell.

The side that a summon fights on comes from its caster. A party character's
summons are friendly and stand with the party, so a party druid's wolves fight
beside it. A creature's summons take the disposition of that creature, so a
hostile caster's summons fight the party. The template keeps its own
disposition for creatures that the GM places by hand.

If a fight is running, the summons join the initiative order. See
[Initiative](combat.md#initiative). The end of the spell removes the creatures
that it brought.
