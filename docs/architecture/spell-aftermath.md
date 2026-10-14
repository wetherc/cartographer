# Effects that spells leave

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

## Contents

- [Conditions a spell imposed](#conditions-a-spell-imposed)
  - [The sweep](#the-sweep)
  - [Repeated saves](#repeated-saves)
- [Effects on later turns](#effects-on-later-turns)
  - [Turn-boundary chips](#turn-boundary-chips)
  - [Damage on later turns](#damage-on-later-turns)
  - [Repeats](#repeats)
- [Effects of a hit](#effects-of-a-hit)
- [Hit-point rules](#hit-point-rules)
- [Summoned creatures](#summoned-creatures)
- [Condition effects](#condition-effects)
- [Riders on later rolls](#riders-on-later-rolls)
  - [Rider sources](#rider-sources)
  - [Roll sites](#roll-sites)
  - [How long a rider lasts](#how-long-a-rider-lasts)
- [Riders on hits](#riders-on-hits)

## Conditions a spell imposed

A failed save against a spell can leave a condition on the target, and that
chip records where it came from. `Condition.source` records the spell's id and
name, the caster's id, and the ability, DC, and bonus of the save. A chip that
the GM adds by hand has no source, so the rules in this section do not apply
to it. `entities/ImposedConditions.js` owns the rules over the record:

- `removeImposed(list, casterId, spellId)` removes every chip that one cast
  wrote and reports them. It returns the original list when no chip matches.
- `repeatSaves(list, { bonusOf, rng })` rolls one save for each chip whose
  source says that a save ends the effect, against the DC on the chip, and
  drops the chips whose save succeeded. `bonusOf` gives the bonus. The default
  is the bonus recorded at cast time, which is the only bonus a foe has.

Both functions match on the caster and the spell. A caster with two spells
running ends one at a time, and two casters that put the same spell on one
target each keep their own chips.

### The sweep

`app/combatantWrites.js` runs these functions, because only the wiring can see
every collection that a target can be in. `endSpellEffects(app, casterId,
spellId)` sweeps the characters and the creatures and logs each one that the
sweep freed. It also removes the creatures that the cast summoned (see
[Summoned creatures](#summoned-creatures)). It runs whenever a caster stops
concentrating on a spell:

- the Drop control of the sheet, or a hand removal of its `Concentrating`
  chip, through `onConcentrationEnd` in `app/partyWiring.js`
- a failed CON save or a drop to 0 HP in `applyToTarget`
- a chip that stops the caster acting
- a new concentration cast in `app/spellCastResolve.js`
- a duration that runs out at the round wrap or as the game clock advances
- a deleted caster, through `endCasterEffects(app, caster)`

`endCasterEffects` runs on every delete path of a character or a creature,
and on the foes that flee at the end of a fight. It asks
`ImposedConditions.spellsHeldBy` for every spell of the caster that still has
a chip or a summon in play, and sweeps each one. A new creature with the same
name gets the same id, so without this sweep it would inherit the chips and
summons of the deleted one.

The sweep always runs after the write that it follows. Both writes change
`state.characters` and `state.creatures`, so a copy stored before the sweep
would bring the chips back.

### Repeated saves

`retryImposedSaves(app, combatantId)` rolls the repeated saves.
`app/turnAdvance.js` calls it from the turn advance (`advanceCombatTurn`) for
the combatant whose turn ends, and for each held combatant that the pointer
steps past. A Paralyzed or Stunned combatant never takes a turn, so without
the second call it would never roll to end Hold Person. A party character
rolls its current bonus there, not the recorded one, so a save proficiency
gained after the cast counts.

A spell allows the repeated save with `saveEnds` on its save effect.
`SpellEntry.normalizeSpellEffect` keeps the flag when the effect names a
condition and drops it otherwise. The spell form offers it as the "Save ends
each turn" box, which shows once a save names a condition, and the form
assembles its effect through the same function. Hold Person, Blindness/Deafness, Hold Monster,
Phantasmal Killer, Power Word Stun, and Sunburst ship with it.

The repeated save, the condition-effect table, and the rider are the rules
that read a chip. A spell whose only target ended the effect still leaves the
caster concentrating, because nothing tracks how many targets a cast has left.

## Effects on later turns

A round tick ends a chip at the top of a round, but several spells end at a
turn of one combatant. Sunbeam blinds a creature until the start of the
caster's next turn, and Acid Arrow burns a creature at the end of that
creature's next turn. The rules live in `entities/TurnEffects.js` and
`entities/SpellRepeat.js`, and `app/turnEffectsWiring.js` runs them at each turn
boundary (see
[The turn advance](combat.md#the-turn-advance)).

### Turn-boundary chips

A chip with `expires` ends at a turn boundary of one combatant: `who` names
it, `at` is `start` or `end`, and `count` is how many such boundaries pass
first. `TurnEffects.chipTiming` builds the field from the `until` of a
spell, which is `caster-start`, `caster-end`, or `target-end`. "The end of
your next turn" skips the end of the turn that is running, so a chip keyed
to the end of the acting combatant's turn starts at a count of 2.

A chip with `expires` has a null `rounds`. With a count of rounds as well,
the round tick would end it at the top of the round, before the turn it
waits for. A chip keyed to a combatant outside the running order, or
written outside a fight, gets `rounds: 1` and no `expires`, because no turn
of that combatant will come.

`TurnEffects.passBoundary` counts one boundary, and `dropBoundaryChips`
removes the chips when the combatant leaves the fight or the fight ends.
Both return the list that they received when nothing matched. The wiring
sweep runs on every turn of a fight, and a new object per entity per turn
misses the pack cache of the save.

A creature keeps one chip per place, and `Conditions.sameSlot` decides the
place. Chips of one name share a place, except when two casters wrote them
or a chip deals ongoing damage or allows a repeated save
(`Conditions.tracksCast`). Two clerics who both cast Bless on one target
each leave a chip, so the end of one cleric's concentration takes off only
that cleric's chip, and the target stays blessed by the other. Two rangers
who mark one foe each leave a Hunter's Mark chip, so each one adds its own
d6. A chip that tracks its cast
shares a place only with a chip from the same caster and spell, so two
casters' Acid Arrow each roll their own damage, and Phantasmal Killer lands
its own chip beside a longer Frightened from another spell. The condition
that the name states still applies once, because the readers ask whether
some chip has the name. The readers of riders and mods (`Riders.activeRiders`,
`ChipMods.heldMods`, and the temporary HP of `startTurnEffects`) count one
chip per name, the strongest (`Conditions.strongestPerName`), so two
Blesses add one d4 and two Shields of Faith add +2 AC. `spendRiders` takes
off one chip per spent name, so a second Guidance stays for the next check.
Inside one place, `Conditions.outlasts` keeps a
longer chip from another cast of the same caster, so the one-round Blinded of
Sunbeam does not replace the one-minute Blinded of Blindness/Deafness. Two
casts of one spell by one caster with different mods keep the stronger chip
whatever its length, so a 2nd-level Aid does not replace a 3rd-level Aid. The weaker chip is dropped
and not kept for later, so the +5 of the weaker Aid does not return when the
stronger Aid ends first.

### Damage on later turns

An attack or a save effect with `ongoing` leaves dice on the target. The
resolver scales them with the cast (`ongoing.perStep`) and returns them on
the outcome of each hit or failed save. `app/spellOutcomes.js` writes them
to a chip as `ongoing.damage`. A save that imposes a condition puts them on
that chip. Any other cast writes a chip named after the spell, which ends at
`ongoing.until`, or at the end of the target's next turn by default.

At the end of the holder's turn, `TurnEffects.ongoingChips` names the chips
that deal their damage. A chip that allows a repeated save is not among
them. Its damage lands only when the retry fails, so a success ends the
spell and spares the damage, as Phantasmal Killer does.

Three attack flags help these spells. `halfOnMiss` rolls the damage on a
miss and deals half, which is the splash of Acid Arrow. `addsModifier` adds
the spellcasting modifier to each hit, which a critical hit does not
double. `melee` marks a melee spell attack whose range is not Touch, such
as Spiritual Weapon, so Prone and an automatic critical hit read it as
melee. `scaling.levelsPerStep` counts one scaling increment per that many
slot levels, inside `CastScaling.scalingSteps`, so the damage, the target cap,
and the projectile count agree.

### Repeats

A spell with `repeat` can be used again on each later turn while it lasts,
with no new slot. The first cast gives the caster a chip named after the
spell, whose source keeps `repeat.slotLevel`. A spell with fixed repeat
damage, such as Witch Bolt, also records the creatures that it hit in
`repeat.targetIds`, and it opens the repeat only on a hit
(`SpellRepeat.opensRepeat`).

`castPlan` in `app/castPlan.js` finds the chip with
`SpellRepeat.heldRepeat` and builds a free plan: no slot, no component
check, no armor check, and the cost of `repeat.cost` or of the casting time.
`castSpell` takes the `free` option and skips the spellbook check and the
slot. `resolveCast` starts no new concentration for a repeat, because a new
concentration on the same spell would end the old one and sweep the repeat
chip with it. For the same reason, the first cast writes the chip after the
sweep of a displaced spell. A repeat with fixed damage resolves through
`SpellRepeat.repeatedSpell`, an automatic hit with no scaling.

The chip ticks down with the duration of the spell, and a concentration
spell loses it with every other chip of the cast.

## Effects of a hit

An attack effect can do more on a hit than deal damage. `Casting.js` pays
for the cast and scales the dice, and `entities/CastRolls.js` rolls them
against each target. The save of a save effect and the save that a hit
brings both go through `CastRolls.targetSave`, so the chips and the feat
riders of the target join both in the same way.

`onHit` names a condition that the hit imposes. With `onHit.saveAbility`,
the target rolls that save against the DC of the cast after the damage roll,
and the outcome keeps the roll under `onHit`. A target that several
projectiles hit rolls once. `castPlan` reads the save bonus of each target
for `onHit.saveAbility` the same way as for a save spell, and the cast
dialog adds a DC field. `app/spellOutcomes.js` writes the chip with the
cast as its source. The chip ends at `onHit.until` when the spell names a
turn boundary, and after the duration of the spell otherwise. Ray of
Sickness uses this.

`drain` gives the caster hit points equal to `half` or all (`full`) of the
damage that the hits deal. `spellOutcomes.js` sums the damage after the
defenses of each target, including a splash on a miss, and heals the caster
once after the last target. Vampiric Touch uses this.

## Hit-point rules

A save effect can read the current HP of each target in place of a save
roll. `hpLimit` fails the first save with no roll for a target at or under
the limit, and leaves a target above it unaffected. `hpPool` rolls a pool
of dice once per cast. `entities/HpPool.js` sorts the targets by current HP
and walks them, and each target whose HP fits in what the pool has left
takes the effect and spends its HP. `SpellFields.rollsNoSave` is true for a
pool, and for a limit with no repeated save. For such a spell `castPlan`
reads no save bonus, and the dialog shows no DC field. Power Word Stun keeps
its DC, because its target retries the save on later turns.

`spellCastResolve.js` reads the HP of each target from the roster when the
GM submits the cast. A pool also reads the chips there, because it passes
over an Unconscious target and a target that already has the condition.
A target with no HP to read (a character with no HP pool, or a creature
that left the roster) takes the effect and spends nothing, so the GM can
still apply the spell.

`kills` makes a failed save fatal. `app/slay.js` kills a creature by
setting its HP to 0 (`Creature.slay`), and a character through
`DeathSaves.killOutright`, which leaves its HP alone. The character store
then drops the spell it concentrated on. Power Word Kill uses a limit and
`kills`.

`endsOnDamage` stamps `source.endsOnDamage` on the chip. The two damage
writes, `Character.damageCharacter` and `Creature.applyDamage`, take such a
chip off on any damage above 0, and `combatantWrites.applyToTarget` logs it.
Sleep uses a pool and `endsOnDamage`, and Color Spray uses a pool and a
turn boundary.

## Summoned creatures

A spell can put new creatures on the map. Its `summons` effect names one
library creature template and a count, and Conjure Animals ships with one.
`entities/Summons.js` owns the rules over a `summonedBy` field on the
creature. The field records the spell's id and name and the caster's id,
which is the same record that `Condition.source` keeps. One sweep therefore
ends both the chips and the summons of a spell. A creature that the GM placed
has no such field.

- `summonCount(effect, steps)`, in `CastScaling.js`, is the base `count` plus
  `countPerStep` for each scaling step. The spell's `scaling.levelsPerStep`
  sets how many slot levels make one step, so Conjure Animals (count 8,
  `countPerStep` 8, `levelsPerStep` 2) brings 8, 16, 24, or 32 wolves.
- `stampSummon(creature, source)` writes the record onto a new creature.
- `isSummonedBy(creature, casterId, spellId)` matches one cast, on both the
  caster and the spell, for the same reason as `removeImposed`.
- `despawnSummons(list, casterId, spellId)` removes every creature of one cast
  and reports them. It returns the original list when no creature matches.

The effect names its template, and does not use an id. The library merges
creature entries by name, so the name still finds the template after a GM
customizes it. `Library.activeCreatureByName` is the lookup. `castPlan`
refuses a cast whose name matches no template, before the dialog opens and so
before a slot is spent.

`spawnSummons` in `app/summonsWiring.js` reads the template, builds one creature per
count through `CreatureTemplate.fromTemplate`, and puts all of them on the party's
tile. That tile is the only place that a cast can reach, because the app
cannot measure the distance between two tokens. Each creature gets its own id.
`Summons.summonDisposition` sets its side from the caster. A party
character's summons are friendly, and a creature's summons take that
creature's disposition. A caster missing from the roster leaves the template's
disposition.

`endSpellEffects` removes the summons in the same pass that sweeps the chips.
The removal runs before the early return for an empty sweep, because a
summoning spell usually imposes no chip. A defeated summon leaves with the
living ones, and the log names each creature that vanishes. A summoning spell
without concentration still spawns its creatures, and the log marks the cast
as untracked. The GM removes those creatures by hand.

A summons cast during a fight joins the running order.
`Initiative.addParticipant` sorts the new creature in and keeps the turn on
the combatant that has it. The initiative is a plain d20 plus the DEX
modifier, the same roll that the setup dialog makes. A new creature that sorts
above the current combatant therefore acts first on the next round. When the
removal takes away the last creature of the fight near the party, the fight ends
through `syncCombatLocation`.

## Condition effects

`Conditions.js` owns the pick-list and the list operations, and it says which
names exist. `entities/ConditionEffects.js` says what those names do.
`CONDITION_EFFECTS` is a table keyed by the lowercased name. A chip that a GM
typed by hand gets the rule of a row when its name matches one, and no rule
when it does not. A row has up to seven fields:

| Field | Effect |
| --- | --- |
| `attacks` | Slants the attack rolls that the holder makes |
| `attacksAgainst` | Slants the attack rolls made against the holder. It is one slant, or a `{ melee, ranged }` pair for Prone, the only condition that helps one reach and hurts the other |
| `checks` | Slants the holder's ability checks |
| `saves` | Names the abilities whose saves the holder rolls with disadvantage |
| `autoFailSaves` | Names the abilities whose saves fail with no roll |
| `meleeAutoCrit` | Makes any melee hit on the holder a critical hit |
| `noActions` | Costs the holder its turn |

Eleven of the fifteen names in the pick-list have a row. Charmed has none,
because it needs a charmer, and no part of the app relates two combatants.
Grappled has none, because it sets speed to zero and nothing tracks movement.
Deafened costs only hearing, and Concentrating is a display chip for the
concentration state. Exhaustion is not in the pick-list, because it is a
level and not an on-or-off state, and `Exhaustion.js` owns it.

The reads over the table are pure and take chip lists only:

- `conditionEffect(name)` is the table lookup, and `effectsOf(conditions)`
  pairs each chip that has a row with its row and drops the rest.
- `combineModes(slants)` combines a set of slants by the 5e rule. Any
  advantage and any disadvantage cancel to a straight roll, and otherwise the
  one kind present wins. The function counts the kinds, so the order of the
  slants does not matter. It returns null, not `'normal'`, when nothing
  applies. The dice tray adds its own advantage toggle when a caller names no
  mode, and a function that always returned a mode would cancel that toggle on
  every roll.
- `rollMode({ roller, target, kind, melee, ability })` is the mode that one
  roll gets from the chips on both sides. Only an attack reads the target's
  chips, because a save or a check rolls against a number that the other side
  does not change.
- `modeReasons(query)` names the chips behind the mode, so a log line can
  explain a cancelled pair instead of printing a straight roll with no reason.
- `canAct(conditions)` is false when any chip has `noActions`.
- `losesTurn(conditions)` is true when any chip has `noActions` or `noTurn`.
  Lethargic has only `noTurn`, so it takes the turn but keeps concentration
  and reactions, which read `canAct`.
- `autoCrits(conditions, { melee })` is true when a melee hit on the holder is
  a critical hit. The printed rule is a hit from within 5 feet. The app
  measures no distance, so it uses a melee attack as the closest match.
- `saveOutcome(conditions, ability)` returns `{ autoFail, failedBy, mode }` for
  one save. The caller checks `autoFail` first, because that save never
  reaches the dice.

These sites read the table:

- `combat/WeaponSwing.js` builds one query from both combatants and takes the
  reach from the weapon's kind (`Weapons.weaponKind`). It also asks `autoCrits`
  about the defender, so any hit on a paralyzed target is a critical hit.
- `app/spellCastResolve.js` combines the mode from the chips with the GM's
  choice in the dialog through `combineModes`, so neither replaces the other.
  A save spell marks a target that fails with no roll with `autoFailSave`, and
  an attack spell treats a touch range as melee reach. The caster view has no
  chips, so the list of the real combatant arrives as `casterConditions`.
- `app/checkRolls.js` handles a save or a check rolled from the sheet. An
  automatic failure logs and stops before the tray opens.
- `combat/CombatView.js` asks `losesTurn`. `skipsTurn(found)` is true for a
  combatant that is downed, that resolves to nothing, or that loses its turn,
  and `app/turnAdvance.js` passes it to `advanceTurn`. The answer of `canAct`
  marks the row `incapacitated`, which is how a card and a ribbon chip show a combatant
  that keeps its place in the order but loses its turn.

Every attack, check, and save in the app reaches one of those sites, so a chip
applies wherever the roll happens. The sites only read chips. The GM or a
spell writes them.

## Riders on later rolls

A chip can change the later rolls of its holder. Bless adds 1d4 to an ally's
attack rolls and saving throws, and Bane subtracts 1d4 from a foe's.
`Condition.rider` records this as `{ rolls, dice, die, flat, once }`: the rolls
it changes, the number of dice, the die, a flat amount, and whether the first
roll uses it up. The dice count is signed, so Bane is Bless with a minus sign,
and no second field is needed for the direction. `entities/Riders.js` owns the
model:

- `normalizeRider(value)` cleans a written block, with the same tolerant
  parse as every other spell field. A rider that changes no roll, or that adds
  neither dice nor a flat amount, reads as absent.
- `chipRider(condition)` reads the rider of a stored chip through that parse.
  Chips are in the campaign save, and nothing checks their fields on load, so a
  hand-edited save can contain a rider with no roll list or with a die that
  does not exist. Every read of a stored rider goes through this function, and
  a rider that the app cannot use reads as no rider.
- `activeRiders(sources, kind)` picks the sources that change one kind of roll
  and pairs each with its cleaned rider.
- `rollRiders(sources, kind, rng)` rolls them and returns
  `{ modifier, note, spent }`. The note names each source and the faces it
  rolled, so a log line can explain the number. `spent` names each source
  whose rider has `once` set.
- `spendRiders(conditions, spent)` removes the chips that a roll used up.
- `riderText` and `riderSummary` describe a rider for a chip tooltip or a
  spell readout.

### Rider sources

A source is anything with a name and a rider. A condition chip is a source,
and so is the stamp of a taken feat. `FeatChoices.featRiders` reads the feat
riders of a character as sources, and `FeatChoices.riderSources` joins them
with the condition list. The roll sites call `riderSources` and do not read
`conditions` directly, so a feat bonus and a chip bonus take the same path and
print in the same note.

A feat rider lasts as long as the feat. It is a standing bonus, with no
duration and no chip on the conditions bar. The condition-effect table matches
chips by name, and a feat source never enters a list that the table scans, so
a feat with the same name as a condition cannot slant a roll. The target of a
cast therefore has its chips in `conditions` and its feat riders in a separate
`riders` field. Both apply to its saving throw, but only the chips decide
advantage or an automatic failure.

The rider dice roll inside `rollRiders`, not in the caller's own dice
selection. A bonus and a penalty therefore resolve the same way, and a save,
which has no dice tray, works the same as an attack, which has one.

### Roll sites

- `combat/WeaponSwing.js` reads the attacker's own chips before it loads the
  tray, and puts the note in the log beside the dialog's own modifiers.
- `CastRolls.js` rolls the caster's chips once per projectile, because each
  projectile is its own attack roll. An auto-hit projectile rolls no attack, so
  no rider applies to it. The caster view has no conditions, so
  `app/spellCastResolve.js` passes in the chips of the real combatant as
  `casterConditions`. The log lines name the dice of every ray, because the
  tally line prints no to-hit numbers of its own.
- `Checks.resolveSave` rolls the roller's chips. Every save in the app goes
  through it, so `savingThrow`, the save effect of a spell, and a repeated
  save all get riders from that one place. `savingThrow` reads the
  character's own chips, so a blessed caster has a better chance to keep
  concentration through damage.
- `app/checkRolls.js` reads the roller's chips for a save or a check rolled
  from the sheet. It calls `rollRiders` itself and not `resolveSave`, because
  the tray throws the d20 there. The log names the faces beside the ability
  modifier and the proficiency.

### How long a rider lasts

A rider lasts as long as its chip, unless it has `once` set. Guidance and
Resistance ship with `once`, so the first check or save that the rider changes
uses up the chip. `spendRollRiders` in `app/riderSpend.js` removes those chips
after the roll. `app/weaponAttack.js`, `app/checkRolls.js`, and
`app/spellCastResolve.js` call it: the last for the caster's attack rolls and
for each target's save. A chip without `once` ends by its duration, a
concentration drop, or a GM removal. The spell form offers the flag as the
"One roll only" box.

A rider reaches a target in one of two ways:

- a save spell's `effect.rider`, which goes onto the chip that a failed save
  imposes (Bane works this way)
- a `buff` effect, which puts a chip on each willing target with no roll
  (Bless, Guidance, and Resistance work this way)

A buff names its chip through `effect.condition`, and `Casting.buffCondition`
uses the spell's own name when the effect names none. The chip has the same
`ConditionSource` that a failed save writes, so `endSpellEffects` sweeps a buff
off every recipient when the caster stops concentrating.

Two riders on one creature both apply, so Bless and Bane cancel out on average
and neither one wins. `addCondition` matches names without case, and the
newer chip replaces the older one in the same place (see `sameSlot`) with its
source and its rider. Every other name test on chips goes through
`Conditions.conditionKey`, which trims a name and makes it lower case. The
helpers `hasCondition`, `standardCondition`, and `uniqueNames` use the same
key, so a name typed as " prone" matches the Prone chip in every path.

The hand-add dialog in `ui/ConditionsBar.js` takes only a name and a duration.
A chip that a GM adds by hand has no rider, so a chip named `Bless` by hand
changes no roll. For that case, the dice tray already takes a bonus die.

## Riders on hits

A chip can also add damage dice to hits. Divine Favor puts a chip on its
caster, and each weapon hit of the caster deals 1d4 radiant more. Hunter's
Mark puts a chip on a foe, and each weapon hit of the caster against that foe
deals 1d6 more. `Condition.hit` records this as a `HitRider`:
`{ count, sides, damageType, weaponOnly, mark }`. A rider with no
`damageType` takes the type of the hit's first damage term, which is how
Hunter's Mark deals the weapon's own type. `weaponOnly` limits the rider to
weapon hits, so a spell attack does not add it. `mark` puts the chip on the
target instead of the attacker, and only the caster that the chip's
`source.casterId` names gets the dice. A mark from one ranger therefore adds
nothing to the hits of another.

`entities/HitRiders.js` owns the model:

- `normalizeHitRider(value)` cleans a written block. A rider with no dice, or
  with a die that the dice tray does not know, reads as absent.
- `hitRiders(attacker, defender, { weapon })` lists the riders of one hit:
  the attacker's own chips without `mark`, and the defender's chips with a
  `mark` that the attacker cast.
- `hitRiderParts(riders, crit, baseType)` turns them into damage terms. A
  critical hit doubles the dice, like every other damage die of the hit.
- `hitRiderNote` names the riders for the damage line of the log, and
  `hitRiderSummary` describes one for the spell detail and the cast log.

A buff spell writes the rider through `SpellBuffEffect.hit`, and
`BuffCast.buffOutcomes` copies it onto each outcome, so the chip of the cast
contains it. A buff with `mark` set reaches foes rather than allies, because
`app/spellTargets.aids` excludes it from the helping kinds. The weapon swing
(`WeaponSwing.hitDamage`) reads the riders with `weapon: true`.
`CastRolls.resolveAttack` reads them with `weapon: false` for each attack
roll, and reports the note as `hitNote` on a single-attack outcome. A spell
with `autoHit` projectiles (Magic Missile) makes no attack roll, so it takes
no rider. A GM authors Hex as a buff with a `mark` rider of 1d6 necrotic and
no `weaponOnly`.

Hunter's Mark has `repeat: { cost: 'bonus' }`. The first cast opens a repeat
on the caster (see `SpellRepeat.js`), and a later turn offers **Repeat (no
slot)** for a bonus action, which marks a new creature under the same
concentration. The app does not check that the old target dropped to 0 HP,
and it leaves the old chip in place.
