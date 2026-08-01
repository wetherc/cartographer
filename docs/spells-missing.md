# Curated spells vs. the full SRD

The built-in spell corpus (`src/data/spells.js`) is a curated cross-section
of the SRD, not the complete SRD. The SRD 5.1 lists 319 spells. The app ships
30. This document records what the cut was, why, and how a GM can close the
gap for a table that wants more.

## What ships

The list covers every level band, from cantrip through 9th level. It covers
all six caster lists: bard, cleric, druid, sorcerer, warlock, and wizard.
Paladin and ranger share entries from the leveled bands. The list also
covers all four effect kinds that the resolver handles: attack, save, heal,
and utility. The table below shows the full list.

| Level | Spells |
| ----- | ------ |
| Cantrip | Fire Bolt, Ray of Frost, Shocking Grasp, Eldritch Blast, Sacred Flame, Vicious Mockery, Guidance, Light |
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Bless, Thunderwave, Mage Armor |
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
- damage or effect scaling by spell slot level, and by caster level for
  cantrips

The list also includes utility spells with rules that exist only as prose:
Guidance, Light, Mage Armor, Counterspell, and Revivify. These spells are
common enough that a GM notices when they are missing. Their effects
stay in the description text of each spell.

## Why the rest are missing

The omissions are not data-entry backlog. Each omitted spell needs a
mechanic that the app does not have yet. Adding the spell today prints rules
that the app cannot honor.

- **Condition-imposing spells** (Ray of Enfeeblement, Bane, Blindness/Deafness,
  Slow, Banishment, Dominate Person, and others). A failed save adds the
  condition to the target as a chip. The spell's duration times the chip.
  The chip ends when the caster stops concentrating. A repeated save can
  also remove the chip, where the spell allows one. The app still cannot
  give the condition a rule effect: nothing reads "paralyzed" and grants
  advantage, or skips a turn. Hold Person represents this family in the
  built-in list.
- **Area and geometry spells** (Grease, Web, Sleep by HP total, Wall of Fire,
  Hunger of Hadar). Area targeting only lets the caster pick the creatures
  that the spell catches. A spell with `targetCount: 0` offers every
  reachable combatant, and the caster selects whoever the blast covers. The
  app has no map-geometry template, so it cannot honor shape, placement, or
  zone persistence. A spell that works like Fireball, where the caster
  picks targets in the blast, works today. A spell with a lingering zone
  does not work.
- **Buff and debuff riders on rolls** (Shield's +5 AC reaction, Haste's
  extra action, Enlarge/Reduce). These riders change the action economy, or
  change later rolls. The app models neither of these. Multi-projectile
  spells no longer belong to this group. A spell can fire several
  projectiles, each rolled separately, and the caster splits them between
  creatures. This is how Scorching Ray, Eldritch Blast, and Magic Missile
  work today.
- **Summoning and companions** (Find Familiar, Conjure Animals, Animate
  Dead). The app has no mechanism to spawn controlled combatants.
- **Exploration and social utility spells** (Detect Magic, Identify, Charm
  Person, Suggestion, Divination, teleportation). These spells have rules
  that exist only as prose. They work today as `utility` entries. The
  built-in list omits them only to stay focused. Of all the missing
  categories, a GM can add this one by hand most easily.
- The app does not model **eldritch invocations**. For this reason, the
  built-in list leaves out entries related to invocations, beyond Eldritch
  Blast itself. The app does model pact magic: a warlock casts from its own
  pact pool, not from the standard slot table.

## Closing the gap

The built-in schema is identical to the schema for a GM-authored spell.
Because of this, a GM does not need a code change to add any missing spell.

- **Author in the Library.** The Spells rail in Library mode creates new
  spells, or overrides built-in spells. A custom spell whose name matches a
  default spell replaces that default in place. Attack, save, heal, and
  utility effects, together with scaling by slot level and cantrip level,
  cover most of the mechanical surface of the SRD today.
- **Import JSON.** A library export (`campaign-library.json`) is portable.
  A hand-built or shared file with additional spells merges in when a GM
  imports it.
- A GM can still add a spell whose rules the resolver cannot honor as a
  `utility` entry, with the rules written in the description. The GM then
  adjudicates the spell by hand, the same way as at a physical table.

When conditions carry a rule effect, when the action economy exists, and
when concentration is enforced, the spell families listed above become
possible to model. At that point they belong in `src/data/spells.js`.
