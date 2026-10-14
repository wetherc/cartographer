---
---
# Rolls and lasting states

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

## Contents

- [Saving throws](#saving-throws)
  - [Ability checks](#ability-checks)
- [Exhaustion](#exhaustion)
  - [The slant on rolls](#the-slant-on-rolls)
  - [The sixth level](#the-sixth-level)
  - [Exhaustion stored as a chip](#exhaustion-stored-as-a-chip)
- [Concentration](#concentration)
  - [Where concentration begins and ends](#where-concentration-begins-and-ends)
- [Death saves](#death-saves)
  - [The roll](#the-roll)
  - [Damage and healing at 0 HP](#damage-and-healing-at-0-hp)
  - [Where the rules run](#where-the-rules-run)

## Saving throws

`entities/Checks.js` has both halves of a save. `saveBonus(character, ability)`
returns what a character adds: the ability modifier from the scores with
equipment applied, plus the proficiency bonus when a class granted that save.
`resolveSave(bonus, dc, { mode, rng, conditions })` rolls one d20 through the
shared dice roller and returns `{ roll, total, dc, natural, success, rider }`.
A total equal to the DC succeeds. `savingThrow(character, ability, dc, opts)`
combines the two functions and adds `proficient`, so a readout can explain the
number. `conditions` are the chips of the roller (see
[Riders on later rolls](spell-aftermath.md#riders-on-later-rolls)).

The two entry points exist because not every save is a character's save. The
save effect in `Casting.js` resolves every target through `resolveSave`, and a
target can be a creature, which keeps its scores in a different field and
reads proficiency by challenge rating. The resolver therefore takes a bonus
that the caller computed, and only the character path goes through
`saveBonus`.

The cast dialog follows that split. `targetSaveBonus` in `app/combatants.js`
returns a derived bonus for either kind of combatant. It returns nothing only
for a target that was deleted while the dialog was open. `app/castPlan.js`
adds the returned bonus to each target of a save spell and shows it in the
target picker, such as `Rook (WIS +6)`, in place of the AC that a save never
reads. The dialog asks for one typed number for the targets that have no
bonus, and it leaves that field out when every target has one. The session log
names the bonus beside the roll, in the same way that the log of a weapon
attack names the ability and the proficiency behind its total.

A natural 1 and a natural 20 are ordinary results on a save, unlike on an
attack roll, so the app reports `natural` for the log and takes no other
action on it.

### Ability checks

Ability checks work the same way. `checkBonus` is the ability modifier, plus
the proficiency bonus for a skill that the character is proficient in, doubled
where the character has expertise. `checkAbility` says which ability a key
uses. A skill id resolves through `data/skills.js`, and each of the six ability
keys stands for itself, which is how a plain Strength check works.
`resolveCheck` and `abilityCheck` match the two save entry points. Their DC can
be null, because a GM often calls for a check with no number in mind and reads
the total out loud. `passiveScore` is 10 plus a bonus, plus or minus 5 for
advantage or disadvantage, and `passivePerception` applies it to the
Perception bonus.

`ui/CharacterChecks.js` shows the six saves and the 18 skills on the sheet,
with passive Perception under the skills. A training dot is hollow for
untrained, solid for proficient, and ringed for expertise. A row is a button
when the host sets `onCheck`, and a plain line otherwise, which is the sheet
that a spectator sees.

`app/checkRolls.js` is the `onCheck` handler. It takes the bonus from the pure
helpers, rolls the rider dice, and gives one flat modifier to the dice tray.
The tray therefore throws the only d20, and the log line breaks the number
back into its parts. A roll from the sheet has no DC.

A character gets expertise in two ways. The Expertise features of the Rogue
and the Bard grant it through the pending-grant flow (see
[Class features](characters.md#class-features)). The Set expertise button
in the Progression section lets the GM grant it by hand to any character with a skill
proficiency, for subclasses and homebrew. The button opens a multiselect over the character's proficient skills and commits through
`Progression.withExpertise`. A creature has no expertise, so its bonus comes
from its training alone.

## Exhaustion

`entities/Exhaustion.js` models exhaustion by the 2014 rule, a ladder of six
levels where each level keeps the effects of the levels below it. Level 1
gives disadvantage on ability checks, level 2 halves speed, level 3 gives
disadvantage on attack rolls and saving throws, level 4 halves the HP
maximum, level 5 sets speed to 0, and level 6 kills.

The level is one number, `exhaustion`, on the character or the creature.
`exhaustionLevel` reads the number and limits it to the range 0 through
`MAX_EXHAUSTION` (6), so a hand-edited save cannot go past death or below
zero. `exhaustionSlant` gives the slant of a level on one kind of roll, and
`tiredSpeed` gives the walking speed. `atDeathLevel` reports the fatal level,
and `exhaustionNote` is the sentence for a badge or a log line.
`setExhaustion` and `easeExhaustion` are the writers, and
each limits its result to the same range.

The halved HP maximum is the one effect that the app stores. Every HP reader
reads the stored maximum, so `setExhaustion` runs `settleExhaustionHP`, which
moves the maximum when the level crosses 4 and records the cut in `hpHalved`.
This is the same pattern as `hpBoost`, which records the raise of Aid.
`HitDice.reconcileMaxHP` keeps the cut when a level-up changes the maximum,
and `app/characterEdit.js` adds the cut back to the maximum that the GM types.
When the level drops below 4, the cut comes back onto the maximum, and
current HP stays where it is.

This module imports only `PoolIds.js`. `Checks.js` imports this module, and
`DeathSaves.js` is built on `Checks.js`, so an import of either one from here
would close a cycle. The rules that combine exhaustion with death therefore
live with their callers.

### The slant on rolls

Exhaustion changes no printed bonus. `ConditionEffects.rollMode` takes the
level as the `tired` field of its query, and `slantsFor` adds the slant of
`exhaustionSlant` under the name "Exhaustion N", so `modeReasons` names it in
the log line. `saveOutcome`, `Checks.resolveSave`, and
`ImposedConditions.repeatSaves` pass the level on in the same way. Each roll
path reads the level of its roller:

- `app/checkRolls.js`, `Checks.savingThrow`, and `combat/Stealth.js` for
  checks and saves.
- `combat/WeaponSwing.js` and `app/spellCastResolve.js` for weapon and spell
  attacks, for a character or a creature.
- `app/spellCastResolve.js`, `app/weaponAttack.js`, `app/channelDivinityFlow.js`,
  and `CreatureHit.js` for saves against spells, hit riders, Turn Undead, and
  concentration.
- `DeathSaves.deathSaveMode` for both death-save paths.
- `combat/InitiativeRoll.js` for initiative, which is a DEX check.

`Checks.passivePerception` lowers a passive score by 5 from level 1, the
passive form of disadvantage.

### The sixth level

`app/exhaustionWrites.js` has the write that kills. `setCombatantExhaustion` sets the
level of one combatant by id, logs what the level costs, and then applies the
sixth level, which differs by the kind of combatant.

A character gets three failed death saves from `DeathSaves.killOutright`,
because the whole app reads three failures as dead, and the Unconscious chip
goes on with them. HP does not change, because exhaustion kills without damage,
and a damage write would show a wound that did not happen.

A creature goes to 0 HP through `Creature.slay`, the write that Power Word
Kill uses, and `logDefeatTransition` names it. 0 HP is the only way that a
creature leaves a fight. A damage write would spend temporary HP first and
leave the creature standing, and it would also end chips that damage ends,
such as the Unconscious of Sleep. A combatant
that is already dead takes the level and nothing else, so a second write
cannot log a second death.

A revive removes one level, because a combatant that comes back at the sixth
level would be alive and dead at the same time. `DeathSaves.clearDying` does
this for a character, which covers a heal above 0 HP and a natural 20 on a
death save. `Creature.heal` does it for a creature that the heal brings above
0 HP. This rule is not in `app/exhaustionWrites.js`, because a revive happens in more
places than that module can see.

A long rest removes one level through `Character.longRest`. A character at
0 HP gains nothing from a long rest (`gainsLongRest`, PHB p.186), so a dead
character keeps the level that killed it, and a dying or stable character
keeps its HP, death saves, and pools. The guard is in `longRest` and not at
the call site, because the Time panel rests every character at once and does
not check who is up. The Time panel logs one line for each character that
gains nothing. A short rest removes no level.

### Exhaustion stored as a chip

`exhaustionFields` coerces a save that stores exhaustion as a hand-added
condition chip with no level, and both `withDefaults` functions call it. A chip
with no stored level reads as level 1, the least that a GM can mean by the
chip, and the chip comes off. A stored level wins over a chip beside it, and
the chip still comes off. The level and the chip therefore can never disagree.

## Concentration

Many spells last only while the caster concentrates on them, and a caster can
concentrate on only one spell at a time. `entities/Concentration.js` models
this with a `concentration` field on the caster, which can be a party
character or a creature. The field records the spell's id and name, the level
it was cast at, and `remaining`, the rounds left. The field is null or absent
when the caster concentrates on nothing.

- `begin(character, spell, slotLevel)` starts concentration. It takes
  `remaining` from the spell's duration through `durationInRounds`. A duration
  that no round count fits, such as an open-ended one or one in days, reads as
  null and lasts until something breaks it. A second spell ends the first, and
  the ended spell comes back in `dropped`, so the caller can report it and
  clear its effects.
- `drop(character)` ends concentration for any reason.
- `dropIfHelpless(character)` ends concentration when the character's chips
  leave it unable to act, such as Paralyzed, Stunned, or the Unconscious chip
  that a death adds. It returns the ended spell, so the caller can release
  what the spell held.
- `concentrationDC(damage)` is 10, or half the damage when that is more.
  `checkOnDamage(character, damage, opts)` rolls the CON save against that DC
  through `savingThrow` and drops the spell on a failure. It returns the whole
  save, so the log can show the DC and the roll.
- `tick(character, rounds)` spends `rounds` of the duration (one by default)
  and reports `expired` when the duration runs out.

The `Concentrating` chip is for display only. `begin` writes it, `drop`
removes it, and `tick` writes its counter again from `remaining` instead of
counting it down. The round wrap and the game clock both call `TimedEffects.elapse`, which
elapses the chips first and then calls `tick`, so the GM reads the counter of
the state. The clock passes the same function for characters and creatures,
so a creature concentrating outside a fight runs out on time, and `passTime`
then ends the chips and summons of its spell. `Conditions.js` exports the chip's name as `CONCENTRATING`, so the two
modules use the same spelling.

### Where concentration begins and ends

- `app/spellCastResolve.js` begins concentration when a cast of a
  concentration spell succeeds. It writes the field onto the same entity as
  the spent slot and the consumed component, so one store call covers all
  three.
- `applyToTarget` in `app/combatantWrites.js` calls for the save on damage. Weapon
  hits and spell damage both arrive through this function. A character
  knocked to 0 HP loses the spell with no roll.
- The round wrap in `app/fightState.js` ticks the duration and logs a
  spell that ran out.
- `storeCharacterChips` in `app/combatantWrites.js` stores a character whose chips
  changed, through `dropIfHelpless`. A spell that paralyzes the caster and a
  death from exhaustion both go through it.
- The conditions bar of the character sheet ends the spell in the same way
  when the GM adds a chip that stops actions.

Every damage path checks a character's concentration, the `-1 HP` button of
the character sheet included, because all of them go through
`CharacterHit.hitCharacter` (see [Death saves](#death-saves)).

A creature caster concentrates in the same way. `settleConcentration(prev,
next)` in `entities/CreatureHit.js` reads one write to a creature. It ends the
creature's spell on a drop to 0 HP, a failed CON save after damage, a chip that
stops it acting, or a hand removal of the `Concentrating` chip. The save uses
the creature's own bonus from `creatureSaveBonus`. `storeCreature` in
`app/combatantWrites.js` applies it to every creature write: `applyToTarget`,
`applyConditionToTarget`, the exhaustion stepper, and the `onUpdate` of the
Encounters and NPC panels. The Drop control of the combat screen works for a
creature caster too, and the round wrap ticks its duration.

## Death saves

A party character at 0 HP is not dead yet. It rolls death saves until three
succeed or three fail. `entities/DeathSaves.js` models this with a
`deathSaves` field on the character, which records `successes`, `failures`,
and `stable`. The field is null for a character who is not dying.

- `isDying` and `isDead` tell a rolling character and one killed by three
  failures apart. A character at 0 HP with `deathSaves.stable` set is out of
  danger.
- `dropToDying(character)` starts the tracker. A second call on a character
  who already has one changes nothing, so the failures already rolled stay.
- `clearDying(character)` removes the tracker, which a heal above 0 HP and a
  natural 20 both do.
- `stabilize(character)` sets `stable` and resets the counters. The character
  stays at 0 HP and unconscious. A dead character cannot be stabilized.
- `judgeDeathSave(state, roll)` maps one rolled d20 to the next tracker state
  and names the outcome: `revive`, `success`, `stable`, `failure`, or `dead`.
- `applyJudged(character, state)` writes a judged tracker back. A revive
  restores 1 HP and then calls `clearDying`.
- `recordDamage(character, { crit })` applies damage to a character already at
  0 HP.

### The roll

The DC is a flat 10. A natural 20 revives the character at 1 HP, whatever the
counters say. A natural 1 counts as two failures, and it fails even when a
rider raises the total past the DC. Otherwise, a total equal to the DC
succeeds, as on every other save.

A death save adds no ability modifier and no proficiency, so its bonus is 0.
`app/deathSaveRolls.js` rolls the riders of the character, such as Bless, and puts
them in the modifier of the tray. The roll names no ability, so the automatic
failure that unconsciousness imposes on Strength and Dexterity saves does not
apply to a death save.

### Damage and healing at 0 HP

A heal above 0 HP clears the tracker of a dying or stable character. The rule
is in `restoreResource`, because every heal in the app goes through that
function: the heal control of the combat screen, the HP stepper of the sheet,
a healing spell, a rest, and a spent hit die. The function lives in
`ResourceRestore.js`, and `Character.js` re-exports it. `HitDice.js` imports it
from there, because `Character.js` imports `HitDice.js` and the reverse import
would form a cycle. A character at 5 HP can therefore never read as dying.

The same function refuses HP to a dead character (three failures), and
`Character.restAll` skips its HP pool. Without the guard, a Healing Word or a
long rest would bring the character back. Only a heal effect with
`revives: true` (Revivify) raises the dead. `CharacterHit.healCharacter` reads
the flag: it clears the tracker with `clearDying` and then heals, and it has no
effect on a character that is not dead. Each refusal comes back as a `dead` or
`living` event for the log.

A cast checks each target with `HealTarget.healBlocked` before it heals. The
check covers creatures too. A creature at 0 HP takes no healing from a spell
that does not revive, and a reviving spell has no effect on a creature above
0 HP. The heal control of the combat screen skips the creature check, so the
GM can still bring back an NPC that was only knocked out.

Damage on a character already at 0 HP is an automatic failure with no roll,
and a critical hit counts as two failures. Damage on a stable character makes
it dying again, with that failure against it, which is the 2014 rule. The hit
that drops the character to 0 HP costs no failure.

Damage left over past 0 HP that is at least the HP maximum kills at once,
which is the 5e massive damage rule. Bonus HP (temporary hit points) absorbs
the hit first, so it does not count toward the leftover. The rule applies to
the hit that drops the character and to a hit on a character already at 0 HP.

The `Unconscious` chip goes on with the tracker and comes off with it, so no
caller tracks both. `Conditions.js` exports the chip's name as `UNCONSCIOUS`.
The chip gives an attacker advantage and makes a melee hit a critical hit,
through the condition-effect table, so the crit rule needs no special case
here. A plain `Prone` chip goes on beside it through `Conditions.withProne`,
because an unconscious creature falls prone in 5e. With both chips, a melee
attack has advantage, and a ranged attack has advantage from Unconscious and
disadvantage from Prone, so it rolls normally. The Prone chip has no
duration, so it stays when the character is healed, and the GM removes it
when the character stands up. `applyConditionToTarget` in
`app/combatantWrites.js` adds the same chip when a cast such as Sleep puts
Unconscious on a target that is not immune to Prone.

### Where the rules run

`entities/CharacterHit.js` applies these rules. `hitCharacter` and
`healCharacter` return the character after the change, the events to log, and
the spell that the hit ended. The events are the drop to 0, massive damage, a
failure while down, a heal above 0, and the concentration outcome. The
consequences go into the same write as the HP change.

`applyToTarget` in `app/combatantWrites.js` calls these functions and logs the
events. Every hit and every heal arrives through that function, including the
HP steppers of the character sheet, which reach it through the sheet's
`hpStep` host. `applyToTarget` takes `opts.crit` for the doubled failure, and
`app/weaponAttack.js` passes it. Spell damage does not pass it.

The death save roll comes from a button, in the active column of the combat
screen and on the character sheet, and not from the turn advance.
`retryImposedSaves` rolls bookkeeping saves automatically, but a death save is
the player's roll, and the dice tray shows only throws that someone asked for.
`app/deathSaveRolls.js` owns both buttons. It follows the same split as
`app/checkRolls.js`: the riders roll in the app, the tray throws the only d20,
and `judgeDeathSave` reads the result. The entities module has no roll
function of its own, so the tray throws the only d20.

`view/DeathSaveView.js` turns one tracker into the words and pip counts that a
panel draws, and `ui/DeathSaveBlock.js` builds the line from them. The combat
screen and the character sheet both call that builder, so they always describe
a tracker the same way. `CombatantRow.deathSaves` puts the tracker on the
board, where a card shows a Dying, Stable, or Dead chip beside its conditions.

Only characters roll death saves. A creature is defeated at 0 HP.
