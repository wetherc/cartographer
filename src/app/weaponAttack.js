import { promptModal } from '../ui/Modal.js';
import { rollDamage, attackTweak } from '../dice/DiceRoller.js';
import { attackAbility, weaponKind } from '../entities/Weapons.js';
import { formatModifier, proficiencyBonus } from '../entities/Modifiers.js';
import { rollRiders } from '../entities/Riders.js';
import { autoCrits, modeReasons, rollMode } from '../entities/ConditionEffects.js';
import {
  abilityModOf,
  attackerStats,
  damageModifier,
  damageParts,
  droppedNote,
  resolveAttack,
} from '../combat/AttackResolve.js';
import { findCombatant, combatantsAsTargets, applyToTarget } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./combatants.js').CombatTarget} CombatTarget */

/**
 * The situational overrides a pre-roll dialog can add to one attack: the mode
 * of the d20, bonus or penalty dice and a flat bonus on the attack roll, and
 * extra dice and a flat rider on the damage. Every field defaults to nothing,
 * so a plain Enter in the dialog rolls the unmodified attack.
 * @typedef {{
 *   mode?: AttackMode,
 *   attackDice?: number,
 *   attackDie?: import('../types/dice.js').DieType,
 *   attackFlat?: number,
 *   damageDice?: number,
 *   damageDie?: import('../types/dice.js').DieType,
 *   damageFlat?: number,
 * }} AttackTweaks
 */

/**
 * What the dialog's mode control can say. `auto` is the default and reads the
 * mode off the condition chips, falling back to the dice tray's standing
 * toggle. The other three are the GM's call for this one attack, and each of
 * them beats both, including `normal`, which is how a GM cancels a standing
 * toggle for one roll.
 * @typedef {'auto' | import('../types/dice.js').RollMode} AttackMode
 */

/** The mode control's options, in the order they read best. */
const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto (from conditions)' },
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
];

/** The dice the pre-roll dialog offers for a bonus or penalty die. */
const BONUS_DICE = /** @type {import('../types/dice.js').DieType[]} */ ([
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
]);

/**
 * Who can attack and who is left to attack. The attacker is a party character
 * or an armed creature. An unarmed creature still resolves here, but
 * `weaponsOf` gives it no weapon, so the attack UI stays quiet for it.
 * Defenders come from the opposite side of the running order. Downed
 * combatants drop out.
 * @param {AppContext} app
 * @param {import('../types/combat.js').CombatState} combat
 * @param {import('../types/combat.js').Participant} participant
 * @returns {{ attacker: any, defenders: CombatTarget[] } | null}
 */
export function attackParticipants(app, combat, participant) {
  const found = findCombatant(app, participant.id);
  if (!found) return null;
  return { attacker: found.entity, defenders: combatantsAsTargets(app, combat, participant) };
}

/**
 * Read the pre-roll dialog's answers into the override shape the roll takes.
 * A blank or unreadable field counts as no override.
 * @param {Record<string, string>} values
 * @returns {AttackTweaks}
 */
export function readAttackTweaks(values) {
  return {
    mode: /** @type {AttackMode} */ (values['mode'] || 'auto'),
    attackDice: Number(values['atk-count']) || 0,
    attackDie: /** @type {import('../types/dice.js').DieType} */ (values['atk-die']),
    attackFlat: Number(values['atk-flat']) || 0,
    damageDice: Number(values['dmg-count']) || 0,
    damageDie: /** @type {import('../types/dice.js').DieType} */ (values['dmg-die']),
    damageFlat: Number(values['dmg-flat']) || 0,
  };
}

/**
 * Roll one attack against one defender, then log and apply what it did. This
 * is everything the attack does once the dialog has picked a defender and any
 * overrides. The dialog itself stays in `weaponAttack`, so this half runs and
 * is tested without a browser.
 *
 * The roll loads 1d20, the weapon ability's modifier, the attacker's
 * proficiency bonus, any bonus dice, and the defender's AC into the dice tray.
 * A natural 20 hits whatever the AC and doubles the damage dice. A natural 1
 * always misses. Otherwise the total meets or beats AC to hit. On a hit the
 * weapon's damage rolls, with the ability modifier folded into the base term
 * and proficiency left out, and the result applies to the defender through the
 * shared write path.
 * A rider chip on the attacker, such as Bless, adds its own die to the roll.
 * The chips on both sides also set the roll's mode, unless the dialog picked
 * one, and a hit on a helpless defender in melee is a critical one whatever
 * the d20 showed.
 *
 * The attack roll goes through the dice tray, which owns its own randomness.
 * `rng` is the source for the damage roll and for the rider dice, injected
 * the way the pure modules take theirs.
 * @param {AppContext} app
 * @param {{
 *   attacker: any,
 *   defender: CombatTarget,
 *   weapon: import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon,
 *   tweaks?: AttackTweaks,
 *   rng?: () => number,
 * }} attack
 */
export function rollWeaponAttack(
  app,
  { attacker, defender, weapon, tweaks = {}, rng = Math.random },
) {
  const stats = attackerStats(attacker);
  // A finesse weapon reads the attacker here: it takes the higher of the
  // attacker's STR and DEX.
  const ability = attackAbility(weapon, stats);
  const abilityMod = abilityModOf(stats, ability);
  // A character always carries a level, and a leveled creature does too. An
  // unleveled creature falls back to its caster level, and to 1 for a
  // non-caster. Every combatant is proficient with what it holds until the
  // weapon overhaul gates that.
  const proficiency = proficiencyBonus(attacker.level ?? attacker.casterLevel ?? 1);
  const attackBonus = abilityMod + proficiency;
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
  const rider = rollRiders(attacker.conditions, 'attack', rng);
  // The chips on both sides decide the mode. Reach matters, because a prone
  // defender is easier to hit in melee and harder to hit at range. The
  // weapon's kind is the reach signal.
  const melee = weaponKind(weapon) !== 'ranged';
  const conditionQuery = /** @type {const} */ ({
    roller: attacker.conditions,
    target: defender.conditions,
    kind: 'attack',
    melee,
  });
  // A mode the GM picked in the dialog wins over the chips, and it is always
  // passed on, so a picked `normal` also cancels the tray's standing toggle
  // for this roll. Under `auto`, a null mode means no chip slanted the roll,
  // and the key stays off the selection so the tray's toggle still applies.
  const picked = tweaks.mode && tweaks.mode !== 'auto' ? tweaks.mode : null;
  const mode = picked ?? rollMode(conditionQuery);
  const { result } = app.actions.rollDice(
    {
      counts: { d20: 1, ...tweak.counts },
      modifier: attackBonus + tweak.modifier + rider.modifier,
      ...(mode ? { mode } : {}),
    },
    defender.ac,
  );
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  const { crit, hit, outcome } = resolveAttack({
    natural,
    total: result.total,
    ac: defender.ac,
    // A helpless defender turns any melee hit into a critical one, without a
    // natural 20.
    autoCrit: autoCrits(defender.conditions, { melee }),
  });
  // An advantage or disadvantage attack notes the discarded d20, so the log
  // shows both dice and matches the tray's own readout.
  const modeNote = droppedNote(d20, result.selection.mode);
  const tweakNote = tweak.note ? `, ${tweak.note}` : '';
  const riderNote = rider.note ? `, ${rider.note}` : '';
  // Naming the chips keeps a cancelled pair readable: the log says why the
  // roll came out straight, not just that it did.
  // A GM-picked mode replaces the chip reasons, because the chips no longer
  // decide the roll and naming them would say the opposite of what happened.
  const reasons = picked ? `${picked} set by the GM` : modeReasons(conditionQuery);
  const conditionNote = reasons ? `, ${reasons}` : '';
  app.actions.logEvent(
    'combat',
    `${attacker.name} attacks ${defender.name} with ${weapon.name} (${ability} ${formatModifier(abilityMod)}, proficiency +${proficiency}${tweakNote}${riderNote}${conditionNote}): ${result.total} to hit vs AC ${defender.ac}${modeNote} — ${outcome}.`,
  );
  if (!hit) {
    app.toasts.show(
      `${result.total} vs AC ${defender.ac}: ${attacker.name} misses ${defender.name}.`,
    );
    return;
  }
  // A crit rolls every damage die twice, including the dialog's added dice.
  // The ability modifier still adds only once, and proficiency never
  // reaches damage.
  const parts = damageParts(weapon.damage ?? [], {
    crit,
    bonusDice: tweaks.damageDice ?? 0,
    bonusDie: tweaks.damageDie ?? 'd4',
  });
  const damage = rollDamage(parts, damageModifier(abilityMod, tweaks.damageFlat ?? 0), rng);
  const inflicts =
    'statusEffects' in weapon && weapon.statusEffects?.length
      ? `, inflicting ${weapon.statusEffects.join(', ')}`
      : '';
  const blow = crit ? 'critically hits' : 'hits';
  // The travelogue keeps the raw damage dice as detail. The toast below
  // keeps only the short per-type totals as text.
  app.actions.logEvent(
    'combat',
    `${weapon.name} ${blow} ${defender.name} for ${damage.detail || '0 damage'}${inflicts}.`,
  );
  // Applies the damage on the spot through the shared write path. Every
  // combatant tracks HP, and the function logs a defeat or a drop to 0
  // only once.
  applyToTarget(app, defender.id, damage.total, false, { crit });
  app.toasts.show(
    `${crit ? 'Critical hit!' : 'Hit!'} ${defender.name} takes ${damage.text || 'no damage'}${inflicts}.`,
  );
}

/**
 * Rolls a weapon attack for the active combatant, in 5e style. A pre-roll
 * dialog picks the defender and how the d20 rolls, and takes situational
 * overrides: bonus or penalty dice on the attack roll (Bless +1d4, Bane
 * -1d4), extra damage dice (a smite), and flat bonuses on either roll. The
 * mode defaults to reading the condition chips, and picking one of the three
 * modes there overrides both the chips and the dice tray's standing toggle for
 * this roll. The function then loads 1d20,
 * the attacker's ability modifier, proficiency bonus, any overrides, and the
 * defender's AC into the dice tray, and rolls. A natural 20 hits regardless
 * of AC and doubles the damage dice, for a critical hit. A natural 1 always
 * misses. Otherwise the function compares the total against AC. On a hit,
 * the weapon's damage dice roll too: the ability modifier folds into the
 * base term, and proficiency never adds to damage. The function applies the
 * result to the defender automatically. Creatures lose HP on the spot, and
 * party characters take it through bonus HP first. Party members attack
 * with their equipped weapons, and a creature attacks with its assigned
 * weapon. Everything lands in the travelogue and in a toast.
 * @param {AppContext} app
 * @param {import('../types/combat.js').CombatState} combat
 * @param {import('../types/combat.js').Participant} participant
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 * @param {{ defenderId?: string | null }} [options] If a defender is already
 *   picked on the combat board, it pre-fills the dialog's target. The common
 *   flow is to click the card, click the weapon, then press Enter.
 */
export async function weaponAttack(app, combat, participant, weapon, { defenderId = null } = {}) {
  const sides = attackParticipants(app, combat, participant);
  if (!sides) return;
  const { attacker, defenders } = sides;
  if (defenders.length === 0) {
    app.toasts.show('No defender left standing.');
    return;
  }
  // Every attack pauses at a pre-roll dialog. The dialog picks the defender
  // and applies any situational overrides: bonus or penalty dice on the
  // attack roll (Bless +1d4, Bane -1d4), and extra damage such as a smite's
  // dice or a flat rider. Every override defaults to zero and sits behind a
  // collapsed disclosure, so a plain Enter rolls the unmodified attack. Bonus
  // damage folds into the weapon's own damage type and doubles on a crit,
  // like all damage dice. The attack-roll dice do not double, because they
  // modify the d20, not the damage.
  const bonusDieOptions = BONUS_DICE.map((d) => ({ value: d, label: d }));
  const values = await promptModal(
    `Attack with ${weapon.name}`,
    [
      {
        name: 'target',
        label: 'Defender',
        type: 'select',
        options: defenders.map((d) => ({
          value: d.id,
          label: `${d.name} (AC ${d.ac})`,
        })),
        // A board-picked defender opens pre-selected. If no defender holds
        // that id, for example after a deselect or a defeat, the dialog
        // falls back to the first defender in the list.
        ...(defenderId && defenders.some((d) => d.id === defenderId) ? { value: defenderId } : {}),
        full: true,
      },
      // The mode sits with the defender, not behind the advanced disclosure.
      // Advantage is the most common call a GM makes at the table, and it used
      // to mean leaving the dialog to flip the dice tray's toggle.
      {
        name: 'mode',
        label: 'Roll',
        type: 'select',
        value: 'auto',
        options: MODE_OPTIONS,
        full: true,
      },
      { name: 'atk-count', label: 'Attack: bonus dice', type: 'number', value: 0, advanced: true },
      {
        name: 'atk-die',
        label: 'Attack: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
        advanced: true,
      },
      {
        name: 'dmg-count',
        label: 'Damage: bonus dice',
        type: 'number',
        value: 0,
        min: 0,
        advanced: true,
      },
      {
        name: 'dmg-die',
        label: 'Damage: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
        advanced: true,
      },
      { name: 'atk-flat', label: 'Attack: flat bonus', type: 'number', value: 0, advanced: true },
      { name: 'dmg-flat', label: 'Damage: flat bonus', type: 'number', value: 0, advanced: true },
    ],
    { submitLabel: 'Roll attack', wide: true, advancedLabel: 'Situational modifiers' },
  );
  if (!values) return;
  // A defender the dialog no longer offers, for example one defeated while
  // the dialog stood open, falls back to the first one left standing.
  const defender = defenders.find((d) => d.id === values.target) ?? defenders[0];
  rollWeaponAttack(app, { attacker, defender, weapon, tweaks: readAttackTweaks(values) });
}
