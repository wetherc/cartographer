# Curated spells vs. the full SRD

*Explanation. To add a spell of your own, follow the steps in the
[GM guide](gm-guide.md#add-a-spell-the-app-does-not-ship).*

The built-in spell corpus (`src/data/spells.js`) is a curated cross-section
of the SRD, not the complete SRD. The SRD 5.1 lists 319 spells. The app ships
31. This document records what the cut was, why, and how a GM can close the
gap for a table that wants more.

## What ships

The list covers every level band, from cantrip through 9th level. It covers
all six caster lists: bard, cleric, druid, sorcerer, warlock, and wizard.
Paladin and ranger share entries from the leveled bands. The list also
covers all five effect kinds that the resolver handles: attack, save, heal,
buff, and utility. The table below shows the full list.

| Level | Spells |
| ----- | ------ |
| Cantrip | Fire Bolt, Ray of Frost, Shocking Grasp, Eldritch Blast, Sacred Flame, Vicious Mockery, Guidance, Light |
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Bless, Bane, Thunderwave, Mage Armor |
| 2nd | Scorching Ray, Hold Person, Lesser Restoration |
| 3rd | Fireball, Lightning Bolt, Revivify, Counterspell |
| 4th | Ice Storm |
| 5th | Cone of Cold, Mass Cure Wounds |
| 6th | Chain Lightning |
| 7th | Finger of Death |
| 8th | Power Word Stun |
| 9th | Meteor Swarm |

The selection favors spells whose rules the current mechanics can resolve in
full. These rules are:

- a d20 spell attack against AC
- a save against the caster's DC, with damage that is halved or negated
- dice of healing
- a chip on the target that adds a die or a flat amount to its later attack
  rolls, saving throws, and ability checks, for as long as the chip lasts
- a chip that slants later d20 rolls, crits a melee hit, fails a save without
  a roll, or costs the holder its turn, for the eleven standard condition
  names that carry rules
- damage or effect scaling by spell slot level, and by caster level for
  cantrips

A rider chip runs for the spell's whole duration. Nothing spends it after one
roll, so Guidance is the one built-in spell whose rider is wider than the
printed rule: it grants 1d4 to a single ability check, and the chip stays
until its duration runs out or the caster stops concentrating. A check rolled
from the character sheet picks the die up on its own, and so does every check
after it. Take the chip off after the check it paid for.

The list also includes utility spells with rules that exist only as prose:
Light, Mage Armor, Counterspell, and Revivify. These spells are common enough
that a GM notices when they are missing. Their effects stay in the description
text of each spell.

## Why the rest are missing

The omissions are not data-entry backlog. Each omitted spell needs a
mechanic that the app does not have yet. Adding the spell today prints rules
that the app cannot honor.

- **Condition-imposing spells** (Blindness/Deafness, Slow, Banishment,
  Dominate Person, and others). A failed save adds the condition to the
  target as a chip. The spell's duration times the chip. The chip ends when
  the caster stops concentrating. A repeated save can also remove the chip,
  where the spell allows one. Eleven condition names now carry a rule effect,
  so a paralyzed target hands out advantage, crits on a melee hit, fails its
  Strength and Dexterity saves, and loses its turns. What is still missing is
  the rest of each spell's text: Slow halves speed and cuts an action,
  Banishment removes the creature from the map, and Dominate Person hands
  control to the caster. None of movement, the action economy, or one creature
  driving another exists yet. Hold Person and Bane represent this family in the
  built-in list.
- **Area and geometry spells** (Grease, Web, Sleep by HP total, Wall of Fire,
  Hunger of Hadar). Area targeting only lets the caster pick the creatures
  that the spell catches. A spell with `targetCount: 0` offers every
  reachable combatant, and the caster selects whoever the blast covers. The
  app has no map-geometry template, so it cannot honor shape, placement, or
  zone persistence. A spell that works like Fireball, where the caster
  picks targets in the blast, works today. A spell with a lingering zone
  does not work.
- **Buffs that change something other than a d20 roll** (Shield's +5 AC
  reaction, Haste's extra action, Enlarge/Reduce). A rider on a d20 roll works
  today: a chip can add or subtract dice and a flat amount on attack rolls,
  saving throws, and ability checks, which is how Bless, Bane, and Guidance
  ship. A chip that changes AC, the action economy, or a creature's size has
  nothing to hook. Multi-projectile spells no longer belong to this group
  either. A spell can fire several projectiles, each rolled separately, and
  the caster splits them between creatures. This is how Scorching Ray,
  Eldritch Blast, and Magic Missile work today.
- **Choosing a summon, and controlling it** (Find Familiar, Animate Dead).
  Summoning itself works today. A `summons` effect names one library creature
  template and a count, and the cast puts those creatures on the tile of the
  party. They leave when the caster stops holding the spell. This is how
  Conjure Animals ships, with wolves in place of the printed choice of beasts.
  Three parts are still missing. A cast cannot offer the caster a menu of
  templates. A summon takes its own turn as a combatant, and no player runs
  it as a companion. A summon that no concentration holds, such as an animated
  skeleton or a familiar, stays until the GM removes it by hand.
- **Exploration and social utility spells** (Detect Magic, Identify, Charm
  Person, Suggestion, Divination, teleportation). These spells have rules
  that exist only as prose. They work today as `utility` entries. The
  built-in list omits them only to stay focused. Of all the missing
  categories, a GM can add this one by hand most easily.
- The app does not model **eldritch invocations**. For this reason, the
  built-in list leaves out entries related to invocations, beyond Eldritch
  Blast itself. The app does model pact magic: a warlock casts from its own
  pact pool, not from the standard slot table.

## Why the gap is a GM's to close

The built-in schema is identical to the schema for a GM-authored spell. A
missing spell therefore needs no code change. The Spells rail in Library
mode creates one, and a custom spell whose name matches a default replaces
that default in place. A library export (`campaign-library.json`) is
portable, so a shared file of extra spells merges into any browser.

Attack, save, heal, and utility effects, together with scaling by slot
level and by cantrip level, cover most of the mechanical surface of the SRD
today. A spell outside that surface still works as a `utility` entry with
its rules in the description. The GM then adjudicates it by hand, the same
way as at a physical table.

The [GM guide](gm-guide.md#add-a-spell-the-app-does-not-ship) gives the
steps.

When movement exists, when the action economy exists, and when concentration
is enforced, the spell families listed above become possible to model. At that point they belong in `src/data/spells.js`.
