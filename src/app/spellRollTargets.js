import { exhaustionLevel } from '../entities/Exhaustion.js';
import { autoCrits, combineModes, rollMode, saveOutcome } from '../entities/ConditionEffects.js';
import { attackerType } from '../entities/ChipSlants.js';
import { hasFeature } from '../entities/Features.js';
import { castTypeFields } from '../entities/CreatureType.js';
import { sourceSlant } from '../entities/SourceSlant.js';
import { isLucky, raceSaveSlant, spellRaceSave } from '../entities/RaceTraits.js';
import { findCombatant, hpOf } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */

/**
 * Add the live fields that each target needs for the roll of a cast: the save
 * mode and bonus of a save, the HP of a spell with an HP limit or pool, the
 * creature type for the type rules, and the attack mode of an attack spell.
 * Each field comes from the roster as it is now, because the cast dialog can
 * sit open while a target changes.
 * @param {AppContext} app
 * @param {(CastPlan['targets'][number] & { projectiles?: number })[]} chosen the
 *   targets picked in the dialog
 * @param {{
 *   spell: Spell,
 *   resolved: Spell,
 *   saveAbility: CastPlan['saveAbility'],
 *   picked: RollMode | null,
 *   live: Character | Creature,
 * }} cast `spell` is the spell as cast, `resolved` the spell that rolls (a
 *   repeat rolls a reduced copy), `picked` the mode from the dialog, and
 *   `live` the caster read again after any pause
 */
export function rollingTargets(app, chosen, { spell, resolved, saveAbility, picked, live }) {
  // The caster view carries no conditions, so the chips come off the real
  // combatant. A Bless on the caster rides its spell attack rolls, and a
  // Blinded on it slants them.
  const casterConditions = live.conditions ?? [];
  let castTargets = chosen;
  // An attack's dialog mode applies to the attack roll, so a save that its hit
  // brings rolls with only the target's own slant.
  const savePick = resolved.effect.kind === 'save' ? picked : null;
  if (saveAbility) {
    const raceSave = spellRaceSave(resolved, saveAbility);
    castTargets = chosen.map((t) => {
      // A target's untrained armor slants its STR or DEX save. The slant
      // folds in with the target's chips, so an advantage chip cancels it.
      const found = findCombatant(app, t.id);
      const character = found?.kind === 'character' ? found.entity : null;
      const outcome = saveOutcome(
        t.conditions,
        saveAbility,
        [t.armorPenalty ? 'disadvantage' : null, raceSaveSlant(character, raceSave)],
        found ? exhaustionLevel(found.entity) : 0,
      );
      const evasion = character !== null && hasFeature(character, 'Evasion');
      return {
        ...t,
        ...(evasion ? { evasion: true } : {}),
        ...(isLucky(character) ? { lucky: true } : {}),
        // Every live target carries a derived bonus. A target the roster lost
        // while the dialog sat open carries none and saves on the flat die.
        saveBonus: t.saveBonus ?? 0,
        saveMode: savePick ?? outcome.mode ?? 'normal',
        ...(outcome.failedBy ? { autoFailSave: outcome.failedBy } : {}),
      };
    });
  }
  // A spell with an HP limit or an HP pool reads each target's HP as it is
  // now. A pool also passes over a target by its chips (an Unconscious one),
  // so it reads those as they are now too.
  const effect = resolved.effect;
  if (effect.kind === 'save' && (effect.hpLimit !== undefined || effect.hpPool)) {
    castTargets = castTargets.map((t) => {
      const found = findCombatant(app, t.id);
      const hp = found ? hpOf(found.kind, found.entity) : null;
      return {
        ...t,
        ...(hp ? { hp: hp.current } : {}),
        ...(found && effect.hpPool ? { conditions: found.entity.conditions } : {}),
      };
    });
  }
  // The type rules of a spell read each target's creature type and condition
  // immunities, as the roster keeps them now.
  if ((effect.kind === 'save' || effect.kind === 'heal') && effect.typeRules) {
    castTargets = castTargets.map((t) => {
      return { ...t, ...castTypeFieldsOf(app, t.id) };
    });
  }
  if (resolved.effect.kind === 'attack') {
    // A melee spell attack says so. Otherwise a touch spell reaches as far as
    // a melee weapon does, which is the split Prone needs, and every other
    // range is a ranged attack.
    const melee = resolved.effect.melee ?? /touch/i.test(spell.range ?? '');
    castTargets = castTargets.map((t) => ({
      ...t,
      // A hit can leave a chip on targets of one type only (Chill Touch on
      // undead), so each target states its type.
      ...castTypeFieldsOf(app, t.id),
      attackMode:
        picked ??
        combineModes([
          rollMode({
            roller: casterConditions,
            target: t.conditions,
            kind: 'attack',
            melee,
            rollerType: attackerType(live),
            tired: exhaustionLevel(live),
          }),
          // A chip that the target's own spell left on the caster (Chill
          // Touch on an undead caster) slants the roll.
          sourceSlant(casterConditions, t.id),
        ]) ??
        'normal',
      // A helpless target turns a melee spell hit into a critical one, the
      // same rule a weapon swing follows.
      autoCrit: autoCrits(t.conditions, { melee }),
    }));
  }
  return castTargets;
}

/**
 * The creature type and condition immunities of a roster entry, for the type
 * rules of a spell. An id the roster lost gives none.
 * @param {AppContext} app
 * @param {string | undefined} id
 */
function castTypeFieldsOf(app, id) {
  const found = findCombatant(app, id ?? '');
  return found ? castTypeFields(found.kind, found.entity) : {};
}
