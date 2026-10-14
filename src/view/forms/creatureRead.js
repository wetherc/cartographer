/**
 * The read side of the creature form. `readCreatureFields` turns the string
 * values of a submitted creature form back into creature fields, and
 * `readLevel` reads the level box. The fields themselves are in
 * `creatureFields.js`.
 */

import { coerceCR } from '../../data/challenge.js';
import { DEFAULT_CREATURE_HP } from '../../entities/Creature.js';
import { STAT_KEYS } from '../../entities/Modifiers.js';
import { creatureProficiencyFields } from '../../entities/Proficiencies.js';
import { defenseFields } from '../../entities/DamageDefenses.js';
import { creatureTypeFields } from '../../entities/CreatureType.js';
import { attackTraitFields } from '../../entities/CreatureAttacks.js';
import { normalizeHitSave } from '../../combat/HitSave.js';
import { clampInt } from '../../util/num.js';
import { splitList } from '../../util/text.js';
import { readCasterOptions } from './casterFields.js';
import { readGear, readOtherWeapons } from './gearFields.js';
import { readStats } from './statFields.js';

/** @typedef {import('../../types/creature.js').Disposition} Disposition */
/** @typedef {import('../../types/entities.js').CreatureTier} CreatureTier */
/** @typedef {import('./gearFields.js').GearOptions} GearOptions */

/**
 * The level a typed level field means, or undefined for no level. The
 * creature model has no level 0: a creature is either on the leveling ladder
 * at level 1 or above, or it carries no level at all. A blank box, a 0, a
 * negative number, and text that is not a number all read as no level.
 * @param {unknown} raw the field's string value
 * @returns {number | undefined}
 */
export function readLevel(raw) {
  const level = clampInt(String(raw ?? '').trim(), 0);
  return level >= 1 ? level : undefined;
}

/**
 * Read the blueprint fields back out of a submitted form. The empty gear
 * value is the explicit "None" choice and stores null, with no fallback: the
 * field's own default already offered the level's loadout, so what the picker
 * shows is what the creature gets. A blank level, or a level of 0 or below,
 * stores no level and no tier (see readLevel).
 * A blank challenge rating stores none, which the app reads as unrated. Two
 * empty proficiency pickers store no proficiency record, and three empty
 * defense pickers store no defenses. The result carries
 * `stats` only when the form showed the block.
 * @param {Record<string, string>} values
 * @param {GearOptions} gear the same options the fields were built from
 * @param {{ stats?: boolean }} [options]
 * @returns {{
 *   name: string,
 *   disposition: Disposition,
 *   role: string,
 *   notes: string,
 *   maxHP: number,
 *   level?: number,
 *   tier?: CreatureTier,
 *   cr?: number,
 *   proficiencies?: import('../../types/creature.js').CreatureProficiencies,
 *   defenses?: import('../../types/creature.js').DamageDefenses,
 *   creatureType?: import('../../types/creature.js').CreatureType,
 *   conditionImmunities?: string[],
 *   multiattack?: number,
 *   packTactics?: boolean,
 *   surpriseAttack?: import("../../types/creature.js").SurpriseAttack,
 *   multiattackDisadvantage?: number,
 *   redirectAttack?: boolean,
 *   turnResistance?: boolean,
 *   legendaryActions?: number,
 *   legendaryResistance?: number,
 *   stats?: Record<string, number>,
 *   weapons: import('../../types/entities.js').CreatureWeapon[],
 *   armor: import('../../types/entities.js').CreatureArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../../types/entities.js').Spellbook,
 * }}
 */
export function readCreatureFields(values, gear, { stats = true } = {}) {
  const level = readLevel(values.level);
  const cr = coerceCR(values.cr);
  return {
    ...(cr === undefined ? {} : { cr }),
    ...creatureProficiencyFields({
      saves: splitList(values.saves),
      skills: splitList(values.skills),
    }),
    ...defenseFields({
      resist: splitList(values.resist),
      vulnerable: splitList(values.vulnerable),
      immune: splitList(values.immune),
    }),
    ...creatureTypeFields({
      creatureType: values.creatureType,
      conditionImmunities: splitList(values.conditionImmunities),
    }),
    ...attackTraitFields({
      multiattack: values.multiattack,
      multiattackDisadvantage: values.multiattackDisadvantage,
      redirectAttack: values.redirectAttack === '1',
      turnResistance: values.turnResistance === '1',
      legendaryActions: values.legendaryActions,
      legendaryResistance: values.legendaryResistance,
      packTactics: values.packTactics === '1',
      surpriseAttack: { count: values.surpriseCount, sides: Number(values.surpriseDie) },
    }),
    name: values.name.trim(),
    disposition: /** @type {Disposition} */ (values.disposition),
    role: values.role.trim(),
    notes: values.notes.trim(),
    maxHP: clampInt(values.maxHP, 1, Infinity, DEFAULT_CREATURE_HP),
    ...(level === undefined ? {} : { level, tier: /** @type {CreatureTier} */ (values.tier) }),
    ...(stats ? { stats: readStats(STAT_KEYS, values) } : {}),
    ...readWeapons(values, gear),
    ...readCasterOptions(values),
  };
}

/**
 * Put the on-hit save of the form on the read weapon, or take it off. A
 * blank ability, or a creature with no weapon, stores no save.
 * @param {{ weapon: import('../../types/entities.js').CreatureWeapon | null, armor: import('../../types/entities.js').CreatureArmor | null }} read
 * @param {Record<string, string>} values
 */
function withHitSave({ weapon, armor }, values) {
  if (!weapon) return { weapon, armor };
  const { onHitSave: _old, ...plain } = weapon;
  const onHitSave = normalizeHitSave({
    ability: values.hitSaveAbility,
    dc: values.hitSaveDC,
    condition: values.hitSaveCondition,
  });
  return { weapon: onHitSave ? { ...plain, onHitSave } : plain, armor };
}

/**
 * Read the weapon list and the armor of the form. The on-hit save applies to
 * the main weapon, the first in the list.
 * @param {Record<string, string>} values
 * @param {GearOptions} gear
 */
function readWeapons(values, gear) {
  const { weapon, armor } = withHitSave(readGear(values.weapon, values.armor, gear), values);
  return { weapons: readOtherWeapons(weapon, values.otherWeapons ?? '', gear), armor };
}
