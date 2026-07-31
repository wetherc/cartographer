import { promptModal } from '../ui/Modal.js';
import { rollDamage, attackTweak } from '../dice/DiceRoller.js';
import { weaponAbility } from '../entities/Equipment.js';
import { formatModifier, proficiencyBonus } from '../entities/Modifiers.js';
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

/**
 * Roll a weapon attack for the active combatant, 5e-style: a pre-roll
 * dialog picks the defender and takes situational overrides — bonus or
 * penalty dice on the attack roll (Bless +1d4, Bane -1d4), extra damage
 * dice (a smite), and flat bonuses on either — then loads 1d20 + the
 * attacker's ability modifier + proficiency bonus (+ overrides) and the
 * defender's AC into the dice tray and rolls. A natural 20 hits regardless of AC and
 * doubles the damage dice (a critical hit); a natural 1 always misses;
 * otherwise the total is compared against AC. On a hit the weapon's damage
 * dice roll too — ability modifier folded into the base term, proficiency
 * never added to damage — and the result is applied to the defender
 * automatically: encounters lose HP on the spot, party characters take it
 * through bonus HP first, and HP-less NPCs just get the log line. Party
 * members attack with their equipped weapons; foes with the encounter's
 * assigned weapon. Everything lands in the travelogue and a toast.
 * @param {AppContext} app
 * @param {import('../types/combat.js').CombatState} combat
 * @param {import('../types/combat.js').Participant} participant
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 */
export async function weaponAttack(app, combat, participant, weapon) {
  // The attacker is a party character or an armed encounter; either way the
  // roll is d20 + the weapon ability's modifier + proficiency for its level.
  // NPCs carry no weapons yet, so an NPC participant never reaches here.
  const found = findCombatant(app, participant.id);
  const attacker = found && found.kind !== 'npc' ? found.entity : null;
  if (!attacker) return;
  // Defenders come from the opposite side of the running order: encounters
  // by id, party characters (AC from armor), and NPCs standing on the tile.
  // Downed ones drop out.
  const defenders = combatantsAsTargets(app, combat, participant);
  if (defenders.length === 0) {
    app.toasts.show('No defender left standing.');
    return;
  }
  // Every attack pauses at a pre-roll dialog: pick the defender and apply
  // any situational overrides — bonus or penalty dice on the attack roll
  // (Bless +1d4, Bane -1d4) and extra damage (a smite's dice, a flat
  // rider). Everything defaults to zero, so plain Enter rolls the
  // unmodified attack. Bonus damage folds into the weapon's own damage
  // type and, like all damage dice, doubles on a crit; the attack-roll
  // dice don't (they modify the d20, not the damage).
  const bonusDieOptions = ['d4', 'd6', 'd8', 'd10', 'd12'].map((d) => ({
    value: d,
    label: d,
  }));
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
        full: true,
      },
      { name: 'atk-count', label: 'Attack: bonus dice', type: 'number', value: 0 },
      {
        name: 'atk-die',
        label: 'Attack: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
      },
      { name: 'dmg-count', label: 'Damage: bonus dice', type: 'number', value: 0, min: 0 },
      {
        name: 'dmg-die',
        label: 'Damage: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
      },
      { name: 'atk-flat', label: 'Attack: flat bonus', type: 'number', value: 0 },
      { name: 'dmg-flat', label: 'Damage: flat bonus', type: 'number', value: 0 },
    ],
    { submitLabel: 'Roll attack', wide: true },
  );
  if (!values) return;
  const defender = defenders.find((d) => d.id === values.target) ?? defenders[0];
  const ability = weaponAbility(weapon);
  const abilityMod = abilityModOf(attackerStats(attacker), ability);
  const attackBonus = abilityMod + proficiencyBonus(attacker.level);
  // Bonus attack dice join the d20 in the tray's selection so they roll in
  // view; penalty dice are rolled by attackTweak and folded into the
  // modifier (with the values kept in its note for the log).
  const tweak = attackTweak(
    Number(values['atk-count']) || 0,
    /** @type {import('../types/dice.js').DieType} */ (values['atk-die']),
    Number(values['atk-flat']) || 0,
  );
  const { result } = app.actions.rollDice(
    { counts: { d20: 1, ...tweak.counts }, modifier: attackBonus + tweak.modifier },
    defender.ac,
  );
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  const { crit, hit, outcome } = resolveAttack({
    natural,
    total: result.total,
    ac: defender.ac,
  });
  // An advantage/disadvantage attack notes the discarded d20 so the log
  // shows both dice, matching the tray's own readout.
  const modeNote = droppedNote(d20, result.selection.mode);
  const tweakNote = tweak.note ? `, ${tweak.note}` : '';
  app.actions.logEvent(
    'combat',
    `${attacker.name} attacks ${defender.name} with ${weapon.name} (${ability} ${formatModifier(abilityMod)}, proficiency +${proficiencyBonus(attacker.level)}${tweakNote}): ${result.total} to hit vs AC ${defender.ac}${modeNote} — ${outcome}.`,
  );
  if (!hit) {
    app.toasts.show(
      `${result.total} vs AC ${defender.ac}: ${attacker.name} misses ${defender.name}.`,
    );
    return;
  }
  // A crit rolls every damage die twice, the dialog's added dice included; the
  // ability modifier is still added only once, and proficiency never reaches
  // damage at all.
  const parts = damageParts(weapon.damage ?? [], {
    crit,
    bonusDice: Number(values['dmg-count']) || 0,
    bonusDie: /** @type {import('../types/dice.js').DieType} */ (values['dmg-die']),
  });
  const damage = rollDamage(parts, damageModifier(abilityMod, values['dmg-flat']));
  const inflicts =
    'statusEffects' in weapon && weapon.statusEffects?.length
      ? `, inflicting ${weapon.statusEffects.join(', ')}`
      : '';
  const blow = crit ? 'critically hits' : 'hits';
  // The travelogue keeps the raw damage dice (detail), while the toast
  // below stays with the short per-type totals (text).
  app.actions.logEvent(
    'combat',
    `${weapon.name} ${blow} ${defender.name} for ${damage.detail || '0 damage'}${inflicts}.`,
  );
  // Apply the damage on the spot through the shared write path: encounters
  // and characters track HP with defeat/drop-to-0 logged once; a defender
  // that's an HP-less NPC keeps the log line only.
  applyToTarget(app, defender.id, damage.total, false);
  app.toasts.show(
    `${crit ? 'Critical hit!' : 'Hit!'} ${defender.name} takes ${damage.text || 'no damage'}${inflicts}.`,
  );
}
