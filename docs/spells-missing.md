---
---
# Curated spells and the full SRD

*Explanation. To add a spell of your own, follow the steps in the
[GM guide](gm-guide.md#add-a-missing-spell).*

The built-in spell list in `src/data/spells/` is a curated selection, and
most of it comes from the System Reference Document (SRD) 5.1. The SRD 5.1
lists 319 spells, and the app ships 111. Three built-in spells come from
outside the SRD: Witch Bolt, Ray of Sickness, and Destructive Wave appear
only in the Player's Handbook. Each shipped spell has rules that the spell
resolver applies in full, or a description that names the clause that the
resolver leaves to the GM.

## The built-in list

The list covers each spell level from cantrip to 9th level. It includes
spells for all six full caster classes: bard, cleric, druid, sorcerer,
warlock, and wizard. It also uses all six effect kinds that the resolver
handles: `attack`, `save`, `heal`, `buff`, `summons`, and `utility`.

The paladin and the ranger share leveled spells with the other classes. The
paladin also has Divine Favor and Destructive Wave, which comes from the
Player's Handbook. The ranger has Hunter's Mark.

| Level | Spells |
| ----- | ------ |
| Cantrip | Fire Bolt, Produce Flame, Ray of Frost, Shocking Grasp, Eldritch Blast, Sacred Flame, Vicious Mockery, Acid Splash, Poison Spray, Chill Touch, Resistance, Spare the Dying, Guidance, Mage Hand, Prestidigitation, Thaumaturgy, Druidcraft, Mending, Message, Minor Illusion, Dancing Lights, Light |
| 1st | Magic Missile, Burning Hands, Cure Wounds, Healing Word, Guiding Bolt, Faerie Fire, Bless, Bane, Hunter's Mark, Thunderwave, Inflict Wounds, Hellish Rebuke, Witch Bolt, Ray of Sickness, Sleep, Charm Person, Color Spray, Shield, Shield of Faith, Divine Favor, Protection from Evil and Good, Mage Armor, False Life, Heroism, Detect Magic, Disguise Self, Jump, Silent Image, Speak with Animals |
| 2nd | Scorching Ray, Hold Person, Lesser Restoration, Blindness/Deafness, Shatter, Prayer of Healing, Invisibility, Blur, Acid Arrow, Spiritual Weapon, Barkskin, Aid, Alter Self, Levitate |
| 3rd | Fireball, Lightning Bolt, Call Lightning, Revivify, Counterspell, Conjure Animals, Mass Healing Word, Fear, Hypnotic Pattern, Vampiric Touch, Protection from Energy, Haste, Bestow Curse, Slow, Speak with Dead |
| 4th | Ice Storm, Blight, Greater Invisibility, Stoneskin, Phantasmal Killer, Arcane Eye, Compulsion, Confusion, Polymorph |
| 5th | Cone of Cold, Greater Restoration, Raise Dead, Mass Cure Wounds, Flame Strike, Hold Monster, Destructive Wave, Conjure Elemental |
| 6th | Chain Lightning, Circle of Death, Disintegrate, Freezing Sphere, Sunbeam, Heal |
| 7th | Finger of Death, Fire Storm, Arcane Sword |
| 8th | Power Word Stun, Sunburst |
| 9th | Meteor Swarm, Power Word Kill, Weird |

The selection prefers spells whose rules the current mechanics resolve in
full. The resolver applies these rules:

- A d20 spell attack against AC. A melee spell attack gets the melee side
  of Prone and of an automatic critical hit, and some attacks deal half
  their damage on a miss.
- A condition that a spell attack's hit imposes, with or without a save
  against it, and a hit that gives the caster back part of the damage it
  deals.
- Several projectiles from one cast, each rolled on its own and split
  between the creatures that the caster picks.
- A save against the spell save DC of the caster, with damage that the save
  halves or negates.
- A rule that reads the current hit points of the target in place of a
  save. An HP pool reaches the creatures with the lowest HP first, and an
  HP limit fails the save with no roll. A failed save can kill outright.
- Dice of healing, or a flat amount of healing.
- A heal that stabilizes a dying character, as Spare the Dying does.
- A condition chip that adds a die or a flat amount to the later attack
  rolls, saving throws, or ability checks of the target.
- A condition chip for one of the eleven standard conditions that have
  rules. Such a chip gives advantage or disadvantage on later d20 rolls,
  makes a melee hit a critical hit, fails a save with no roll, or costs
  the holder its turn.
- A condition chip that a failed save imposes, with a new save at the end
  of each turn of the target.
- A group of summoned creatures from one library template, which stay while
  the caster maintains concentration.
- Damage that a hit or a failed save leaves on the target, rolled at the
  end of each of the target's turns. With a repeated save, the damage lands
  only when that save fails.
- A condition chip that ends at a turn boundary: the start or the end of
  the caster's next turn, or the end of the target's next turn.
- A chip that gives advantage or disadvantage on the attack rolls of its
  holder, or on attack rolls against its holder. A one-shot chip ends
  after the first attack roll it applies to, as Guiding Bolt and Vicious
  Mockery do.
- A spell that the caster uses again on each later turn while it lasts,
  with no new slot.
- A condition chip that ends when its holder takes damage.
- A condition chip that changes the AC of its holder: a flat bonus, a base
  AC for a holder without body armor, or a floor under the AC.
- A condition chip that raises the HP maximum of its holder, grants
  temporary hit points at the cast or at the start of each of its turns, or
  makes it immune to a condition.
- A condition chip that gives its holder resistance to damage types, with
  one type that the caster picks at the cast.
- A condition chip that gives its holder advantage on the saves of one
  ability, or an extra action on each of its turns for one weapon attack.
- Damage or effect scaling by spell slot level, and by caster level for
  cantrips. A spell can also scale once per two slot levels.

A *condition chip* is the label on a creature or a character that records a
condition, such as Blinded or Bless.

### One-roll and lasting riders

A *rider* is the die or the flat amount that a chip adds to later rolls.
Guidance and Resistance have a one-roll rider, as in the printed rules. The
first matching roll uses the die, and the app then removes the chip.
Guidance adds 1d4 to one ability check, and Resistance adds 1d4 to one
saving throw.

Bless and Bane have a lasting rider. The chip adds or subtracts 1d4 on each
attack roll and saving throw until its duration ends or the caster stops
concentrating.

### Later turns

Acid Arrow, Phantasmal Killer, and Weird leave a chip on the target. The chip deals
its damage at the end of the turns of that creature, and it ends at the
boundary that the spell names. Phantasmal Killer and Weird deal their damage
only when the repeated save fails, and a success ends the spell. Each caster's cast
has its own chip, so two Acid Arrows on one ogre both deal their later
damage, and a target that is already Frightened still takes the chip of
Phantasmal Killer.

Witch Bolt, Spiritual Weapon, Call Lightning, Sunbeam, and Arcane Sword
leave a chip on the caster, named after the spell. While the caster has that chip, a cast of the same spell
is a repeat. The dialog says Repeat, offers no slot, and costs the action or
bonus action that the spell names. A repeat of Witch Bolt deals 1d12 to the
creature that the first cast hit, with no roll. If the caster can also cast
the spell anew, the app first asks whether to repeat it or cast it anew
with a slot. A new cast can pick a new target and a higher slot, and it
replaces the chip of the old repeat.

A chip that ends at a turn boundary shows "next turn" in place of a round
count. Outside a fight there are no turns, so such a chip lasts one round.
The app deals later-turn damage only at the end of a turn in a fight, so an
Acid Arrow cast outside a fight deals no later damage, and the GM applies
it by hand. The end of a fight removes every chip that ends at a turn
boundary, and it first deals the later-turn damage that such a chip still
owes. A dying character takes that damage at the end of its turn, and each
hit costs it a failed death save.

### Two effects in one hit

Ray of Sickness rolls its attack first. A creature that it hits then makes a
CON save against the spell save DC of the caster, and on a failure it is
Poisoned until the end of the caster's next turn. The creature saves once,
even when several projectiles of one spell hit it.

Vampiric Touch gives the caster hit points equal to half the necrotic
damage that its hit deals. The app counts the damage after the resistances
of the target, so a hit on a creature that resists necrotic damage gives
back less. Vampiric Touch also repeats on each later turn, as Spiritual
Weapon does.

Chill Touch leaves a chip on the creature that it hits, and the creature
regains no hit points until the start of the next turn of the caster. A heal
from a spell or from the GM has no effect and the log says why, but
temporary hit points still land. An undead target also takes a second chip,
so it attacks the caster at disadvantage until the end of the next turn of
the caster. Its weapon attacks and spell attacks against other creatures
roll as usual.

### Creature types

A spell can name creature types in `effect.typeRules`. Sleep and Hold
Monster have no effect on undead, Hold Person and Charm Person affect only
humanoids, and the healing spells have no effect on
undead or constructs. Blight has no effect on undead or constructs, and a
plant saves at disadvantage and takes the maximum damage. Sunburst and
Sunbeam give undead and oozes disadvantage on the save. Sleep and Hypnotic
Pattern pass over a creature immune to Charmed. A party character
counts as humanoid. A creature with no type matches no rule, and it still
counts for an `only` list, so the GM decides whether the spell reaches it.

### Hit-point rules

Sleep and Color Spray roll a pool of hit points and roll no save. The app
sorts the chosen targets by current HP, lowest first. Each target whose HP
fits in what the pool has left takes the condition, and its HP comes out of
the pool. The pool passes over a target at 0 HP, an Unconscious target, and
a target that already has the condition of the spell. The log states the
pool roll, and for each target whether the pool reached it. These lines are
GM-only, because the pool total and the order of the walk bound the HP of
each foe. A Player tab reads the dice of the pool and whether each target
is affected, with no reason (see
[GM-only lines](architecture/combat.md#gm-only-lines)).

Sleep ends on a creature when that creature takes damage, including damage
that its temporary hit points absorb. The pool passes over an undead target
and a target immune to Charmed, and such a target spends none of the pool.
The app reads the creature type and the condition immunities of each
creature, and an untyped creature counts as neither. A creature that an ally
shakes awake loses its chip when the GM removes it.

Hypnotic Pattern rolls a WIS save for each creature in its area, and a
failure leaves an Incapacitated chip that ends when its holder takes damage,
as the chip of Sleep does. The Charmed condition of the spell has no rules
of its own in the app, so the chip names only the incapacitation.

Power Word Kill reads the current HP of the target. A target with 100 HP
or fewer dies with no roll, and one with more is unaffected. A creature
dies at 0 HP. A character dies through the death-save tracker, the same way
as a death from exhaustion, and keeps the HP that the GM tracks.

### Armor class

Shield of Faith gives its target +2 AC while the caster concentrates. Shield
gives its caster +5 AC until the start of the caster's next turn. Its range
is Self, so the cast dialog offers only the caster as the target. When an
attack roll hits a caster who has Shield ready, and the AC that Shield
really adds would turn the hit into a miss, the app pauses before the damage and asks whether the
caster casts it. A yes spends the reaction and the slot, and the app checks
the roll again against the new AC. A weapon swing and an attack spell both
pause, and Shield blocks every dart of Magic Missile, also when the target
already has Shield. The question goes
only to a tab that may act for the caster, so an attack that a player tab
rolls against a foe does not pause. The GM then casts the foe's Shield from
the reaction control of the combat screen, and undoes the damage by hand.

Mage Armor gives a character with no body armor a base AC of 13 plus its DEX
modifier, and a shield still adds to it. A higher base on the character
sheet, or a higher unarmored defense, wins. On a creature with no armor,
the spell raises a lower AC to 13 plus the DEX modifier. A creature has no
shield field, and its authored AC already includes any shield it carries,
so the spell drops the +2 of a shield that is part of that AC. A creature
with AC 12 from DEX 10 and a shield gets AC 13 and not 15, and the GM
applies the difference by hand. The chip stays when the holder puts armor
on, but it then changes nothing, and the GM removes it.

Barkskin sets a floor of 16 under the AC of its target. The floor applies
after every bonus, so Shield of Faith on a target with AC 12 gives AC 16,
not 18.

The character sheet, the combatant cards, and every attack roll read the
same AC, so each of them shows the change while the chip lasts.

### Hit points and immunity

Aid raises the HP maximum and the current HP of up to three creatures by 5,
and by 5 more for each slot level above 2nd. The raise goes into the stored
maximum, so the character sheet, the combatant cards, and every heal read
it with no extra step. When the chip ends, the maximum drops back, and
current HP drops only where it sits above the new maximum. A GM who types a
new maximum while Aid lasts types the raised value, and the end of the
spell still takes the 5 off. Aid on a character at 0 HP brings the
character back up with 5 HP.

Divine Favor and Hunter's Mark add damage dice to weapon hits. Divine Favor
adds 1d4 radiant to each weapon hit of its caster. Hunter's Mark puts a chip
on a foe, and each weapon hit of the caster against it adds 1d6 of the
weapon's damage type. A critical hit doubles both. When the marked foe drops
to 0 HP, the **Repeat (no slot)** cast moves the mark for a bonus action. The
GM checks that the old target dropped, and rules the advantage on Wisdom
checks to find the target. The longer duration of Hunter's Mark from a 3rd-level
or higher slot is text only, because the app has no duration scaling.

False Life gives its caster 1d4 + 4 temporary hit points, and 5 more for each
slot level above 1st. Heroism gives its target temporary hit points equal to
the spellcasting modifier of the caster at the start of each of its turns.
Temporary hit points never add up. A new grant replaces the old amount only
when it is larger, and the log says when it is not. The temporary hit
points of both spells end with the chip, and temporary hit points that the
GM types stay until damage uses them. A creature has temporary hit points
too, and damage takes them first.

Heroism also makes its target immune to Frightened. The cast ends a
Frightened chip that the target has, and a later spell that imposes
Frightened does not land. The log names the chip that blocks it. A chip that
the GM adds by hand still lands.

### Damage resistance

Stoneskin gives its target resistance to bludgeoning, piercing, and
slashing damage from a nonmagical weapon. A weapon counts as magical when
its item has the **Magical weapon** box ticked, and damage from a spell
always gets through.

Protection from Energy asks the caster for one damage type in the cast
dialog: acid, cold, fire, lightning, or thunder. The chip resists the
picked type until the spell ends. A spell of your own can offer the same
pick. Write a `resistChoice` list of damage types on its buff effect, and
the cast dialog offers those types.

Absorb Elements is not in the SRD, so the app does not ship it. To author
it, add a 1st-level spell with a reaction casting time and a `buff` effect.
Set **Caster picks one of** to acid, cold, fire, lightning, thunder, and set
the chip to end at the start of the caster's next turn. A weapon hit, a spell
attack hit, or a save spell that deals one of those types then offers the
reaction after its damage roll. The extra 1d6 on the caster's next melee hit
has no field, so add it by hand.

### Speed of action

Haste gives its target +2 AC, advantage on DEX saves, and an extra action on
each of its turns. The combat card counts one more weapon swing while the
chip lasts. The extra swing comes after the Attack action and the swings
that Extra Attack adds, or after an action spent on a cast. Nothing banks
behind it, so a fighter with Extra Attack gets three swings in a turn. The extra action can't pay for a cast. Dash, Disengage, Hide, and
Use an Object have no rule in the app, so the GM runs them. The doubled
speed has no rule either, because nothing moves a token by feet.

The advantage reads at every save that the app rolls: a spell's save, a
save that a chip retries at the end of a turn, a concentration save, and a
save from the character sheet. Restrained gives disadvantage on the same
save, so a restrained target under Haste rolls one die.

When Haste ends, the target gets a Lethargic chip, and the log notes that it
can't move or take actions until after its next turn. The chip ends at the
end of the next turn of the target, so it waits for two turn ends when Haste
ends during that turn. The turn pointer steps past a lethargic combatant,
and the chip does not break concentration. Every path that ends a chip
adds it: a turn boundary, a round tick, the end of the concentration of the
caster, a Haste from another caster that replaces the first, and a chip
that the GM removes by hand. Outside a fight the chip lasts one round.

### Spells described in prose

Twenty-five built-in spells have the `utility` effect kind. Their rules
exist only as text in the description of each spell, and the GM applies
them. Light, Counterspell, and eight cantrips are in the list because a GM
notices when a spell this common is missing. The cantrips sit in
`src/data/spells/cantrips.js`: Mage Hand, Prestidigitation, Thaumaturgy,
Druidcraft, Mending, Message, Minor Illusion, and Dancing Lights.

The other fifteen are in `src/data/spells/utility.js`: Detect Magic,
Disguise Self, Jump, Silent Image, Speak with Animals, Alter Self,
Levitate, Bestow Curse, Slow, Speak with Dead, Arcane Eye, Compulsion,
Confusion, Polymorph, and Conjure Elemental. The eldritch invocations of a
warlock cast most of them.

### Partial rules

Some entries have one clause that the app cannot resolve beside a payload
that it can. The description of each entry states the difference:

- Blindness/Deafness always blinds, because deafness has no rule in the
  app.
- Flame Strike raises its fire dice at a higher slot. The printed spell
  lets the caster choose the fire dice or the radiant dice.
- Destructive Wave always deals radiant damage beside its thunder. The
  Player's Handbook lets the caster pick radiant or necrotic.
- Conjure Animals always summons wolves: eight, doubled with a 5th-level
  slot, tripled with a 7th-level slot, and quadrupled with a 9th-level slot.
- Witch Bolt ends when the caster uses its action for something else, or
  when the target moves out of range. The GM ends it by hand.
- Spiritual Weapon and Arcane Sword move up to 20 feet before each attack.
  The GM tracks where each one is.
- Shatter gives disadvantage on the save to a creature of stone, crystal,
  or metal. No creature type marks such a creature, so the GM rolls that
  save by hand when the cast also catches other creatures.
- Fear lets a frightened creature retry the save only when it ends its turn
  out of line of sight of the caster. The app has no line of sight, so the
  chip has no automatic retry and the GM rolls it.
- Call Lightning deals 1d10 more when the caster takes control of a storm
  outdoors, and Produce Flame sheds light. The GM rules both.
- Ray of Frost, Shocking Grasp, and Thunderwave deal their damage. The GM
  applies the rest: the lost speed, the lost reactions, and the push.
- Protection from Evil and Good gives disadvantage only to an attacker whose
  creature type is on its list. The GM rules the charm, fright, and
  possession clause. Blur does not check for blindsight or truesight, and
  Faerie Fire does not cancel invisibility, so the GM rules both.
- Disintegrate turns a target at 0 HP to dust, and Finger of Death raises a
  slain humanoid as a zombie. The GM rules both.
- Revivify and Raise Dead raise only a dead target, and Raise Dead passes
  over undead. The GM checks that the target died within the last minute
  for Revivify, or within 10 days for Raise Dead. The GM also rules the
  -4 penalty that Raise Dead leaves, and the poisons and diseases it ends.
- Lesser Restoration ends a Blinded, Deafened, Paralyzed, or Poisoned chip,
  and the caster picks one when the target has more than one. Heal ends the
  Blinded and Deafened chips beside its 70 HP. The app tracks no diseases,
  so the GM ends a disease.
- Greater Restoration ends one level of exhaustion, or a Charmed, Petrified,
  or Bestow Curse chip. The GM rules a curse without a chip, an ability score
  reduction, and an HP maximum reduction.
- A restoration that ends a chip from a concentration spell leaves the
  caster concentrating.

## Spells that need a missing mechanic

Each omitted spell needs a mechanic that the app does not have. If the
list included such a spell, it would print rules that the app cannot
apply.

### Movement and turn control

Examples: Banishment, Command, and Dominate Person. Slow and Confusion ship
as prose entries (see [Spells described in prose](#spells-described-in-prose)),
and their rules need the mechanics below.

A failed save can add a condition chip, and this part works. Hold Person,
Hold Monster, Blindness/Deafness, Fear, and Sunburst all ship. The other
clauses of these spells need more:

- Slow halves the speed of the target, but no rule moves a token by feet,
  so speed has no effect in a fight.
- Slow also takes away an action. The combat screen tracks the action, the
  bonus action, and the reaction of each turn. A chip can add an action, as
  Haste does, but no chip takes one away.
- Banishment removes the creature from the map.
- Dominate Person gives control of one creature to another.

### Lingering zones

Examples: Web, Grease, Wall of Fire, Cloudkill, Moonbeam, and Spirit
Guardians.

Area targeting lets the caster pick the creatures that the spell hits. A
spell with `targetCount: 0` offers every reachable combatant, and the
caster selects each creature in the area. Fireball, Shatter, Circle of
Death, and Fire Storm work this way.

A cast resolves once, and the app has no template for map areas. So no
rule maintains a zone on the map after the cast.

### Buffs outside d20 rolls

Examples: Enlarge/Reduce.

A rider on a d20 roll works. A chip can add or subtract dice and a flat
amount on attack rolls, saving throws, and ability checks, as Bless, Bane,
Guidance, and Resistance do. A chip can also change AC, as Shield and
Barkskin do, and hit points, as Aid, False Life, and Heroism do. A chip can
give an extra action, as Haste does, and slant attack rolls, as Faerie Fire
and Blur do. The size of a creature has no rule, so
a chip can't change it.

### Summon choice and control

Examples: Find Familiar and Animate Dead.

Summoning works. A `summons` effect names one library creature template
and a count. The cast puts those creatures on the tile of the party, and
they leave when the caster stops concentrating on the spell.

The app does not have these parts:

- A menu of templates for the caster to choose from.
- A summon that a player runs as a companion. A summon takes its own turn
  as a combatant.
- A summon that doesn't require concentration, such as an animated skeleton or a
  familiar. Such a summon stays until the GM removes it by hand.

### Exploration and social spells

Examples: Identify, Suggestion, Divination, and
teleportation.

These spells have rules that exist only as text, so they work as `utility`
entries. The built-in list leaves them out only to stay small. A GM can add
spells of this group by hand with the least work of any group.

### Eldritch invocations

The app models the SRD eldritch invocations of the warlock. The ones that
change Eldritch Blast, cast a spell, or grant skills have rules in the app,
and the rest, such as Devil's Sight, are text for the GM. The
[GM reference](gm-reference.md#eldritch-invocations) lists each effect and
the rules that the GM enforces. The app models the Book of Shadows of the
Pact of the Tome, with its cantrips from any class and the rituals of Book
of Ancient Secrets, and the Mystic Arcanum. It does not model the pact
weapon or the familiar of a boon.
Pact magic is modeled, so a warlock casts from its own pact pool and not
from the standard slot table.

## Adding a spell by hand

A built-in spell and a GM-authored spell use the same schema, so a missing
spell needs no code change. The Spells rail in Library mode creates a
spell. A custom spell whose name matches a default replaces that default.

A library export, `campaign-library.json`, is portable. A shared file of
extra spells merges into the library of any browser.

The `attack`, `save`, `heal`, `buff`, `summons`, and `utility` effects,
with scaling by slot level and by cantrip level, cover most mechanics in
the SRD. A spell outside them works as a `utility` entry with its rules in
the description. The GM applies those rules by hand, as at a physical
table. The [GM guide](gm-guide.md#add-a-missing-spell) gives the steps.

A new mechanic, such as movement or a lasting zone, lets the list grow. Add the spells that need the
mechanic to the level file under `src/data/spells/` in the same change.
