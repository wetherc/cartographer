# Entities

*Explanation. Back to the [architecture overview](../architecture.md).*

`src/entities/` holds the three things that a campaign's rules operate on:
encounters, resource pools, and characters. All three follow one update
style. This page describes that style first. The rest of the page covers
the character model, the largest of the three.

## The shared shape: immutable updates

`entities/Encounter.js`, `entities/Resource.js`, and `entities/Character.js`
(types in `src/types/entities.ts`) are all plain immutable-update modules.
Each function takes a value and returns a new value. It does not change
the original:

```js
const hurt   = applyDamage(encounter, 7);   // new encounter, old one untouched
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

`entities/Proficiencies.js` assembles the six proficiency lists plus expertise
from class, race, and background (`assembleProficiencies`). It applies or
hand-edits them with `withProficiencies`, which keeps expertise a subset of
skills. The `isProficient*` and `hasExpertise` predicates return `false` for a
legacy character with no lists.

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

Of the three fields, only `consumed` changes what happens at the table. A
material that the cast destroys must be in the caster's inventory. One that
the cast does not destroy is covered by a component pouch or a spellcasting
focus. Requiring it blocks nearly every spell that carries an M, so the app
does not require it. `Casting.materialCheck(caster, spell)` applies that
rule and returns `{ required, satisfied, item }`: whether this cast needs a
material, whether the caster is holding one, and which inventory stack it
comes from.
Matching a printed phrase against a stack name is inexact by nature, so the
comparison is case-insensitive and runs in both directions: a stack named
`Diamond` covers `diamonds worth 300 gp`. Encounters and NPCs have no
inventory at all, and the app never asks them for a component.

`app/spellCast.js` acts on the result. A cast whose material is missing stops
before `castSpell` runs, which keeps a refused cast from spending a slot. A
cast that succeeds takes one item from the stack, in the same write-back that
stores the spent slot, and reports it through `InventoryLog`'s `use` verb.
The cast dialog also offers an "Ignore components" checkbox, which skips both
the check and the consumption, for tables that treat components as flavor.

`normalizeSpell` adds the `M` letter to any entry that names a material
without listing it, because the authoring form shows the material fields only
under a ticked M. If the app skips this repair, an imported spell loses its
material the first time a GM edits it. The app shows `costGP` but never
checks it, because nothing in the app tracks how much money a party has.

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

Foe and NPC casters are not affected. Their authoring dialogs stamp every
picked leveled spell into both `known` and `prepared` (`spellbookFromIds`),
so whichever list their class reads, the whole picked set stays castable.

Known casters have no spells-known cap, because the app does not model a
per-level spells-known curve. Prepared casters swap their list freely,
rather than only on a long rest.

## Saving throws

`entities/Checks.js` holds both halves of a save. `saveBonus(character, ability)`
returns what a character adds: the ability modifier taken from the
equipment-adjusted scores, plus the proficiency bonus when the class granted
that save. `resolveSave(bonus, dc, { mode, rng })` rolls one d20 through the
shared dice roller and reports `{ roll, total, dc, natural, success }`. It
succeeds on a tie with the DC. `savingThrow(character, ability, dc, opts)`
composes the two functions and adds `proficient`, so a readout can state why
the number is what it is.

The two entry points exist because a character does not always roll a save.
`Casting.js`'s save effect resolves every target through `resolveSave`, and
its targets can be encounters or NPCs, which record no ability scores in a
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
it. The app does not yet model skill checks, passive scores, or expertise.
Only saves are modeled.

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

Only characters concentrate. An encounter and an NPC have no field to write,
so a foe's concentration is still a chip that the GM adds and removes by
hand. This is why `Concentrating` stays in the pick-list. The character
sheet's `-1 HP` button is bookkeeping rather than a damage event, so it
calls for no save. Damage that must test concentration goes through an
attack or a cast.

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
sweeps the characters and the encounters, then logs each creature that
walked free. It runs whenever a caster stops holding a spell: the sheet's
Drop control and its hand-removed `Concentrating` chip (through
`onConcentrationEnd`, wired in `app/partyWiring.js`), a failed CON save or a
drop to 0 HP in `applyToTarget`, a displacing cast in `app/spellCast.js`, and
a duration that runs out at the round wrap. `retryImposedSaves(app, combatantId)`
rolls the repeated saves, called from the turn advance (`advanceCombatTurn`)
for whoever's turn is ending. A party character rolls its live bonus there
rather than the stamped one, so a save granted since the cast counts.

The sweep always runs after the write that it follows, never before. Both
touch `state.characters` and `state.encounters`. If the app stores a
pre-sweep copy, the chips come back.

A spell states that its condition allows the retry with `saveEnds` on its
save effect. `Library.normalizeSpell` accepts this alongside a condition and
drops it when there is no condition. Hold Person and Power Word Stun ship
with it.

The chip still carries no mechanical effect, so a paralyzed creature acts
normally, and the retry is the only rule that reads the condition. A spell
whose only target shook the effect off also leaves the caster concentrating,
because nothing tracks how many targets a cast has left.

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
