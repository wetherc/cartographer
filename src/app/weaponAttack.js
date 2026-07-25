import { promptModal } from '../ui/Modal.js';
import { applyDamage, effectiveStatBlock, isDefeated } from '../entities/Encounter.js';
import { rollDamage, attackTweak, DIE_SIDES } from '../dice/DiceRoller.js';
import { armorClass, effectiveStats, weaponAbility } from '../entities/Equipment.js';
import { damageCharacter, getHP } from '../entities/Character.js';
import { abilityModifier, formatModifier, proficiencyBonus } from '../entities/Modifiers.js';
import { npcsOnTile } from '../entities/NPC.js';
import { replaceById } from '../entities/Roster.js';

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
  const { state } = app;
  // The attacker is a party character or an armed encounter; either way the
  // roll is d20 + the weapon ability's modifier + proficiency for its level.
  const attacker =
    participant.side === 'party'
      ? state.characters.find((c) => c.id === participant.id)
      : state.encounters.find((e) => e.id === participant.id);
  if (!attacker) return;
  // Defenders come from the opposite side of the running order: encounters
  // by id, party characters (AC from armor), and NPCs standing on the tile.
  // Downed ones drop out.
  const npcs = npcsOnTile(state.npcs, app.partyTracker.getPosition());
  const defenders = combat.order
    .filter((p) => p.side !== participant.side)
    .flatMap((p) => {
      const encounter = state.encounters.find((e) => e.id === p.id);
      if (encounter) {
        return isDefeated(encounter)
          ? []
          : [
              {
                id: p.id,
                name: encounter.name,
                ac: effectiveStatBlock(encounter).AC ?? 10,
              },
            ];
      }
      const character = state.characters.find((c) => c.id === p.id);
      if (character) {
        const hp = getHP(character);
        return hp && hp.current <= 0
          ? []
          : [{ id: p.id, name: character.name, ac: armorClass(character) }];
      }
      const npc = npcs.find((n) => n.id === p.id);
      return npc ? [{ id: p.id, name: npc.name, ac: npc.stats?.AC ?? 10 }] : [];
    });
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
  const stats = 'statBlock' in attacker ? effectiveStatBlock(attacker) : effectiveStats(attacker);
  const abilityMod = abilityModifier(stats[ability] ?? 10);
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
  const natural = result.results.find((r) => r.die === 'd20')?.rolls[0] ?? 0;
  // 5e attack resolution: a natural 1 always misses and a natural 20 always
  // hits (and crits, doubling the damage dice); anything else compares the
  // modified total against the defender's AC.
  const crit = natural === 20;
  const hit = natural !== 1 && (crit || result.total >= defender.ac);
  const outcome = crit ? 'critical hit' : natural === 1 ? 'natural 1, miss' : hit ? 'hit' : 'miss';
  // An advantage/disadvantage attack notes the discarded d20 so the log
  // shows both dice, matching the tray's own readout.
  const d20 = result.results.find((r) => r.die === 'd20');
  const modeNote = d20?.dropped?.length
    ? ` at ${result.selection.mode} (dropped ${d20.dropped.join(',')})`
    : '';
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
  // A crit rolls every damage die twice; the ability modifier is still
  // added only once, and proficiency never reaches damage.
  const parts = (weapon.damage ?? []).map((p) => (crit ? { ...p, count: p.count * 2 } : p));
  // Dialog-added damage dice count as damage dice, so they double on a crit
  // too; typed as the weapon's own damage so rollDamage folds them into its
  // group. The flat damage rider joins the ability modifier.
  const bonusDice = Math.max(0, Number(values['dmg-count']) || 0);
  if (bonusDice > 0) {
    parts.push({
      count: crit ? bonusDice * 2 : bonusDice,
      sides: DIE_SIDES[/** @type {import('../types/dice.js').DieType} */ (values['dmg-die'])],
      damageType: parts[0]?.damageType ?? 'bonus',
    });
  }
  const damage = rollDamage(parts, abilityMod + (Number(values['dmg-flat']) || 0));
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
  // Apply the damage on the spot. Encounters and characters track HP; a
  // defender that's an HP-less NPC keeps the log line only. Defeat is
  // logged once, matching the manual-damage path on the encounter row.
  const target = state.encounters.find((e) => e.id === defender.id);
  if (target && damage.total > 0) {
    const next = applyDamage(target, damage.total);
    if (!isDefeated(target) && isDefeated(next))
      app.actions.logEvent('combat', `Defeated ${next.name}.`);
    state.encounters = replaceById(state.encounters, next);
    app.actions.syncEncounterMarkers();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update(); // defeating the last foe here ends the combat
    app.actions.markDirty();
  }
  const victim = state.characters.find((c) => c.id === defender.id);
  if (victim && damage.total > 0) {
    const next = damageCharacter(victim, damage.total);
    // Log the drop to 0 exactly once — further damage on a downed character
    // shouldn't repeat it.
    if ((getHP(victim)?.current ?? 0) > 0 && (getHP(next)?.current ?? 0) <= 0) {
      app.actions.logEvent('combat', `${next.name} drops to 0 HP.`);
    }
    state.characters = replaceById(state.characters, next);
    app.actions.refreshSelectedCharacter();
    app.actions.markDirty();
  }
  app.toasts.show(
    `${crit ? 'Critical hit!' : 'Hit!'} ${defender.name} takes ${damage.text || 'no damage'}${inflicts}.`,
  );
}
