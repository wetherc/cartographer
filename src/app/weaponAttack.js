import { promptModal } from '../ui/Modal.js';
import { weaponIsMagical } from '../entities/MagicWeapon.js';
import {
  coerceMultiattack,
  surpriseDiceFor,
  swingsPerAction,
} from '../entities/CreatureAttacks.js';
import { hasExtraAction } from '../entities/ChipMods.js';
import { resolveAttack } from '../combat/AttackResolve.js';
import {
  SWINGS,
  isWeakSwing,
  legendarySwing,
  readAttackTweaks,
  swingKind,
} from '../combat/AttackTweaks.js';
import { attackLine, hitDamage, hitLines, prepareSwing } from '../combat/WeaponSwing.js';
import { conditionsOf, isDowned } from '../combat/CombatView.js';
import { canAct } from '../entities/ConditionEffects.js';
import {
  findCombatant,
  combatantsAsTargets,
  combatantSaveBonus,
  defendedDamage,
  hpOf,
  logName,
} from './combatants.js';
import { applyConditionToTarget, applyToTarget } from './combatantWrites.js';
import { resolveSave } from '../entities/Checks.js';
import { hitSaveLine, hitSaveOf } from '../combat/HitSave.js';
import { spendRollRiders, spendOnceChips } from './riderSpend.js';
import { offerWard, pendingWard } from './shieldWard.js';
import { offerDamageWard, pendingDamageWard } from './damageWard.js';
import { offerRedirect, pendingRedirect } from './redirectWard.js';
import { attackDialog } from './attackFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./combatants.js').CombatTarget} CombatTarget */
/** @typedef {import('../combat/AttackTweaks.js').AttackTweaks} AttackTweaks */

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
 * Both sides of an attack, read again by id after the pre-roll dialog closes.
 * The dialog stands open across an await. In that time a cross-tab adoption
 * can replace the attacker and the defender with new objects, and a roll from
 * the old ones uses chips and HP that are no longer true. The GM can also end
 * the fight, which leaves no budget to spend, so the swing would deal damage
 * for free. A refusal names why the attack does not roll: the fight is over,
 * the attacker is down or cannot act, or the picked defender is no longer a
 * target.
 * @param {AppContext} app
 * @param {import('../types/combat.js').Participant} participant
 * @param {string} defenderId
 * @returns {{ attacker: NonNullable<ReturnType<typeof attackParticipants>>['attacker'], defender: CombatTarget } | { refusal: string }}
 */
export function liveAttackSides(app, participant, defenderId) {
  const combat = app.state.combat;
  if (!combat) return { refusal: 'The fight ended before the attack rolled.' };
  const sides = attackParticipants(app, combat, participant);
  const found = findCombatant(app, participant.id);
  if (!sides || !found || isDowned(found) || !canAct(conditionsOf(found))) {
    return { refusal: 'The attacker can no longer act, so the attack did not roll.' };
  }
  const defender = sides.defenders.find((d) => d.id === defenderId);
  if (!defender) return { refusal: 'That target is down or gone, so the attack did not roll.' };
  return { attacker: sides.attacker, defender };
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
 * Cover from the dialog raises the AC this swing rolls against, and the log
 * prints both the raised AC and the plain one. A ticked Sneak Attack box adds
 * the attacker's d6 on a hit and marks the flag as used for the turn, so the
 * second swing cannot add it again.
 *
 * A hit that a higher AC would turn aside pauses when the defender has a
 * reaction ready that raises its AC, such as Shield (see `shieldWard.js`).
 * A yes casts the spell, and the roll is checked again against the new AC.
 *
 * An attack on a creature with Redirect Attack pauses after the swing pays
 * and before the roll, and the GM can make one of its allies the target
 * (see `redirectWard.js`).
 *
 * The attack roll goes through the dice tray, which owns its own randomness.
 * `rng` is the source for the damage roll and for the rider dice, injected
 * the way the pure modules take theirs. `ask` puts the question of the
 * defender's reaction, `prompt` asks which ally becomes the target of a
 * redirected attack, and a test passes its own answers.
 * @param {AppContext} app
 * @param {{
 *   attacker: any,
 *   defender: CombatTarget,
 *   weapon: import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon,
 *   tweaks?: AttackTweaks,
 *   rng?: () => number,
 *   ask?: import('./shieldWard.js').WardAsk,
 *   prompt?: typeof promptModal,
 * }} attack
 * @returns {void | Promise<void>} a promise when the defender's reaction
 *   paused the attack, which settles once the attack has landed
 */
export function rollWeaponAttack(
  app,
  { attacker, defender, weapon, tweaks: picked = {}, rng = Math.random, ask, prompt },
) {
  // The weak swing of a Multiattack reads the budget before this swing pays.
  const self = app.state.combat?.order.find((p) => p.id === attacker.id);
  const tweaks = { ...picked, weak: isWeakSwing(attacker, self, picked) };
  // The swing pays first, so a turn with nothing left rolls no dice. A main-hand
  // swing spends the Attack action and banks whatever Extra Attack adds, and
  // each later swing draws on that bank. An off-hand swing spends the bonus
  // action, and an opportunity attack spends the reaction; neither touches the
  // attack bank. `freeAction` comes from the dialog's opt-out and skips the
  // whole question. Outside a running fight there is no turn to spend, and the
  // action reports success.
  const kind = swingKind(tweaks);
  const swing = kind === 'legendary' ? legendarySwing(attacker, self) : SWINGS[kind];
  if (!tweaks.freeAction && app.actions.spendBudget) {
    // Only the Attack action banks swings behind it, so only that cost passes
    // the count. A legendary swing passes the legendary actions per round.
    const spent = app.actions.spendBudget(
      attacker.id,
      swing.cost,
      swing.cost === 'attack'
        ? {
            attacksPerAction: swingsPerAction(attacker, weapon),
            extraAction: hasExtraAction(attacker.conditions),
          }
        : swing.cost === 'legendary'
          ? { legendaryActions: attacker.legendaryActions }
          : {},
    );
    if (!spent) {
      app.toasts.show(`${logName(app, attacker)} ${swing.blocked}.`);
      return;
    }
  }
  // A defender with Redirect Attack can swap places with an ally once the
  // attack targets it, before the roll. The whole swing then rolls against
  // the ally.
  const attack = { attacker, weapon, tweaks, rng, ask, swing };
  const redirect = pendingRedirect(app, defender.id, attacker.id);
  if (!redirect) return swingAt(app, { ...attack, defender });
  const message = `${logName(app, attacker)} attacks ${logName(app, defender)} with ${weapon.name}.`;
  return offerRedirect(app, redirect, message, { prompt }).then((ally) =>
    swingAt(app, { ...attack, defender: ally ?? defender }),
  );
}

/**
 * Roll one paid swing against its final defender, then log and apply what
 * it did. `rollWeaponAttack` describes the steps.
 * @param {AppContext} app
 * @param {{
 *   attacker: any,
 *   defender: CombatTarget,
 *   weapon: import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon,
 *   tweaks: AttackTweaks,
 *   rng: () => number,
 *   ask?: import('./shieldWard.js').WardAsk,
 *   swing: (typeof SWINGS)[keyof typeof SWINGS],
 * }} attack
 * @returns {void | Promise<void>}
 */
function swingAt(app, { attacker, defender, weapon, tweaks, rng, ask, swing }) {
  const attackerName = logName(app, attacker);
  const defenderName = logName(app, defender);
  const setup = prepareSwing({ attacker, defender, weapon, tweaks, rng });
  const { ac, autoCrit, rider } = setup;
  const { result } = app.actions.rollDice(
    {
      counts: { d20: 1, ...setup.tweak.counts },
      modifier: setup.modifier,
      ...(setup.mode ? { mode: setup.mode } : {}),
    },
    ac,
  );
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  // A roll that hits can still miss when the defender raises its AC with a
  // reaction (Shield). The question comes before the log line, so the line
  // states the AC that the roll answered to in the end. A natural 20 hits
  // whatever the AC, so it asks nothing.
  const first = resolveAttack({ natural, total: result.total, ac, autoCrit });
  const ward = first.hit && natural !== 20 ? pendingWard(app, defender.id, attacker.id) : null;
  /** @param {number} raised how much the defender's reaction raised its AC */
  const land = (raised) => {
    const warded = ac + raised;
    const { crit, hit, outcome } = raised
      ? resolveAttack({ natural, total: result.total, ac: warded, autoCrit })
      : first;
    app.actions.logEvent(
      'combat',
      attackLine(setup, {
        attacker,
        defender,
        weapon,
        tweaks,
        swingNote: swing.note,
        total: result.total,
        d20,
        rollMode: result.selection.mode,
        attackerName,
        defenderName,
        raised,
        wardName: ward ? ward.spell.name : null,
        outcome,
      }),
    );
    spendRollRiders(app, attacker.id, rider);
    // A one-shot chip such as Guiding Bolt ends on the roll, hit or miss.
    spendOnceChips(app, attacker.id, defender.id, setup.conditionQuery);
    if (!hit) {
      app.toasts.show(`${result.total} vs AC ${warded}: ${attackerName} misses ${defenderName}.`);
      return;
    }
    // Surprise Attack reads the fight, so it applies without a dialog box.
    const { damage, sneakDice, riderNote } = hitDamage(setup, {
      attacker,
      defender,
      weapon,
      tweaks: { ...tweaks, surprise: surpriseDiceFor(attacker, app.state.combat, defender.id) },
      crit,
      rng,
    });
    // Sneak Attack adds its dice only on a hit, so the flag is spent here
    // rather than beside the swing.
    if (sneakDice > 0 && app.actions.spendBudget) app.actions.spendBudget(attacker.id, 'sneak');
    // A weapon that is neither flagged magical nor a pact weapon counts as
    // nonmagical, so Stoneskin resists its hit.
    const defense = { nonmagical: !weaponIsMagical(attacker, weapon) };
    const strike = () => {
      const taken = defendedDamage(app, defender.id, damage.byType, defense);
      const lines = hitLines({
        weapon,
        defenderName,
        crit,
        damage,
        sneakDice,
        riderNote,
        taken,
      });
      app.actions.logEvent('combat', lines.log);
      // Applies the damage on the spot through the shared write path. Every
      // combatant tracks HP, and the function logs a defeat or a drop to 0
      // only once.
      applyToTarget(app, defender.id, taken.total, false, { crit });
      app.toasts.show(lines.toast);
      rollHitSave(app, defender.id, weapon, rng);
    };
    // A defender with a reaction spell that resists a type in the hit gets
    // the question after the damage roll and before the damage lands.
    const guard = pendingDamageWard(app, defender.id, attacker.id, damage.byType, defense);
    if (!guard) return strike();
    const hitLine = `${attackerName} hits ${defenderName} with ${weapon.name} for ${damage.total} damage.`;
    return offerDamageWard(app, guard, hitLine, { ask }).then(strike);
  };
  if (ward && result.total < ac + ward.bonus) {
    const hitLine = `${attackerName} hits ${defenderName} with ${weapon.name} (${result.total} vs AC ${ac}).`;
    return offerWard(app, ward, hitLine, { ask }).then(land);
  }
  return land(0);
}

/**
 * Rolls a weapon attack for the active combatant, in 5e style. A pre-roll
 * dialog picks the defender and how the d20 rolls, and takes situational
 * overrides: bonus or penalty dice on the attack roll (Bless +1d4, Bane
 * -1d4), extra damage dice (a smite), and flat bonuses on either roll. The
 * mode defaults to reading the condition chips, and picking one of the three
 * modes there overrides both the chips and the dice tray's standing toggle for
 * this roll. A cover control raises the defender's AC for this swing, and an
 * attacker with Sneak Attack that has not used it this turn gets a box that
 * adds its dice. Both are GM calls: the app tracks no line of sight and no
 * position. The function then loads 1d20,
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
 * @param {{
 *   defenderId?: string | null,
 *   offhand?: boolean,
 *   reaction?: boolean,
 *   legendary?: boolean,
 *   prompt?: typeof promptModal,
 * }} [options] If a defender is already picked on the combat board, it pre-fills
 *   [options] If a defender is already picked on the combat board, it pre-fills
 *   the dialog's target. The common flow is to click the card, click the weapon,
 *   then press Enter. `offhand` makes this the second swing of two-weapon
 *   fighting, which costs the bonus action and drops the ability bonus from its
 *   damage. `reaction` makes it an opportunity attack, which costs the reaction
 *   and can come on another combatant's turn. `legendary` makes it a legendary
 *   action of a creature, which costs one of its legendary actions.
 *   `prompt` renders the dialog, and a test passes its own answers.
 */
export async function weaponAttack(
  app,
  combat,
  participant,
  weapon,
  {
    defenderId = null,
    offhand = false,
    reaction = false,
    legendary = false,
    prompt = promptModal,
  } = {},
) {
  const sides = attackParticipants(app, combat, participant);
  if (!sides) return;
  const { attacker, defenders } = sides;
  if (defenders.length === 0) {
    app.toasts.show('No defender left standing.');
    return;
  }
  const dialog = attackDialog({
    attacker,
    defenders,
    participant,
    weapon,
    defenderId,
    offhand,
    reaction,
    legendary,
  });
  const values = await prompt(dialog.title, dialog.fields, dialog.options);
  if (!values) return;
  const tweaks = { ...readAttackTweaks(values), offhand, reaction, legendary };
  // A ticked Multiattack box rolls each swing in turn against the same
  // target. Each swing reads both sides again, so a defender that drops
  // stops the rest with no toast of its own, and each swing logs its own
  // lines.
  const swings = values.multiattack === '1' ? (coerceMultiattack(attacker.multiattack) ?? 1) : 1;
  for (let i = 0; i < swings; i++) {
    const live = liveAttackSides(app, participant, values.target);
    if ('refusal' in live) {
      if (i === 0) app.toasts.show(live.refusal);
      return;
    }
    await rollWeaponAttack(app, {
      attacker: live.attacker,
      defender: live.defender,
      weapon,
      tweaks,
      prompt,
    });
  }
}

/**
 * Roll the save that a weapon forces on a hit (see `combat/HitSave.js`), and
 * put the condition on a defender that fails. A defender that the hit dropped
 * rolls nothing. The save reads the defender's own chips, so Bless helps it
 * and Restrained slants a DEX save.
 * @param {AppContext} app
 * @param {string} defenderId
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 * @param {() => number} rng
 */
export function rollHitSave(app, defenderId, weapon, rng) {
  const rider = hitSaveOf(weapon);
  if (!rider) return;
  const found = findCombatant(app, defenderId);
  if (!found || (hpOf(found.kind, found.entity)?.current ?? 1) <= 0) return;
  const save = resolveSave(combatantSaveBonus(found, rider.ability), rider.dc, {
    ability: rider.ability,
    conditions: found.entity.conditions,
    rng,
  });
  app.actions.logEvent(
    'combat',
    hitSaveLine({
      defenderName: found.label,
      weaponName: weapon.name,
      rider,
      total: save.total,
      success: save.success,
    }),
  );
  if (!save.success) applyConditionToTarget(app, defenderId, rider.condition, null);
}
