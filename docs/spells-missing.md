# Curated spells vs. the full SRD

The built-in spell corpus (`src/data/spells.js`) is a curated
cross-section rather than the complete SRD. The SRD 5.1 lists 319 spells; the app
ships 30. This document records what the cut was, why, and how to close the
gap for a table that wants more.

## What ships

Every level band (cantrip through 9th), all six caster lists (bard, cleric,
druid, sorcerer, warlock, wizard — paladin and ranger share entries from the
leveled bands), and all four effect kinds the resolver handles (attack, save,
heal, utility) are represented:

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

The selection favors spells whose rules resolve fully inside the current
mechanics: a d20 spell attack against AC, a save against the caster's DC with
damage (halved or negated), dice of healing, and slot/cantrip scaling. Utility
spells with prose-only rules (Guidance, Light, Mage Armor, Counterspell,
Revivify) are included where they are common enough that a GM would miss them,
with their effects carried in the description text.

## Why the rest are missing

The omissions are not data-entry backlog. Each waits on a mechanic the app
does not have yet, and adding it today would produce an entry whose printed
rules the app cannot honor:

- **Condition-imposing spells** (Ray of Enfeeblement, Bane, Blindness/Deafness,
  Slow, Banishment, Dominate Person, ...). The save effect's `condition` field
  is stored and displayed, but conditions are visual chips with no rule effect.
  Hold Person is included as the representative of this family.
- **Concentration-dependent spells** (Bless and Hold Person ship, but the
  broader family — Haste, Invisibility, Spirit Guardians, walls and clouds —
  leans on concentration actually breaking). The `concentration` flag is
  stored and shown, but not enforced: nothing yet limits a caster to one
  effect at a time or calls for a CON save on damage.
- **Area/geometry spells** (Grease, Web, Sleep by HP total, Wall of Fire,
  Hunger of Hadar). Area targeting is reduced to picking the creatures caught:
  a spell with `targetCount: 0` offers every reachable combatant and the caster
  ticks whoever the blast covers. There is no map-geometry template, so shape,
  placement, and zone persistence cannot be honored. Fireball-style "pick the
  targets in the blast" works; lingering zones do not.
- **Buff/debuff riders on rolls** (Shield's +5 AC reaction, Haste's extra
  action, Enlarge/Reduce). These modify the action economy or later rolls,
  neither of which the app models.
- **Summoning and companions** (Find Familiar, Conjure Animals, Animate Dead).
  No mechanism for spawning controlled combatants.
- **Exploration/social utility** (Detect Magic, Identify, Charm Person,
  Suggestion, Divination, teleportation). Pure-prose rules; these work today
  as `utility` entries and are omitted only to keep the built-in list focused.
  They are the easiest category to add by hand.
- **Warlock pact magic** is not modeled (warlocks currently use the standard
  slot table), so invocation-adjacent entries beyond Eldritch Blast are left
  out.

## Closing the gap

The built-in schema is identical to a GM-authored spell, so no code change is
needed to add any missing spell:

- **Author in the Library.** Library mode's Spells rail creates new spells or
  overrides built-ins (a custom spell whose name matches a default replaces it
  in place). Attack, save, heal, and utility effects plus slot/cantrip scaling
  cover most of the SRD's mechanical surface today.
- **Import JSON.** A library export (`campaign-library.json`) is portable; a
  hand-built or shared file with additional spells merges in on import.
- Spells whose rules the resolver cannot yet honor can still be added as
  `utility` entries with the rules in the description — the GM adjudicates by
  hand, as at a physical table.

Once conditions carry rule effects, the action economy exists, and
concentration is enforced, the families above become modelable and belong in
`src/data/spells.js`.
