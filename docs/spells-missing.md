# Curated spells vs. the full SRD

*Explanation. To add a spell of your own, follow the steps in the
[GM guide](gm-guide.md#add-a-missing-spell).*

The built-in spell corpus (`src/data/spells.js`) is a curated cross-section
of the SRD, not the complete SRD. The SRD 5.1 lists 319 spells, and the app
ships 54, because every spell it ships has rules that the resolver can apply
in full or a description that says which clause it leaves to the GM.

## The built-in list

The list covers every level band from cantrip through 9th level, all six
caster lists (bard, cleric, druid, sorcerer, warlock, and wizard), and all
six effect kinds that the resolver handles: attack, save, heal, buff,
summons, and utility. Paladin and ranger share entries from the leveled
bands, and the paladin also has one of its own.

| Level | Spells |
| ----- | ------ |
| Cantrip | Fire Bolt, Ray of Frost, Shocking Grasp, Eldritch Blast, Sacred Flame, Vicious Mockery, Acid Splash, Poison Spray, Chill Touch, Resistance, Guidance, Light |
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Bless, Bane, Thunderwave, Inflict Wounds, Hellish Rebuke, Mage Armor |
| 2nd | Scorching Ray, Hold Person, Lesser Restoration, Blindness/Deafness, Shatter, Prayer of Healing, Invisibility |
| 3rd | Fireball, Lightning Bolt, Revivify, Counterspell, Conjure Animals, Mass Healing Word, Fear |
| 4th | Ice Storm, Blight |
| 5th | Cone of Cold, Mass Cure Wounds, Flame Strike, Hold Monster, Destructive Wave |
| 6th | Chain Lightning, Circle of Death, Disintegrate, Freezing Sphere, Heal |
| 7th | Finger of Death, Fire Storm |
| 8th | Power Word Stun, Sunburst |
| 9th | Meteor Swarm |

The selection favors spells whose rules the current mechanics can resolve in
full. These rules are:

- a d20 spell attack against AC
- several separately rolled projectiles from one cast, split between the
  creatures the caster picks
- a save against the caster's DC, with damage that is halved or negated
- dice of healing, or a flat amount of healing
- a chip on the target that adds a die or a flat amount to its later attack
  rolls, saving throws, and ability checks, for as long as the chip lasts
- a chip that slants later d20 rolls, crits a melee hit, fails a save without
  a roll, or costs the holder its turn, for the eleven standard condition
  names that have rules
- a chip that a failed save imposes, which the target can retry at the end of
  each of its turns
- a group of summoned creatures from one library template, which the
  caster's concentration maintains
- damage or effect scaling by spell slot level, and by caster level for
  cantrips

A rider chip runs for the spell's whole duration, and nothing spends it
after one roll, so Guidance and Resistance are the two built-in spells whose
rider is wider than the printed rule. Each grants 1d4 to a single roll in
print, while here the chip stays until its duration runs out or the caster
stops concentrating. A check or a save rolled from the character sheet picks
the die up on its own, and so does every roll after it, so take the chip off
after the roll it paid for.

The list also includes utility spells with rules that exist only as prose:
Light, Mage Armor, Counterspell, and Revivify. These spells are common
enough that a GM notices when they are missing, and their effects stay in
the description text of each spell.

A few entries include a clause that the app cannot resolve beside a payload
that it can. Chill Touch deals its damage and leaves the no-healing clause to
the GM. Blindness/Deafness always blinds, because deafness has no rule
here. Flame Strike raises its fire dice at a higher slot, where the printed
spell offers a choice of two. Conjure Animals always summons wolves. The
description of each one states the difference.

## Spells that need a missing mechanic

Each omitted spell needs a mechanic that the app does not have yet, so
adding the spell today would print rules that the app cannot apply.

- **Spells that move a creature or spend its turn** (Slow, Banishment,
  Command, Dominate Person, Confusion). A failed save adds a condition chip,
  and that part works today: Hold Person, Hold Monster, Blindness/Deafness,
  Fear, and Sunburst all ship. The rest of each spell's text needs more,
  because Slow halves speed and cuts an action, Banishment removes the
  creature from the map, and Dominate Person hands control to the caster.
  None of movement, the action economy, or one creature driving another
  exists yet.
- **Lingering zones** (Web, Grease, Wall of Fire, Cloudkill, Moonbeam, Spirit
  Guardians). Area targeting lets the caster pick the creatures that the
  spell catches. A spell with `targetCount: 0` offers every reachable
  combatant, and the caster selects whoever the blast covers, which is how
  Fireball, Shatter, Circle of Death, and Fire Storm work. A cast resolves
  once, and the app has no map-geometry template, so nothing keeps a zone on
  the map after the cast ends.
- **Damage that repeats on later turns** (Acid Arrow, Witch Bolt, Phantasmal
  Killer, Sunbeam, Spiritual Weapon). One cast rolls one set of dice, and
  nothing rolls the spell again on the turns that follow.
- **A cast that resolves two mechanics at once** (Ray of Sickness, Vampiric
  Touch, Heroism). A spell has one effect, so a cast cannot roll an attack
  and a save together, and it cannot damage one creature and heal another.
- **Spells that read the hit points of a target** (Sleep, Color Spray, Power
  Word Kill). No effect kind compares a target's hit-point total against a
  threshold, so the cast cannot decide who the spell takes.
- **Buffs that change something other than a d20 roll** (Shield's +5 AC
  reaction, Haste's extra action, Enlarge/Reduce, Barkskin, Aid). A rider on
  a d20 roll works today: a chip can add or subtract dice and a flat amount
  on attack rolls, saving throws, and ability checks, which is how Bless,
  Bane, Guidance, and Resistance ship. A chip that changes AC, the action
  economy, the hit-point maximum, or a creature's size has nothing to hook.
- **Choosing a summon, and controlling it** (Find Familiar, Animate Dead).
  Summoning itself works today. A `summons` effect names one library creature
  template and a count, the cast puts those creatures on the tile of the
  party, and they leave when the caster stops concentrating on the spell. A
  cast cannot yet offer the caster a menu of templates, a summon takes its
  own turn as a combatant with no player running it as a companion, and a
  summon that no concentration maintains, such as an animated skeleton or a
  familiar, stays until the GM removes it by hand.
- **Exploration and social utility spells** (Detect Magic, Identify, Charm
  Person, Suggestion, Divination, teleportation). These spells have rules
  that exist only as prose, so they work today as `utility` entries. The
  built-in list omits them only to stay small, and a GM can add this
  category by hand more easily than any other.
- **Eldritch invocations** are not modeled, so the built-in list leaves out
  entries related to invocations beyond Eldritch Blast itself. Pact magic is
  modeled: a warlock casts from its own pact pool, not from the standard slot
  table.

## Adding a spell by hand

The built-in schema is identical to the schema for a GM-authored spell, so a
missing spell needs no code change. The Spells rail in Library mode creates
one, and a custom spell whose name matches a default replaces that default in
place. A library export (`campaign-library.json`) is portable, so a shared
file of extra spells merges into any browser.

Attack, save, heal, buff, summons, and utility effects, together with scaling
by slot level and by cantrip level, cover most of the mechanics in the SRD
today. A spell outside them works as a `utility` entry with its rules in the
description, and the GM adjudicates it by hand, the same way as at a
physical table. The [GM guide](gm-guide.md#add-a-missing-spell)
gives the steps.

When a mechanic lands, such as movement, a zone that outlives its cast, or an
effect that rolls again on a later turn, the spells that wait on it belong in
`src/data/spells.js`.
