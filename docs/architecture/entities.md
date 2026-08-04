# Entities

*Explanation. Back to the [architecture overview](../architecture.md).*

`src/entities/` holds the things that a campaign's rules operate on:
creatures, resource pools, and characters. They all follow one update style.
This page describes that style first, then the creature, then the character
model, which is the largest of them.

## The shared shape: immutable updates

`entities/Creature.js`, `entities/Resource.js`, and `entities/Character.js`
(types in `src/types/creature.ts` and `src/types/entities.ts`) are all plain
immutable-update modules. Each function takes a value and returns a new
value. It does not change the original:

```js
const hurt   = applyDamage(creature, 7);    // new creature, old one untouched
const rested = restore(pool, 2);            // new resource pool
const leveled = addXP(character, 250);      // new character
```

`TileGrid.js` uses the same style for tiles (`setTile`,
`updateTileMetadata`). This style lets the app cache derived data against
object identity. A value that the app already returned never changes under
a cache.

The models include these behaviors directly. They do not validate the
behaviors separately:

- HP and resource pools clamp to `[0, max]` on every operation. No caller
  can overheal or drive HP negative.
- `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops
  internally. One large XP award can cross several level thresholds in a
  single call.
- `Character.js` looks up a character's resources and inventory by id.
  `spendResource` and `restoreResource` delegate to the matching
  `ResourcePool` through `Resource.js`. `addItem` and `removeItem` merge or
  split inventory stacks by item id, and each stack drops once its quantity
  reaches 0.

### Reserved resource pools

HP, spell slots, pact slots, and hit dice are not special-cased types. They are
ordinary `ResourcePool`s under ids that the app reserves. Spending a spell slot
and spending an arrow run through the same `spend`/`restore` code.
`entities/PoolIds.js` holds those ids (`hp`, the `slots-`/`pact-` prefixes, the
`hit-dice-d` prefix) and imports nothing. The three modules that own the rules
for them, `Character.js`, `SpellSlots.js`, and `HitDice.js`, can all read the
same string no matter where they sit in the import graph. Each module
re-exports the ids that it owns, so `HP_RESOURCE_ID` is still imported from
`Character.js`.

A pool is reserved when its maximum is derived rather than typed in. The
deriving writers move a maximum through `Resource.js`:

- `adjustMax(pool, max)` moves the maximum and carries the current value by
  the same amount. A CON increase grants the hit points instead of only
  raising the ceiling. This is the re-derive rule (`HitDice.reconcileMaxHP`,
  `addXP`).
- `growMax(pool, max)` carries a gain but never refunds a loss. A level-up
  hands over new slots unspent, but losing capacity does not un-spend a die.
  This is the keep-what-is-spent rule (`syncSlotsToLevel`, `syncHitDice`).
- `spliceReservedPools(resources, next, owns, after?)` swaps a whole family of
  pools for a freshly derived set. It puts the new set back where the first
  pool sat, so the order that the resource card reads in stays the same. When
  no pool of the family is present, it follows the pools named by `after`.

`Roster.js`'s `updateById(list, id, fn)` is the matching helper for the by-id
patch. The resource and inventory writers used to each spell out that patch
inline.

## The creature

`entities/Creature.js` and `entities/CreatureMap.js` (types in
`src/types/creature.ts`) hold the one model for everything the party can meet
on the map. One `Creature` covers a foe, a townsperson, and anything between.
The `disposition` field decides its side in a fight. A hostile creature
fights the party. Every other creature stands with the party. The state holds
one `creatures` list, and every combat, map, and story surface reads it.

A creature carries `maxHP`, `currentHP`, a `stats` block, a `weapon`, an
`armor`, `conditions`, a `location`, and a `met` flag. `level` and `tier` are
optional authoring inputs. They pick the default stats and gear for a new foe.
A townsperson has no level.

The gear rule is explicit. `createCreature` resolves the weapon and the armor
once, at creation. An absent value takes the level default when the creature
has a level. It takes null when the creature has none. A stored null means
unarmed or unarmored on purpose. `withDefaults` backfills gear to null only.
No read path derives gear from the level again, so an absent field has one
meaning everywhere.

`isCreature(entity)` tells a creature from a character: a creature always
carries a `disposition`, and a character never does. Every consumer that must
tell the two apart reads this one test.

`effectiveStatBlock(creature)` is the one AC read: the closed stat block, plus
the `acBonus` of the worn armor, plus every active timed stat modifier.
`CreatureMap.js` holds the placement reads. `meetCreatures` marks every
creature on the party's tile as met. `knownCreaturesAt` is the player view of
the non-hostile roster. `discoveredHostiles` is the player view of the hostile
roster, through the fog of war. `fromTemplate` reads older template shapes on
purpose, because a library file has no version field.

Every creature follows the same combat rules. `maxHP` defaults to 4, the 5e
commoner, and hit points are never absent. 0 HP is defeat with no death
saves, which only characters roll. `isCreature` is what the combat code
branches on, so a character and a creature never convert into each other.

The authoring side still has two dialogs over one model. `app/npcFields.js`
describes the townsperson fields, and `app/encounterFields.js` describes the
foe fields. Both write `state.creatures` through `createCreature` and
`editCreature`. The fields are the same `STAT_KEYS` inputs and the same gear
pickers (`app/gearFields.js`). Only the gear fallback differs.
`readEncounterFields` falls back to the default loadout of the tier.
`readNPCFields` passes no fallback, so an empty picker means unarmed.

## The character foundation

Beyond its stats and inventory, a `Character` carries a class list, a race, a
background, proficiency lists, hit dice, and a level-up flow. Each of these is
a pure module beside `Character.js`. Each follows the same
take-a-value-return-a-value shape.

```
  data catalogs (plain data, no logic)
    data/classes.js      hit die, proficiencies, skill choices, caster type,
                         subclass level, ASI levels, features-by-level
    data/races.js        races and their traits
    data/backgrounds.js  backgrounds
    data/skills.js       the 18 skills' abilities
          |
          v
  entity modules (pure logic over character values)
    Classes.js           caster surface: spellSaveDC, spellAttackBonus,
                         cantrip/prepared limits
    Multiclass.js        the class-list accessor (see below)
    Races.js             resolveRace: catalog first, stored snapshot fallback
    Backgrounds.js       resolve a stored id to its definition
    Proficiencies.js     assemble + edit the six proficiency lists
    HitDice.js           max HP derivation, hit dice as resource pools
    LevelUp.js           pending levels, ASI/feat choices
    LevelAssign.js       commit a pending level to a class
          |
          v
    Character.js         the character value itself; withDefaults is the
                         load-time migration point
```

The split matters when you look for something. The catalogs hold what a class
or race *is*. The entity modules hold what happens when a character *has*
one. The catalogs' shapes are declared in `types/class.ts` and `types/race.ts`.

### Classes and multiclassing

`entities/Multiclass.js` is the class-list accessor. `getClasses` returns the
memberships. It folds an older save's scalar `class`/`subclass` fields into a
one-entry list at read time. `withClasses` sanitizes writes, and
`primaryClass`, `classLevelOf`, and `pendingLevels` read across the list.
Everything class-aware goes through this accessor rather than touching
`character.classes` directly. This is what keeps the single-class and
multiclass paths identical: a fighter is a character whose class list has one
entry.

`entities/Races.js` and `entities/Backgrounds.js` resolve a stored id to its
definition. `resolveRace` prefers the live catalog and falls back to a stored
`raceTraits` snapshot, so a hand-typed or since-deleted race still round-trips.

### Proficiencies

`entities/Proficiencies.js` assembles the seven proficiency lists from class,
race, and background (`assembleProficiencies`). It applies or hand-edits them
with `withProficiencies`, and it sets the expertise list on its own with
`withExpertise`. Both writers run `normalizeProficiencies`, which is the one
place that deduplicates the lists and cuts expertise down to the skills the
character is actually proficient in. Expertise doubles a proficiency, so it
cannot exist without one, and no writer has to remember to prune. A patch that
names no expertise keeps whatever the character already had, so editing the
tool list does not clear a player's picks.

Expertise used to sit beside the lists as `Character.expertise`. A save written
that way loads with it folded inside, so no migration step is involved. The
`isProficient*` and `hasExpertise` predicates return `false` for a legacy
character with no lists at all.

### Hit points and hit dice

`entities/HitDice.js` derives max HP from the class hit die plus the CON
modifier per level (`classMaxHP`, the 5e average rule). It also models hit
dice as spendable resource pools sized to the assigned class levels.
`withHitDice` creates them, `syncHitDice` re-derives them while it keeps the
spent count, and `spendHitDie` heals on a short rest.

### Leveling up

`entities/LevelUp.js` and `entities/LevelAssign.js` run the level-up flow.
`addXP` leaves each earned level *pending* for a classed character rather than
applying it silently. `assignLevel` commits a pending level to a chosen class:
it grows HP, adds a hit die, and advances spell slots. Crossing a class ASI
level leaves a pending improvement, spent later by `applyASI` or `takeFeat`. A
choice is stored against the class and class level that earned it (`slotKey`
builds that key), so a slot can hold at most one choice. Each choice also
carries the order in which the player made it, for `undoLastChoice` to read.

`LevelAssign.js` also builds the picks that the assign dialog offers.
`assignOptions(character)` lists every held class one level up and every new
class that the prerequisites allow. It then appends the classes that the
character cannot take, as disabled entries that name what they want. The
requirement quoted is the new class's own, unless the block is a held class
whose prerequisite has since been lost. 5e gates leaving a class the same way
as entering one. `prereqText` writes that phrasing ("STR 13 or DEX 13"), and
`className` resolves a class id for display.

### Loading old saves

`entities/Character.js`'s `withDefaults` is the one load-time migration point.
It folds all of the above onto an older save. A legacy scalar class becomes a
list, a missing proficiency scaffold is created empty, and a race string is
preserved. `campaign/Campaigns.js` maps every loaded character through it.

## Damage terms

A weapon's damage and a spell's damage or healing are the same thing: a list
of `DamagePart`s. Each part rolls `count` dice of `sides` in a damage type,
plus an optional flat `bonus` that rides that term (Magic Missile's `1d4+1`).
An absent bonus means no bonus, so a term written before the field existed
needs no repair. `Equipment.normalizeDamagePart` is the single validator. It
decides how a term with a bonus and a term without one are each repaired:

- A term that carries a bonus can roll no dice. This is how the app writes a
  fixed amount with no dice behind it (Revivify's one hit point). A term
  without a bonus always rolls at least one die, so a garbled count reads as
  `1` rather than as an empty term.
- The app stores the bonus only when it is nonzero. This keeps an unbonused
  term identical to what it was before.

The validator also takes the vocabulary of types that a term can carry, and it
defaults to the 13 damage types. Healing is not one of them, because a weapon
must not be able to deal it. A spell's restorative dice normalize against
`HEALING_TYPES` instead, and the authoring form pins them to that one type
rather than offering a picker. Validating healing dice against the damage list
used to rewrite a heal spell's dice as slashing whenever a GM edited or
imported it.

`DiceRoller.rollDamage` groups terms by damage type and adds each term's bonus
to its own group. The `modifier` argument (the attacker's ability modifier)
joins the first group only, per 5e. Both land in one `bonus` number per group,
so a readout shows `7 slashing [2,3 +2]` rather than two separate signs.
Doubling a term on a critical hit multiplies its dice and leaves its bonus
alone. This is what the callers in `weaponAttack.js` and `Casting.js` already
do by touching `count`. No group can go below zero, so a negative rider
cannot heal.

`damageReadout` builds the `text` and `detail` lines from those groups.
`Casting.js`'s projectile merge reuses it, so a hit that carries three darts
reads like a single roll.

## Spell timing

A `Spell` (`types/spell.ts`) lives in the library rather than in a campaign
save, so it has no version number and no migration chain. See
[Persistence](persistence.md) for how the library merges. This is why the
app reads its two timing fields, `castingTime` and `duration`, rather than
assuming them.

Both are structured values, not text. A `castingTime` is a kind (`action`,
`bonus`, `reaction`, `minutes`, `hours`) with an amount for the counted kinds
and a trigger clause for a reaction. A `duration` is a kind
(`instantaneous`, `rounds`, `minutes`, `hours`, `days`, `until-dispelled`) with
an amount and an `upTo` flag for a duration that the caster can end early.
`entities/SpellTiming.js` holds four functions over them:

- `parseCastingTime` and `parseDuration` accept either the structured object
  or the printed string that an older library or a hand-written JSON file
  carries, such as `1 bonus action`, `10 minutes`, or `Concentration, up to 1
  minute`. The parsers drop a `Concentration, ` prefix, because the spell
  already carries `concentration` as its own flag. Anything that neither
  parser can classify becomes `{ kind: 'special', text }`, so the app never
  discards a phrase that a GM typed.
- `formatCastingTime` and `formatDuration` turn a value back into the printed
  phrasing that the detail modal shows. Pass `concentration` to
  `formatDuration` to get the SRD's own `Concentration, up to 1 minute`
  wording back.
- `durationInRounds` converts a duration into a round count. This is what
  puts a timer on a condition that a spell imposes. Days and open-ended
  durations return null, so the GM must clear the chip by hand.

The authoring form and the library normalizer both route their raw values
through the parsers. This means that a spell typed into the Library rail and
one imported from a file are validated by the same code.

## Multi-projectile spells

Scorching Ray, Eldritch Blast, and Magic Missile each fire several
projectiles from one cast, and each projectile rolls on its own. An attack
effect states this with `projectiles: { count, perStep?, autoHit? }`. Its
presence changes what the effect's `damage` means: what one projectile deals,
rather than what the whole cast deals. An effect without the field rolls
once, the same as every other attack spell, so nothing needed migration when
the field was added.

`entities/Casting.js` owns the rules over it:

- `projectileCount(effect, steps)` returns `count` plus `perStep` for each
  scaling increment. These increments are the same ones that damage scaling
  uses: a slot level above the spell's own for a leveled spell, or a cantrip
  breakpoint for a cantrip. `maxTargets` returns this value for a projectile
  spell, because a creature cannot be picked without a projectile to send at
  it.
- `allocateProjectiles(targets, count)` decides how many projectiles each
  target catches. A target that carries `projectiles` states its own share,
  clamped in order so the total never exceeds what the spell fires. With
  nothing stated, the projectiles spread as evenly as possible, which puts
  all of them on the single target in the common case.
- Resolution rolls one attack per projectile: its own d20, its own critical
  hit that doubles only its own dice, or no roll at all when `autoHit` is
  set. It then merges the damage per target, so a creature caught by two rays
  takes one hit that carries both. The outcome keeps each projectile's roll
  under `shots`, plus `fired` and `hits`, which lets the log read `2 of 3 hit
  Grelka`.

The cast dialog offers the allocation grid instead of target checkboxes for
these spells, because a checkbox cannot say "two rays here, one there". The
grid also works as the target picker: a creature allocated no projectile is
not a target. Its total is how many projectiles the cast fires at the level
being cast. The total updates whenever the slot picker changes, so the GM is
never offered a projectile that the cast cannot fire.

## Material components

A spell's `components` list carries the component letters, such as
`['V', 'S', 'M']`. Those letters alone cannot express what the material is,
what it costs, or whether casting the spell destroys it. A spell that needs a
material describes it in `materials: { text, costGP?, consumed }`. Most
spells carry no such block, which is why the field is optional rather than
migrated in: Revivify names its diamonds, and Fire Bolt has nothing to name.

Both `consumed` and `costGP` change what happens at the table.
`Casting.materialCheck(caster, spell)` applies the rule and returns
`{ required, satisfied, item, consumes }`: whether the caster must hold the
material, whether a stack of it is there, which stack it is, and whether the
cast spends it.

A material that the cast destroys must be in the inventory. So must one that
carries a gp cost, because a pouch and a focus never cover a priced
component. Anything else is covered, but only while the caster carries a
component pouch or a spellcasting focus. A caster with neither holds the
printed material itself.

`required` and `consumes` are separate answers, because holding a material is
not the same as spending it. Revivify's diamonds are destroyed and come off
the stack. Chromatic Orb's 50 gp diamond has to be in hand and stays there.

An item is a pouch or a focus when it sets `spellFocus`. The flag is the only
signal, so a stack that a GM named "Component Pouch" without ticking the box
is ordinary gear. `Equipment.isSpellFocus(item)` and
`Equipment.carriesSpellFocus(inventory)` read it. `GEAR_PRESETS` ships four
flagged entries (a component pouch and an arcane, druidic, and holy focus),
and the item form offers the checkbox on every item type, because a staff is
an arcane focus and an amulet is a holy symbol. Carrying the focus is enough.
The app does not track which hand is free, and gear has no equipment slot.

Matching a printed phrase against a stack name is inexact by nature, so the
comparison is case-insensitive and runs in both directions: a stack named
`Diamond` covers `diamonds worth 300 gp`. A material with no printed text
names nothing to look for and is never required. A creature has no
inventory at all, and the app never asks it for a component.

`app/spellCast.js` acts on the result. A cast whose material is missing stops
before `castSpell` runs, which keeps a refused cast from spending a slot. The
refusal names the missing material, or the missing pouch, whichever is the
cheaper fix. A cast that succeeds takes one item from the stack, but only
when `consumes` is true, in the same write-back that stores the spent slot,
and reports it through `InventoryLog`'s `use` verb. The cast dialog also
offers an "Ignore components" checkbox, which skips both the check and the
consumption, for tables that treat components as flavor.

`normalizeSpell` adds the `M` letter to any entry that names a material
without listing it, because the authoring form shows the material fields only
under a ticked M. If the app skips this repair, an imported spell loses its
material the first time a GM edits it. The app reads `costGP` only as the
signal that a focus cannot cover the component. It never charges the party
for it, because nothing in the app tracks how much money a party has.

## Ritual casting

A ritual cast takes ten minutes longer than normal and spends no spell slot.
It needs both halves of the rule: the spell carries `ritual: true`, and the
caster has a class with the ritual-casting feature. `data/classes.js` marks
that feature on bard, cleric, druid, and wizard.
`Classes.hasRitualCasting(character)` is true when any of the character's
caster classes has it.

`Casting.castSpell` takes `{ ritual: true }`. The cast resolves at the
spell's own level, because there is no slot to upcast from, and returns
`spent: false` with the caster value unchanged. Asking for a ritual cast of a
spell that has no ritual, or of a cantrip, returns
`{ ok: false, reason: 'not-ritual' }`.

The cast dialog offers a "Cast as ritual" checkbox when both halves line up.
Ticking it hides the slot picker. For a caster with no slots left, a ritual
is the one cast still available, so the dialog drops the slot picker rather
than refusing to open, and the box starts ticked.

The game clock divides a day into six named watches of four hours each
(`time/GameClock.js`), so it cannot represent ten minutes, and a ritual does
not advance it. The session log states the extra time instead
(`casts Detect Magic as a ritual (10 minutes longer)`), and the GM adjudicates
it.

In 5e, a wizard can also ritual-cast a spell from the spellbook without
preparing it. `canCast` requires a prepared caster's spell to be prepared,
ritual or not, so the app does not yet support this piece of the rule. No
built-in spell in `src/data/spells.js` is a ritual either, so the flag
currently serves only GM-authored and imported spells. See
[the curated-spells note](../spells-missing.md) for what the built-in list
covers.

## Known and prepared casters

Each caster class manages its leveled spells in one of two ways, and
`data/classes.js` records which as `knownRule`. A *prepared* caster (cleric,
druid, paladin, wizard) keeps a wider book and readies a daily subset. Only
the spellbook's `prepared` list is castable, and `Classes.preparedLimit` caps
it at the spell-ability modifier plus class level, per prepared-rule class. A
*known* caster (bard, ranger, sorcerer, warlock) casts everything it knows.
The `known` list is castable directly, and there is no prepare step at all.
Cantrips sit outside this distinction in their own list.

`SpellView.spellRule(character, spellId)` answers which rule governs a spell.
It uses the rule of the class that the character learned the spell under
(the spellbook's `sources` map), falls back to the first caster class when no
source was recorded, and falls back to `'known'` when even that is missing,
so a legacy character keeps casting what it knows. `isSpellCastable` and
`castableLeveledIds` apply the rule, and `Casting.canCast` delegates to them.
This means that the cast validator, the sheet's spell section, and the
combat screen's action bar all agree on what is castable.

The Spellbook tab follows the same rule. Prepare and Unprepare actions and
the prepared count appear only for a character with a prepared-rule class
(`Classes.hasPreparedCaster`). A known caster's entries show Learn and Forget
alone. A multiclass character mixes the two rules per spell, and each learned
spell follows its own class's rule.

Creature casters are not affected. Their authoring dialogs stamp every
picked leveled spell into both `known` and `prepared` (`spellbookFromIds`),
so whichever list their class reads, the whole picked set stays castable.

Known casters have no spells-known cap, because the app does not model a
per-level spells-known curve. Prepared casters swap their list freely,
rather than only on a long rest.

## Saving throws

`entities/Checks.js` holds both halves of a save. `saveBonus(character, ability)`
returns what a character adds: the ability modifier taken from the
equipment-adjusted scores, plus the proficiency bonus when the class granted
that save. `resolveSave(bonus, dc, { mode, rng, conditions })` rolls one d20
through the shared dice roller and reports
`{ roll, total, dc, natural, success, rider }`. It succeeds on a tie with the
DC. `savingThrow(character, ability, dc, opts)` composes the two functions and
adds `proficient`, so a readout can state why the number is what it is.
`conditions` are the chips the roller holds; see
[Riders on later rolls](#riders-on-later-rolls) below.

The two entry points exist because a character does not always roll a save.
`Casting.js`'s save effect resolves every target through `resolveSave`, and
its targets can be creatures, which record no ability scores in a
character's shape and carry no proficiency lists. The resolver therefore
takes a bonus that the caller worked out, and only the character path goes
through `saveBonus`.

The cast dialog reflects that split. `app/combatants.js`'s `targetSaveBonus`
returns a derived bonus for a party character and nothing for a foe.
`app/spellCast.js` decorates a save spell's targets with whatever comes back,
shows it in the target picker (`Rook (WIS +6)`, in place of the AC that a
save never reads), and asks for one hand-entered number to cover the targets
that have none. When every target carries its own bonus, the app leaves the
field out. The session log names the bonus beside the roll, matching how a
weapon attack's log names the ability and proficiency behind its total.

A natural 1 and a natural 20 are ordinary results on a save, unlike on an
attack roll, so the app reports `natural` for the log rather than acting on
it.

Ability checks work the same way. `checkBonus` is the ability modifier plus the
proficiency bonus for a skill the character is proficient in, doubled where the
character has expertise. `checkAbility` says which ability a key rolls: a skill
id resolves through `data/skills.js`, and one of the six ability keys stands for
itself, which is how a bare Strength check works. `resolveCheck` and
`abilityCheck` mirror the two save entry points, and the DC is nullable, because
a GM often calls for a check with no number in mind and reads the total out
loud. `passiveScore` is 10 plus a bonus, plus or minus 5 for advantage or
disadvantage, and `passivePerception` applies it to the Perception bonus.

`ui/CharacterChecks.js` puts the six saves and the 18 skills on the sheet, with
a training dot that reads hollow, solid, or ringed for untrained, proficient, or
expertise, and passive Perception under the skills. A row is a button when the
host wires `onCheck`, and a plain line otherwise, which is a spectator's sheet.
`app/checkRolls.js` is that handler. It takes the bonus from the pure helpers,
rolls the rider dice, and hands one flat modifier to the dice tray, so the tray
throws the only d20 and the log line breaks the number back down. A sheet roll
carries no DC.

Expertise is a GM grant. The Progression section of the sheet lists it and
offers a multiselect over the character's proficient skills, which commits
through `Progression.withExpertise`. No class feature grants it yet. A
creature carries no proficiency lists, so its bonus is still whatever the GM
types.

## Concentration

Many spells last only as long as the caster keeps concentrating on them, and
a caster holds only one at a time. `entities/Concentration.js` models this
over a `concentration` field on the character. The field holds the spell's
id and name, the level it was cast at, and `remaining`, the rounds left. A
character holding nothing has this field set to null.

- `begin(character, spell, slotLevel)` starts one. It takes `remaining` from
  the spell's duration through `durationInRounds`. A duration that no round
  counter fits, such as open-ended or measured in days, reads null and lasts
  until something breaks it. Beginning a second spell ends the first. The
  displaced spell comes back in `dropped`, so the caller can state what was
  lost and clear its effects.
- `drop(character)` ends concentration, however it ended.
- `concentrationDC(damage)` is 10, or half the damage when that amount is
  more. `checkOnDamage(character, damage, opts)` rolls the CON save against
  it through `savingThrow`, and drops the spell on a failure. It reports the
  whole save, so the log can carry the DC and the roll behind the outcome.
- `tick(character)` spends one round of the duration and reports `expired`
  when the duration runs out.

The `Concentrating` chip beside the state is a display element only. `begin`
writes it, `drop` removes it, and `tick` rewrites its counter from
`remaining` rather than decrementing it. This lets the round wrap run the
shared `tickConditions` over the same list first: whatever that function did
to the chip, the number the GM reads afterward is the state's own.
`Conditions.js` exports the chip's name as `CONCENTRATING`, so the two
modules agree on the spelling.

`app/spellCast.js` begins concentration when a cast of a concentration spell
succeeds. It writes this onto the same entity that the spent slot and the
consumed component are written to, so one store call carries all three.
`app/combatants.js`'s `applyToTarget` calls for the save on damage. This
covers weapon hits and spell damage alike, because both arrive through this
function. A character knocked to 0 HP loses the spell outright without
rolling. The round wrap in `app/encounterWiring.js` ticks the duration and
logs a spell that ran out.

Only characters concentrate. A creature has no field to write, so a foe's
concentration is still a chip that the GM adds and removes by
hand. This is why `Concentrating` stays in the pick-list. The character
sheet's `-1 HP` button is bookkeeping rather than a damage event, so it
calls for no save. Damage that must test concentration goes through an
attack or a cast.

## Death saves

A party character at 0 HP is not dead yet. It rolls death saves until three
succeed or three fail. `entities/DeathSaves.js` models this over a
`deathSaves` field on the character, which holds `successes`, `failures`, and
`stable`. A character who is not dying has this field set to null.

- `isDying`, `isStable`, and `isDead` read the four positions apart: standing,
  rolling, out of danger at 0 HP, and killed by three failures.
- `dropToDying(character)` starts the tracker. A second call on a character
  who already holds one changes nothing, so the failures already rolled
  survive.
- `clearDying(character)` takes the tracker away, which is what a heal above 0
  HP and a natural 20 both do.
- `stabilize(character)` sets `stable` and resets the counters. The character
  stays at 0 HP and stays unconscious. A dead character cannot be stabilized.
- `judgeDeathSave(state, roll)` maps one rolled d20 to the next tracker state
  and names the outcome: `revive`, `success`, `stable`, `failure`, or `dead`.
- `rollDeathSave(character, opts)` rolls the save and applies the outcome. It
  is the headless path, for tests and for callers with no dice tray.
- `recordDamage(character, { crit })` is damage on a character already at 0 HP.

The DC is a flat 10. A natural 20 revives the character at 1 HP, whatever the
counters hold. A natural 1 counts as two failures, and it fails even when a
rider pushes the total past the DC. Otherwise the total beats the DC on a tie,
as every other save does.

The roll goes through `Checks.resolveSave` with a bonus of 0, because a death
save adds no ability modifier and no proficiency. Going through that function
is what lets a rider such as Bless reach the roll. No ability key is passed, so
the automatic failure that unconsciousness imposes on Strength and Dexterity
saves does not catch a death save.

A heal above 0 HP clears the tracker whatever it held, a dead one included.
Nothing else brings a dead character back, so this is the GM's way of deciding
that the death did not stand. That rule lives in `Character.restoreResource`,
because that is the one function every heal in the app goes through: the combat
screen's heal control, the sheet's HP stepper, a healing spell, and a rest. A
character standing at 5 HP can therefore never still read as dying.

Two rules skip the roll. Damage on a character who is already at 0 HP is an
automatic failure, and a critical hit counts as two. Damage on a stable
character makes it dying again, with that failure against it, which is the 2014
rule. The hit that drops the character to 0 HP in the first place costs no
failure. Damage large enough for instant death is out of scope.

`Unconscious` goes on with the tracker and comes off with it, so no caller must
remember both halves. `Conditions.js` exports the chip's name as `UNCONSCIOUS`.
That chip is what gives an attacker advantage and a melee hit an automatic
crit, through the condition-effect table below, so the crit rule needs no
special case here.

`app/combatants.js`'s `applyToTarget` drives all of this, in `foldDeathSaves`.
Every hit and every heal arrives through that one function, so the three cases
(the drop to 0, a hit while down, and a heal back above 0) are decided in one
place. The consequence folds into the same write as the HP change.
`applyToTarget` takes `opts.crit` for the doubled failure, and
`app/weaponAttack.js` passes it. Spell damage does not crit here and leaves it
off.

The roll itself comes from a button, on the combat screen's active column and
on the character sheet, not from the turn advance. `retryImposedSaves`
auto-rolls bookkeeping saves, but a death save is the player's roll, and the
dice-tray convention wants a throw that somebody asked for.
`app/deathSaves.js` owns both controls. It follows the split that
`app/checkRolls.js` describes: the riders roll app-side, the tray throws the
only d20, and `judgeDeathSave` reads the result. Going through the tray is why
this path does not call `rollDeathSave`, which would throw a second d20.

`view/DeathSaveView.js` turns one tracker into the words and the pip counts a
surface draws, and `ui/DeathSaveBlock.js` builds the line from it. The combat
screen and the character sheet both call that builder, so neither can describe
the same state differently. `CombatantRow.deathSaves` carries the tracker onto
the board, where a card shows a Dying, Stable, or Dead chip beside its
conditions.

Only characters roll death saves. A creature is defeated at 0 HP.

## Conditions a spell imposed

A failed save against a spell can leave the target with a condition, and
that chip records where it came from. `Condition.source` carries the spell's
id and name, the caster's id, and the ability, DC, and bonus that the save
was rolled with. A chip that the GM adds by hand has no source, so nothing
below applies to it. `entities/ImposedConditions.js` owns the two rules over
that record:

- `removeImposed(list, casterId, spellId)` removes every chip that one cast
  wrote, reports them, and hands the original list straight back when none
  matched.
- `repeatSaves(list, { bonusOf, rng })` rolls one save per chip whose source
  says that the save ends the effect, against the DC recorded on it, and
  drops the chips that succeeded. `bonusOf` decides what the creature adds.
  It defaults to the bonus stamped at cast time, which is all there is for a
  foe.

Both matches need the caster and the spell to agree. A caster holding two
spells ends one at a time, and two casters that land the same spell on one
target keep their own chips.

`app/combatants.js` drives them, because only the wiring can see every
collection that a target lives in. `endSpellEffects(app, casterId, spellId)`
sweeps the characters and the creatures, then logs each one
that walked free. It runs whenever a caster stops holding a spell: the sheet's
Drop control and its hand-removed `Concentrating` chip (through
`onConcentrationEnd`, wired in `app/partyWiring.js`), a failed CON save or a
drop to 0 HP in `applyToTarget`, a displacing cast in `app/spellCast.js`, and
a duration that runs out at the round wrap. `retryImposedSaves(app, combatantId)`
rolls the repeated saves, called from the turn advance (`advanceCombatTurn`)
for whoever's turn is ending. A party character rolls its live bonus there
rather than the stamped one, so a save granted since the cast counts.

The sweep always runs after the write that it follows, never before. Both
touch `state.characters` and `state.creatures`. If the app stores a
pre-sweep copy, the chips come back.

A spell states that its condition allows the retry with `saveEnds` on its
save effect. `Library.normalizeSpell` accepts this alongside a condition and
drops it when there is no condition. Hold Person and Power Word Stun ship
with it.

The retry, the effect table below, and the rider are the three rules that read
a chip. A spell whose only target shook the effect off also leaves the caster
concentrating, because nothing tracks how many targets a cast has left.

## What a condition does

`Conditions.js` owns the pick-list and the list algebra. `Conditions.js` says
which names exist; `entities/ConditionEffects.js` says what those names do.
`CONDITION_EFFECTS` is a table keyed by the lowercased name, so a chip a GM
typed by hand matches a row when it happens to spell one of them, and carries
no rule when it does not. A row holds up to seven fields:

- `attacks` slants the attack rolls its holder makes.
- `attacksAgainst` slants the attack rolls made at its holder. It is one slant,
  or a `{ melee, ranged }` pair for prone, which is the only condition that
  helps one reach and hurts the other.
- `checks` slants the holder's ability checks.
- `saves` names the abilities whose saving throws the holder rolls at
  disadvantage, and `autoFailSaves` names the abilities that fail with no roll.
- `meleeAutoCrit` turns any melee hit on the holder into a critical one.
- `noActions` costs the holder its turn.

Eleven of the sixteen names in the pick-list carry a row. Charmed and grappled
do not: charmed needs a charmer to point at, and no part of the app relates two
combatants, while grappled sets speed to zero and nothing tracks movement.
Deafened costs only hearing. Exhaustion scales by level and belongs with an
exhaustion track rather than a flat row. Concentrating is a display chip over
the concentration state described above.

The reads over that table are pure and take chip lists only:

- `conditionEffect(name)` is the table lookup, and `effectsOf(conditions)`
  pairs each chip that carries a row with it, dropping the rest.
- `combineModes(slants)` folds a set of slants by the 5e rule: any advantage
  and any disadvantage cancel to a straight roll, and otherwise the one kind
  present wins. Counting rather than pairing makes the arrival order
  irrelevant. It answers null, not `'normal'`, when nothing applies, because
  the dice tray injects its standing advantage toggle whenever a caller names
  no mode, and a helper that always answered would cancel that toggle on every
  roll.
- `rollMode({ roller, target, kind, melee, ability })` is the mode one roll
  takes from the chips on both sides. Only an attack reads the target's chips.
  A save or a check is rolled against a number, and whoever set that number
  does not slant it.
- `modeReasons(query)` names the chips behind the mode, so a log line can
  explain a cancelled pair rather than printing a straight roll with no reason.
- `canAct(conditions)` is false when any chip holds `noActions`.
- `autoCrits(conditions, { melee })` is true when a melee hit on the holder
  crits. The printed rule is a hit from within 5 feet, and a melee weapon is as
  close as the app can measure until map distance exists.
- `saveOutcome(conditions, ability)` reports `{ autoFail, failedBy, mode }` for
  one save. The caller checks `autoFail` first, because that save never reaches
  the dice.

Four sites read the table:

- `app/weaponAttack.js` builds one query from both combatants and takes the
  reach from `weapon.handling`, the only reach signal a weapon carries. It also
  asks `autoCrits` for the defender, so a paralyzed target crits on any hit.
- `app/spellCast.js` folds the chips' mode with the GM's dialog choice through
  `combineModes`, so neither overrides the other. A save spell stamps
  `autoFailSave` on a target that fails outright, and an attack spell treats a
  touch range as melee reach. The caster view carries no chips, so the real
  combatant's list arrives as `casterConditions`.
- `app/checkRolls.js` handles a save or a check rolled from the sheet. An
  automatic failure logs and stops before the tray opens.
- `combat/CombatView.js` asks `canAct`. `skipsTurn(found)` is true for a
  combatant that is downed, that resolves to nothing, or that cannot act, and
  `app/encounterWiring.js` passes it to `advanceTurn`. The same answer marks the
  row `incapacitated`, which is how a card and a ribbon chip show a combatant
  that keeps its place in the order and loses the turn.

Every attack, check, and save in the app reaches one of those four, so a chip
applies wherever the roll is thrown. Nothing writes a chip from a roll: the
sites read, and the GM or a spell writes.

## Riders on later rolls

A chip can change the rolls its holder makes afterwards. Bless adds 1d4 to an
ally's attack rolls and saving throws. Bane subtracts the same from a foe's.
`Condition.rider` holds that as `{ rolls, dice, die, flat }`: which rolls it
touches, how many dice, which die, and a flat amount. The dice count is
signed, so Bane is Bless with a minus sign and there is no second field for
the direction. `entities/Riders.js` owns the model:

- `normalizeRider(value)` coerces a written block, the same tolerant parse
  that every other spell field gets. A rider that touches no roll, or that
  adds neither dice nor a flat amount, reads as absent.
- `chipRider(condition)` reads a stored chip's rider through that parse.
  Chips live in the campaign save and nothing checks their shape on the way
  in, so a hand-edited save can hold a rider with no roll list or with a die
  that does not exist. Every read of a stored rider goes through this
  function, and a rider the app cannot use reads as a chip that carries none.
- `activeRiders(conditions, kind)` picks the chips that touch one roll kind
  and pairs each with its cleaned rider.
- `rollRiders(conditions, kind, rng)` rolls them and returns
  `{ modifier, note }`. The note names each chip and the faces it rolled, so a
  log line can explain the number.
- `riderText` and `riderSummary` render a rider for a chip tooltip or a spell
  readout.

The rider dice roll inside `rollRiders` rather than joining the caller's own
dice selection. A bonus and a penalty then resolve the same way, and a save,
which has no dice tray, works identically to an attack, which has one.

Four roll sites read riders:

- `app/weaponAttack.js` reads the attacker's own chips before it loads the
  tray, and puts the note in the log beside the dialog's own modifiers.
- `Casting.js` rolls the caster's chips once per projectile, because each
  projectile is its own attack roll. An auto-hit projectile rolls no attack,
  so no rider touches it. The caster view carries no conditions, so
  `app/spellCast.js` passes them in from the real combatant as
  `casterConditions`. Its log lines name every ray's dice, because the tally
  line prints no to-hit numbers of its own.
- `Checks.resolveSave` rolls the roller's chips. Every save in the app goes
  through it, so `savingThrow`, a spell's save effect, and a repeated save all
  get riders from that one place. `savingThrow` reads the character's own
  chips without being asked, which means a blessed caster holds a spell
  against damage more easily.
- `app/checkRolls.js` reads the roller's chips for a save or a check rolled from
  the sheet. It calls `rollRiders` itself rather than going through
  `resolveSave`, because the tray owns the d20 there, and the log names the
  faces beside the ability modifier and the proficiency.

A rider lasts as long as its chip. Nothing spends a rider after one roll, so a
spell that grants a die to a single roll is wider here than in print. Guidance
is the built-in case: its chip stays until the duration runs out or the caster
stops concentrating, and the GM takes it off after the check it paid for. The
roll sites read chips and never write them, and `Condition.rider` has no uses
field, so a per-use rider would need a counter on the chip and a decrement at
every one of the four sites. A chip ends by its duration, a concentration drop,
or a GM removal.

A rider reaches a target one of two ways. A save spell's `effect.rider` rides
the chip that a failed save imposes, which is how Bane works. A `buff` effect
puts a chip on each willing target with no roll at all, which is how Bless and
Guidance work. A buff names its chip through `effect.condition`, and
`Casting.buffCondition` falls back to the spell's own name when it names none.
The chip carries the same `ConditionSource` a failed save writes, so
`endSpellEffects` sweeps a buff off every recipient when the caster stops
concentrating.

Two riders on one creature both apply, so Bless and Bane cancel out over the
long run rather than one winning. Two chips of the same name cannot coexist:
`addCondition` matches case-insensitively, and the newer chip replaces the
older one along with its source and its rider.

The hand-add dialog in `ui/ConditionsBar.js` takes a name and a duration only.
A chip a GM adds by hand carries no rider, and a chip merely named `Bless`
changes no roll. The dice tray already takes a bonus die for that case.

## The UI layer over entities

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are
the DOM-wiring layer over these modules. They follow the same mount-function
pattern as `ui/DiceTray.js`. Each holds a local mutable copy of its entity,
re-renders after every interaction, and reports the updated value through an
`onChange` callback for a caller to persist. The sheet re-renders by writing
values into the DOM that it already has, whenever the shape has not changed.
This is described in
[UI components](ui-components.md#the-character-sheets-structure-check).

The sheet's parts live in their own modules: the ability badges and their
breakdown popover in `ui/CharacterStatBadge.js`, the HP bar and slot pips in
`ui/CharacterBars.js`, the castable-spell list in `ui/CharacterSpells.js`, and
the progression surface in `ui/CharacterProgress.js` (class rows with
subclass, the pending-level class assignment, pending ASI/feat choices,
unlocked features, and the hit-dice pool). What the HP bar and the slot pips
*say* is split off into `view/StatBars.js`: the fill percentage, the low-HP
threshold, the column headings, and every string that a screen reader gets.
`ui/CharacterBars.js` keeps the elements and the update loop.

The two Library authoring forms split the same way. `ui/ItemForm.js` and
`ui/SpellForm.js` read their controls. `entities/ItemDraft.js` and
`entities/SpellDraft.js` decide what the values mean. `assembleItem` and
`assembleSpell` take the strings and booleans that a form holds and return
the finished item or spell. They drop the fields that the chosen type or
effect kind does not carry, so switching type before submitting cannot leave
armor fields on a rope or a save ability on an attack. Both run the same
tolerant parsers that a library import does, which keeps a typed entry and
an imported one agreeing about what a value means.

The app stores the background name and the assembled proficiency lists, but
does not yet render them. They are meant to appear inside saving-throw and
skill blocks rather than as a static list.
