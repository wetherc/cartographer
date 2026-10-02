import { sourceSlant } from '../entities/SourceSlant.js';
import { attackTweak, rollDamage } from '../dice/DiceRoller.js';
import { attackAbility, weaponKind } from '../entities/Weapons.js';
import { unproficientWear } from '../entities/Armor.js';
import { d20Penalty, exhaustionLevel } from '../entities/Exhaustion.js';
import { sneakAttackDice } from '../entities/Features.js';
import { formatModifier } from '../entities/Modifiers.js';
import { rollRiders } from '../entities/Riders.js';
import { hitRiderNote, hitRiderParts, hitRiders } from '../entities/HitRiders.js';
import { pactDamage } from '../entities/PactWeapon.js';
import { riderSources } from '../entities/FeatChoices.js';
import { autoCrits, modeReasons, rollMode } from '../entities/ConditionEffects.js';
import { defenseNote } from '../entities/DamageDefenses.js';
import { attackerType } from '../entities/ChipSlants.js';
import { allowsSneakAttack, hasFreeHandFor } from './AttackOptions.js';
import { coverBonus, coverNote } from './Cover.js';
import { offhandDamageModifier } from './TwoWeapon.js';
import {
  offhandAddsModifier,
  styleAttackBonus,
  styleDamageBonus,
  styleRerollBelow,
} from '../entities/FightingStyle.js';
import {
  abilityModOf,
  attackerProficiency,
  attackerProficientWith,
  attackerStats,
  damageModifier,
  damageParts,
  droppedNote,
} from './AttackResolve.js';

/**
 * The pure steps of one weapon swing: the numbers and the slants that the
 * attack roll takes, the log line of that roll, and the damage of a hit with
 * its log and toast lines. `app/weaponAttack.js` spends the turn's budget,
 * rolls the d20 in the dice tray, asks about the defender's reaction, and
 * writes the results.
 */

/** @typedef {import('./AttackTweaks.js').AttackTweaks} AttackTweaks */
/** @typedef {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} Weapon */

/**
 * Everything that the attack roll of one swing needs, worked out before the
 * d20 rolls.
 * @typedef {{
 *   ability: string,
 *   abilityMod: number,
 *   proficiency: number,
 *   proficient: boolean,
 *   tired: number,
 *   style: number,
 *   modifier: number,
 *   tweak: ReturnType<typeof attackTweak>,
 *   rider: ReturnType<typeof rollRiders>,
 *   melee: boolean,
 *   conditionQuery: Parameters<typeof rollMode>[0],
 *   picked: import('../types/dice.js').RollMode | null,
 *   longSlant: 'disadvantage' | null,
 *   badWear: string[],
 *   wearSlant: 'disadvantage' | null,
 *   mode: import('../types/dice.js').RollMode | null,
 *   cover: number,
 *   ac: number,
 *   autoCrit: boolean,
 * }} SwingSetup
 */

/**
 * Work out the attack roll of one swing: the ability and its modifier, the
 * proficiency bonus, the exhaustion penalty, the dialog's bonus or penalty
 * dice, the rider chips, the mode that the chips and the dialog give, and the
 * AC with cover. The penalty dice roll inside `attackTweak`, and the rider
 * dice roll with `rng`, in that order.
 * @param {{
 *   attacker: any,
 *   defender: import('../app/combatants.js').CombatTarget,
 *   weapon: Weapon,
 *   tweaks: AttackTweaks,
 *   rng: () => number,
 * }} swing
 * @returns {SwingSetup}
 */
export function prepareSwing({ attacker, defender, weapon, tweaks, rng }) {
  const stats = attackerStats(attacker);
  // A finesse weapon reads the attacker here: it takes the higher of the
  // attacker's STR and DEX.
  const ability = attackAbility(weapon, stats);
  const abilityMod = abilityModOf(stats, ability);
  // A character reads the level ladder. A rated creature reads the challenge
  // rating ladder, the same one its saves and spells use.
  const proficiency = attackerProficiency(attacker);
  const proficient = attackerProficientWith(attacker, weapon);
  // An attack roll is a d20 test, so exhaustion takes 2 off it for each level.
  // Both kinds of attacker carry the level, so a tired foe swings worse too.
  // Damage is untouched: the penalty is on the roll, not on the hit.
  const tired = d20Penalty(attacker);
  // The Archery fighting style adds 2 to a ranged weapon.
  const style = styleAttackBonus(attacker, weapon);
  const attackBonus = abilityMod + (proficient ? proficiency : 0) + tired + style;
  // Bonus attack dice join the d20 in the tray's selection, so they roll in
  // view. `attackTweak` rolls penalty dice and folds them into the modifier,
  // and keeps the values in its note for the log.
  const tweak = attackTweak(
    tweaks.attackDice ?? 0,
    tweaks.attackDie ?? 'd4',
    tweaks.attackFlat ?? 0,
  );
  // A Bless or Bane chip on the attacker adds its die here, without the GM
  // typing it into the dialog. Its dice roll outside the tray, the same way
  // the dialog's penalty dice already do, so a bonus and a penalty read the
  // same in the log.
  const rider = rollRiders(riderSources(attacker), 'attack', rng);
  // The chips on both sides decide the mode. Reach matters, because a prone
  // defender is easier to hit in melee and harder to hit at range. The
  // weapon's kind is the reach signal, and a thrown melee weapon counts as
  // ranged for the throw the GM picked in the dialog.
  const melee = weaponKind(weapon) !== 'ranged' && !tweaks.thrown;
  const conditionQuery = /** @type {const} */ ({
    roller: attacker.conditions,
    target: defender.conditions,
    kind: 'attack',
    melee,
    rollerType: attackerType(attacker),
  });
  // A mode the GM picked in the dialog wins over the chips, and it is always
  // passed on, so a picked `normal` also cancels the tray's standing toggle
  // for this roll. Under `auto`, a null mode means no chip slanted the roll,
  // and the key stays off the selection so the tray's toggle still applies.
  // A shot past normal range adds one disadvantage slant, and so does armor
  // the attacker is not trained for, because every weapon attack rolls off
  // STR or DEX. Both fold in with the chip slants under the 5e rule: any
  // advantage cancels any number of disadvantages to a straight roll.
  const picked = tweaks.mode && tweaks.mode !== 'auto' ? tweaks.mode : null;
  const longSlant = tweaks.longRange ? 'disadvantage' : null;
  const badWear = unproficientWear(attacker);
  const wearSlant = badWear.length > 0 ? 'disadvantage' : null;
  // A chip from the defender's own spell can slant the swing (Chill Touch on
  // an undead attacker).
  const sourced = sourceSlant(attacker.conditions, defender.id);
  // Pack Tactics is the GM's call in the dialog, and it adds one advantage
  // slant that folds in with the rest.
  const packSlant = tweaks.pack ? 'advantage' : null;
  // The weak swing of a Multiattack, such as the second scimitar attack of a
  // goblin boss, adds one disadvantage slant.
  const weakSlant = tweaks.weak ? 'disadvantage' : null;
  const mode =
    picked ?? rollMode(conditionQuery, [longSlant, wearSlant, sourced, packSlant, weakSlant]);
  // Cover is the GM's call in the dialog, and it raises the AC of this one
  // swing. Nothing on the map says who stands behind what, so no rule here
  // could work it out.
  const cover = coverBonus(tweaks.cover);
  return {
    ability,
    abilityMod,
    proficiency,
    proficient,
    tired,
    style,
    modifier: attackBonus + tweak.modifier + rider.modifier,
    tweak,
    rider,
    melee,
    conditionQuery,
    picked,
    longSlant,
    badWear,
    wearSlant,
    mode,
    cover,
    ac: defender.ac + cover,
    // A helpless defender turns any melee hit into a critical one, without a
    // natural 20.
    autoCrit: autoCrits(defender.conditions, { melee }),
  };
}

/**
 * The log line of the attack roll: who swings at whom with what, every part
 * of the bonus, the total against the AC that the roll answered to, and the
 * outcome.
 * @param {SwingSetup} setup
 * @param {{
 *   attacker: any,
 *   defender: import('../app/combatants.js').CombatTarget,
 *   weapon: Weapon,
 *   tweaks: AttackTweaks,
 *   swingNote: string,
 *   total: number,
 *   d20: import('../types/dice.js').DieTypeResult | undefined,
 *   rollMode: import('../types/dice.js').RollMode | undefined,
 *   raised: number,
 *   wardName: string | null,
 *   outcome: string,
 *   attackerName?: string,
 *   defenderName?: string,
 * }} roll
 * @returns {string}
 */
export function attackLine(setup, roll) {
  const { attacker, defender, weapon, tweaks, raised } = roll;
  const { tweak, rider, picked, conditionQuery, longSlant, wearSlant, badWear } = setup;
  const warded = setup.ac + raised;
  // An advantage or disadvantage attack notes the discarded d20, so the log
  // shows both dice and matches the tray's own readout.
  const modeNote = droppedNote(roll.d20, roll.rollMode);
  const tweakNote = tweak.note ? `, ${tweak.note}` : '';
  const riderNote = rider.note ? `, ${rider.note}` : '';
  // Naming the chips keeps a cancelled pair readable: the log says why the
  // roll came out straight, not just that it did.
  // A GM-picked mode replaces the chip reasons, because the chips no longer
  // decide the roll and naming them would say the opposite of what happened.
  const slantReasons = [
    modeReasons(conditionQuery),
    longSlant && !picked ? 'long range disadvantage' : '',
    wearSlant && !picked ? `not proficient with ${badWear.join(' and ')}, disadvantage` : '',
    tweaks.pack && !picked ? 'Pack Tactics advantage' : '',
    tweaks.weak && !picked ? 'Multiattack disadvantage' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const reasons = picked ? `${picked} set by the GM` : slantReasons;
  const conditionNote = reasons ? `, ${reasons}` : '';
  const proficiencyNote = setup.proficient ? `proficiency +${setup.proficiency}` : 'not proficient';
  const tiredNote = setup.tired ? `, exhaustion ${exhaustionLevel(attacker)} ${setup.tired}` : '';
  const styleNote = setup.style ? `, Archery +${setup.style}` : '';
  // An off-hand swing and an opportunity attack both roll to hit like any other
  // swing, so the note sits on the attack line: it says where the missing damage
  // bonus went, or which part of the turn the swing came out of.
  const handNote = roll.swingNote;
  // The AC in the log is the one the roll answered to, and the cover note says
  // where the difference came from.
  const coverAC = setup.cover ? ` (${defender.ac} ${coverNote(tweaks.cover)})` : '';
  const wardAC = raised && roll.wardName ? ` (${roll.wardName} +${raised})` : '';
  return `${roll.attackerName ?? attacker.name} attacks ${roll.defenderName ?? defender.name} with ${weapon.name}${handNote} (${setup.ability} ${formatModifier(setup.abilityMod)}, ${proficiencyNote}${tiredNote}${styleNote}${tweakNote}${riderNote}${conditionNote}): ${roll.total} to hit vs AC ${warded}${coverAC}${wardAC}${modeNote}, ${roll.outcome}.`;
}

/**
 * Roll the damage of a hit. A crit rolls every damage die twice, including
 * the dialog's added dice. The ability modifier still adds only once, and
 * proficiency never reaches damage. `sneakDice` is how many d6 Sneak Attack
 * added, so the caller can spend the flag for the turn. `riderNote` names the
 * hit riders and the Lifedrinker damage that the hit added, for the log.
 * @param {SwingSetup} setup
 * @param {{ attacker: any, defender?: { conditions?: import('../types/entities.js').Condition[] }, weapon: Weapon, tweaks: AttackTweaks, crit: boolean, rng: () => number }} hit
 * @returns {{ damage: ReturnType<typeof rollDamage>, sneakDice: number, riderNote: string }}
 */
export function hitDamage(setup, { attacker, defender = {}, weapon, tweaks, crit, rng }) {
  // A two-handed swing of a versatile weapon reads the two-handed dice
  // instead of the one-handed ones. The live attacker must still have the
  // other hand free, because the dialog read the equipment before its await.
  const twoHanded =
    tweaks.twoHanded &&
    hasFreeHandFor(attacker, weapon) &&
    'versatileDamage' in weapon &&
    weapon.versatileDamage?.length;
  // Sneak Attack adds its dice only on a hit. An attacker without the
  // feature, or a weapon that is neither finesse nor ranged, has no dice to
  // add, whatever the dialog said.
  const sneakDice = tweaks.sneak && allowsSneakAttack(weapon) ? sneakAttackDice(attacker) : 0;
  const parts = damageParts((twoHanded ? weapon.versatileDamage : weapon.damage) ?? [], {
    crit,
    bonusDice: tweaks.damageDice ?? 0,
    bonusDie: tweaks.damageDie ?? 'd4',
    sneakDice,
  });
  // Surprise Attack dice take the weapon's damage type, and a crit doubles
  // them like any other damage die.
  const surprise = tweaks.surprise;
  if (surprise) {
    parts.push({
      count: crit ? surprise.count * 2 : surprise.count,
      sides: surprise.sides,
      damageType: parts[0]?.damageType ?? 'bonus',
    });
  }
  const surpriseNote = surprise ? `, Surprise Attack +${surprise.count}d${surprise.sides}` : '';
  // The second hand of two-weapon fighting adds no ability bonus to damage,
  // unless the attacker has the Two-Weapon Fighting style. A negative modifier
  // still applies, so the swing of a weak character is still weak.
  const damageMod =
    tweaks.offhand && !offhandAddsModifier(attacker)
      ? offhandDamageModifier(setup.abilityMod)
      : setup.abilityMod;
  // Dueling adds a flat 2, and Great Weapon Fighting rerolls a 1 or a 2 on
  // each damage die of the weapon swing.
  const swing = { melee: setup.melee, twoHanded: !!twoHanded };
  const dueling = styleDamageBonus(attacker, weapon, swing);
  const reroll = styleRerollBelow(attacker, weapon, swing);
  const styled = reroll ? parts.map((part) => ({ ...part, rerollBelow: reroll })) : parts;
  const styleNote = `${dueling ? `, Dueling +${dueling}` : ''}${reroll ? ', Great Weapon Fighting' : ''}`;
  // Hit riders (Divine Favor, Hunter's Mark) add dice that a crit doubles.
  // Lifedrinker adds a flat amount, which a crit leaves alone.
  const riders = hitRiders(attacker, defender, { weapon: true });
  const baseType = parts[0]?.damageType ?? 'bonus';
  const drink = pactDamage(attacker, weapon, attackerStats(attacker));
  const damage = rollDamage(
    [...styled, ...hitRiderParts(riders, crit, baseType), ...(drink ? [drink.part] : [])],
    damageModifier(damageMod + dueling, tweaks.damageFlat ?? 0),
    rng,
  );
  const drinkNote = drink ? `, ${drink.name} +${drink.part.bonus} ${drink.part.damageType}` : '';
  return {
    damage,
    sneakDice,
    riderNote: hitRiderNote(riders, crit) + drinkNote + styleNote + surpriseNote,
  };
}

/**
 * The log line and the toast of a hit. The travelogue keeps the raw damage
 * dice as detail, and the toast keeps only the short per-type totals as text.
 * `taken` is the damage after the defender's resistances, vulnerabilities, and
 * immunities, which the log names beside the roll.
 * @param {{
 *   weapon: Weapon,
 *   defenderName: string,
 *   crit: boolean,
 *   damage: ReturnType<typeof rollDamage>,
 *   sneakDice: number,
 *   riderNote?: string,
 *   taken: { total: number, notes: string[] },
 * }} hit
 * @returns {{ log: string, toast: string }}
 */
export function hitLines({ weapon, defenderName, crit, damage, sneakDice, riderNote = '', taken }) {
  const inflicts =
    'statusEffects' in weapon && weapon.statusEffects?.length
      ? `, inflicting ${weapon.statusEffects.join(', ')}`
      : '';
  const blow = crit ? 'critically hits' : 'hits';
  // The dice are already inside the detail, so the note only names how many of
  // them came from Sneak Attack. A crit doubled that count too.
  const sneakNote =
    sneakDice > 0 ? `, with sneak attack ${crit ? sneakDice * 2 : sneakDice}d6` : '';
  const defended = defenseNote(taken.notes, taken.total);
  const text = defended ? `${taken.total} damage` : damage.text || 'no damage';
  return {
    log: `${weapon.name} ${blow} ${defenderName} for ${damage.detail || '0 damage'}${sneakNote}${riderNote}${inflicts}${defended}.`,
    toast: `${crit ? 'Critical hit!' : 'Hit!'} ${defenderName} takes ${text}${inflicts}.`,
  };
}
