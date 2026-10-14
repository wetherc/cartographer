# Spells and casting

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

## Contents

- [Spell effects](#spell-effects)
  - [Adding an effect kind](#adding-an-effect-kind)
- [Spell timing](#spell-timing)
- [Multi-projectile spells](#multi-projectile-spells)
- [Material components](#material-components)
- [Ritual casting](#ritual-casting)
- [Known and prepared casters](#known-and-prepared-casters)
  - [Learning spells](#learning-spells)

## Spell effects

A spell's `effect` is a tagged union, `SpellEffect` in `src/types/spell.ts`.
Its `kind` is `attack`, `save`, `heal`, `buff`, `summons`, or `utility`, and
each kind has its own fields. Most code reads one kind with a single test,
such as `effect.kind === 'attack'`. A few functions dispatch over every kind
in one `if` chain, and each of those chains ends with `exhaustive(effect,
fallback)` from `src/util/exhaustive.js`. That function takes a `never`
parameter, so a kind with no branch above the call fails `pnpm run typecheck`
at that line. At runtime it returns the fallback, so an effect that did not pass through
the normalizer gets no outcomes and no summary line.

`src/entities/SpellKinds.js` keeps the traits of each kind that code outside
the kind's own branches reads. `SPELL_KINDS` maps each kind to its label in
the spell form, `helps` (the cast reaches the caster's own side, so the dialog
says "Recipient"), and `targetFree` (the cast picks no creature). The table is
typed as a record over every kind, so a missing row also fails the typecheck.
The `helps` and `targetFree` functions in `src/app/spellTargets.js` read it.

### Adding an effect kind

| File | Change | Guard |
| --- | --- | --- |
| `src/types/spell.ts` | Declare the effect interface and add it to `SpellEffect` | Typecheck |
| `src/data/spells.js` | Add the kind to `SPELL_EFFECT_KINDS`, the list the import and the form select accept | `tests/SpellKinds.test.js` |
| `src/entities/SpellKinds.js` | Add a row to `SPELL_KINDS` | Typecheck, `tests/SpellKinds.test.js` |
| `src/entities/SpellEntry.js` | Give `normalizeSpellEffect` a branch that keeps the kind's fields | `exhaustive` call, `tests/SpellKinds.test.js` |
| `src/entities/SpellDraft.js` | Map the form controls to the written effect in `writtenEffect`, when the kind reuses the dice editor differently | `tests/SpellDraft.test.js` |
| `src/ui/SpellForm.js` and the `SpellForm*.js` blocks | Show the kind's controls in `sync` | Browser check |
| `src/entities/Casting.js` | Roll the kind in `resolveEffect` | `exhaustive` call |
| `src/types/cast.ts` | Add the outcome type to `CastOutcome` | Typecheck |
| `src/entities/CastScaling.js` | Scale the kind with the slot level or the cantrip step, when it scales | `tests/Casting.test.js` |
| `src/app/spellCastFields.js` | Add the dialog fields the kind needs, such as a roll mode | Browser check |
| `src/app/spellOutcomes.js` | Apply the outcomes in `applyOutcomes` | `exhaustive` call |
| `src/view/SpellEffectText.js` | Describe the kind in `effectLine` | `exhaustive` call |

The ward prompts (`src/app/shieldWard.js` and `src/app/damageWardPrompt.js`) and
`DamageWard.landingDamage` read only attack and save outcomes. A new kind that
deals damage needs a branch there too, and no type check finds it.

## Spell timing

A `Spell` (`types/spell.ts`) lives in the library and not in a campaign save,
so it has no version number and no migration chain (see
[Persistence](persistence.md) for how the library merges). The app therefore
parses its two timing fields, `castingTime` and `duration`, on every read.

Both fields are structured values, not text. A `castingTime` has a kind
(`action`, `bonus`, `reaction`, `minutes`, or `hours`), an amount for the
counted kinds, and a trigger clause for a reaction. A `duration` has a kind
(`instantaneous`, `rounds`, `minutes`, `hours`, `days`, or `until-dispelled`),
an amount, and an `upTo` flag for a duration that the caster can end early.
`entities/SpellTiming.js` has these functions over them:

- `parseCastingTime` and `parseDuration` accept the structured object or the
  printed string that a library file can contain, such as `1 bonus action`,
  `10 minutes`, or `Concentration, up to 1 minute`. The parsers drop a
  `Concentration, ` prefix, because the spell has `concentration` as its own
  flag. A phrase that neither parser can classify becomes
  `{ kind: 'special', text }`, so the app keeps every phrase that a GM typed.
- `formatCastingTime` and `formatDuration` turn a value back into the printed
  text that the detail modal shows. Pass `concentration` to `formatDuration`
  to get the SRD wording `Concentration, up to 1 minute`.
- `castingCost` names the part of a turn that a cast spends, which the action
  budget of the combat screen then takes. A casting time of minutes or hours,
  or of the `special` kind, returns null, because no part of a turn pays for
  it.
- `durationInRounds` converts a duration into a round count, which gives a
  timer to a condition that a spell imposes. Days and open-ended durations
  return null, and the GM clears the chip by hand.

The authoring form and the library normalizer both send their raw values
through the parsers, so the same code validates a spell typed into the Library
rail and a spell imported from a file.

## Multi-projectile spells

Scorching Ray, Eldritch Blast, and Magic Missile each fire several projectiles
from one cast, and each projectile rolls on its own. An attack effect states
this with `projectiles: { count, perStep?, autoHit? }`. When the field is
present, the effect's `damage` is what one projectile deals, not what the
whole cast deals. An effect without the field rolls once, like every other
attack spell, so a spell without the field needs no migration.

`entities/CastScaling.js` counts the projectiles, and `entities/Casting.js`
resolves the cast. These rules apply:

- `projectileCount(effect, steps)` returns `count` plus `perStep` for each
  scaling step. The steps are the same as for damage scaling: each slot level
  above the spell's own level for a leveled spell, or each cantrip breakpoint
  for a cantrip. `maxTargets` returns this value for a projectile spell,
  because a target needs at least one projectile.
- `allocateProjectiles(targets, count)` decides how many projectiles each
  target gets. A target with a `projectiles` value states its own share, and
  the function limits the shares in order so the total never exceeds what the
  spell fires. With no stated shares, the projectiles spread as evenly as
  possible, which puts all of them on the only target in the common case.
- `CastRolls.resolveAttack` rolls one attack per projectile. Each projectile has its own d20
  and its own critical hit, which doubles only its own dice, or it rolls
  nothing when `autoHit` is set. The outcome keeps each projectile's roll and
  damage under `shots`, plus `fired` and `hits`, so the log can read
  `2 of 3 hit Grelka`. The app applies each ray that lands as its own hit, so
  a concentrating target saves once per ray, and a dying target takes one
  failure per ray.
- A hit from a Touch-range spell on a target with a Paralyzed or Unconscious
  chip is a critical hit, the same rule as for a melee weapon. The cast path
  sets `autoCrit` on that target.

For these spells, the cast dialog shows an allocation grid in place of target
checkboxes, because a checkbox cannot say "two rays here, one there". The grid
is also the target picker, so a creature with no projectiles is not a target.
The grid's total is the number of projectiles that the cast fires at the
chosen level. The total updates when the slot picker changes, so the grid
never offers a projectile that the cast cannot fire.

## Material components

A spell's `components` list has the component letters, such as
`['V', 'S', 'M']`. The letters cannot say what the material is, what it costs,
or whether the cast destroys it. A spell that needs a material therefore
describes it in `materials: { text, costGP?, consumed }`. Most spells have no
such block, so the field is optional. Revivify names its diamonds, and Fire
Bolt has nothing to name.

`MaterialCheck.materialCheck(caster, spell)` applies the rule and returns
`{ required, satisfied, item, consumes }`. These fields say whether the caster
has to hold the material, whether a stack of it is there, which stack it is,
and whether the cast spends it.

The inventory has to contain a material that the cast destroys, and also a
material with a gp cost, because a pouch or a focus never covers a priced
component. A component pouch or a spellcasting focus covers any other
material. A caster with neither needs the printed material itself.

`required` and `consumes` are separate fields, because holding a material is
not the same as spending it. Revivify destroys its diamonds, and they come off
the stack. The 50 gp diamond of Chromatic Orb has to be in the inventory, and
it stays there.

An item is a pouch or a focus when it sets `spellFocus`. The flag is the only
signal, so a stack that a GM named "Component Pouch" without the flag is
ordinary gear. `Equipment.isSpellFocus(item)` and
`Equipment.carriesSpellFocus(inventory)` read the flag. `GEAR_PRESETS` has four
entries with the flag (a component pouch and an arcane, a druidic, and a holy
focus). The item form offers the checkbox on every item type in
`ItemDraft.FOCUS_TYPES`, because a staff can be an arcane focus and an amulet
can be a holy symbol. A consumable is left out, since the holder uses it up,
and `assembleItem` drops the flag from one. The caster only has
to carry the focus, because the app does not track which hand is free, and
gear has no equipment slot.

A printed phrase does not always match a stack name exactly. The comparison
therefore ignores case and runs in both directions, so a stack named
`Diamond` covers `diamonds worth 300 gp`. A material with no printed text names
nothing to look for and is never required. A creature has no inventory, and
the app never asks it for a component.

`app/spellCast.js` acts on the result. A cast with a missing material stops
before `castSpell` runs, so a refused cast spends no slot. The refusal names
the missing material or the missing pouch, whichever is the cheaper fix. When
`consumes` is true, a cast that succeeds takes one item from the stack, in the
same write that stores the spent slot. `InventoryLog` reports the item with its
`use` verb. The cast dialog also offers an "Ignore components" checkbox, which
skips the check and the consumption, for tables that treat components as
flavor.

`normalizeSpell` adds the `M` letter to any entry that names a material but
does not list the letter, because the authoring form shows the material fields
only when M is ticked. Without this repair, an imported spell would lose its
material the first time a GM edited it. The app reads `costGP` only as the
signal that a focus cannot cover the component. It never charges the party,
because the app does not track money.

## Ritual casting

A ritual cast takes ten minutes longer than a normal cast and spends no spell
slot. The spell has to have `ritual: true`, and the caster has to have a class
with the ritual-casting feature. `data/classCatalog.js` gives that feature to the
bard, cleric, druid, and wizard. `Classes.hasRitualCasting(character)` is true
when any caster class of the character has it. With a spell id, only the class
that the spell was learned under counts (`spellbook.sources`, or the first
caster class when the book records none). A sorcerer 3 / cleric 1 casts a
sorcerer Detect Magic with a slot only, and the same spell learned as a cleric
spell gets the ritual option.

`Casting.castSpell` takes `{ ritual: true }`. The cast resolves at the spell's
own level, because no slot is spent that could raise it, and returns
`spent: false` with the caster value unchanged. A ritual cast of a spell with
no ritual, or of a cantrip, returns `{ ok: false, reason: 'not-ritual' }`.

The cast dialog offers a "Cast as ritual" checkbox when both conditions are
true. Ticking it hides the slot picker. For a caster with no slots left, a
ritual is the only cast still available, so the dialog opens with no slot
picker and the box ticked.

A wizard can also cast a ritual from the spellbook without preparing it. The
Wizard's class entry sets `ritualFromBook`, and `SpellView.isRitualOnly` is
true for a known, unprepared ritual of such a class. `Casting.castSpell`
accepts that spell as a ritual cast only, and the cast dialog offers no slot
and opens with the ritual box ticked.

The game clock divides a day into six named watches (`time/GameClock.js`), so
it cannot count ten minutes, and a ritual does not advance it. The session log
states the extra time instead (`casts Detect Magic as a ritual (10 minutes
longer)`), and the GM decides what it costs.

No built-in spell in `src/data/spells/` is a ritual, so the flag applies only
to spells that a GM writes or imports. See
[the curated-spells note](../spells-missing.md) for what the built-in list
covers.

## Known and prepared casters

Each caster class manages its leveled spells as a prepared caster or as a
known caster, and `data/classCatalog.js` records the rule as `knownRule`.

- A *prepared* caster (cleric, druid, paladin, wizard) keeps a larger book and
  readies a subset each day. Only the spellbook's `prepared` list is castable.
  `Classes.preparedLimit` sets the size of that list for each prepared-rule
  class: the spell-ability modifier plus the caster level, with a minimum of 1.
  The caster level is the class level for a cleric, druid, or wizard, and half
  the class level, rounded down, for a paladin. A class with no spell slots
  at its level adds nothing, so a paladin 1 prepares no spells.
- A *known* caster (bard, ranger, sorcerer, warlock) casts every spell that it
  knows. The `known` list is castable directly, with no prepare step.

Cantrips are in their own list, outside both rules.

`SpellView.spellRule(character, spellId)` says which rule applies to a spell.
It uses the rule of the class that the character learned the spell under (the
spellbook's `sources` map). When no source is recorded, it uses the first
caster class, and when that is missing too, it uses `'known'`, so a character
with no recorded rule keeps casting what it knows. `isSpellCastable` and
`castableLeveledIds` apply the rule, and `Casting.canCast` calls them. The cast
validator, the spell section of the sheet, and the action bar of the combat
screen therefore agree on what is castable.

The Spellbook tab follows the same rule. The Prepare and Unprepare actions and
the prepared count show only for a character with a prepared-rule class
(`Classes.hasPreparedCaster`). The entries of a known caster show only Learn
and Forget. A multiclass character mixes the two rules, and each learned spell
follows the rule of its own class.

The rule does not limit creature casters. Their authoring dialogs write every
picked leveled spell into both `known` and `prepared` (`spellbookFromIds`), so
the whole picked set is castable whichever list the class reads.

### Learning spells

`SpellLearning.js` decides which spells the Spellbook tab offers. Each caster
class learns as a single-class caster of its own class level, which is the 5e
multiclass rule. `classSpellLevelCap` reads the top row of the class's own slot
table, or the pact slot level for a warlock. Its optional `subclass` argument
applies a casting subclass, so an Eldritch Knight 7 learns 2nd-level spells.

`canLearnSpell` then needs a class whose spell list has the spell
(`ClassCasting.spellListOf`, which is the wizard list for an Eldritch Knight)
and whose cap reaches the spell's level. A cleric 3 / wizard 3 has 3rd-level
slots on the combined table, but neither class can learn Fireball. The module
never reads the character's slot pools, because the combined slot level is not
the limit for learning.

The app does not model these parts of the rules:

- the number of spells that a known caster can know at each level, so a known
  caster has no limit
- the school limits of the Eldritch Knight and the Arcane Trickster, so both
  learn from the whole wizard list
- the long-rest limit on changing prepared spells, so a prepared caster can
  change the list at any time
