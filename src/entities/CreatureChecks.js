/**
 * What a creature adds to a saving throw or an ability check. This is the
 * creature half of `Checks.js`, which covers characters. The two are split
 * because a creature keeps its ability scores in a different field, climbs the
 * proficiency ladder by challenge rating rather than by level, and carries the
 * slim two-list proficiency record instead of a character's seven lists.
 *
 * Nothing here is stored on the creature. Every bonus is derived on each read,
 * so a rating change or a stat edit cannot leave a stale number behind.
 *
 * Every function is pure.
 */

import { effectiveStatBlock } from './Creature.js';
import { abilityModifier, crProficiencyBonus, proficiencyBonus } from './Modifiers.js';
import { d20Penalty } from './Exhaustion.js';
import { checkAbility } from './Checks.js';
import { SKILL_IDS, skillName } from '../data/skills.js';

/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The proficiency bonus a creature rolls with. A rated creature reads the
 * ladder at its challenge rating, which is the 5e rule. An unrated one falls
 * back to its authoring level, and to 1 when it has no level either, so every
 * creature has a bonus and no caller has to guard for absence.
 * @param {Creature} creature
 * @returns {number}
 */
export function creatureProficiencyBonus(creature) {
  return creature.cr === undefined
    ? proficiencyBonus(creature.level ?? 1)
    : crProficiencyBonus(creature.cr);
}

/**
 * Whether the creature is trained in a saving throw.
 * @param {Creature} creature
 * @param {string} ability one of the six ability keys
 * @returns {boolean}
 */
export function isProficientCreatureSave(creature, ability) {
  return creature.proficiencies?.saves.includes(ability) ?? false;
}

/**
 * Whether the creature is trained in a skill.
 * @param {Creature} creature
 * @param {string} skillId
 * @returns {boolean}
 */
export function isProficientCreatureSkill(creature, skillId) {
  return creature.proficiencies?.skills.includes(skillId) ?? false;
}

/**
 * What a creature adds to a saving throw in one ability: the ability modifier
 * from its combat stat block, plus its proficiency bonus where it is trained,
 * less 2 for each level of exhaustion. The stat block is the effective one, so
 * a timed modifier on an ability reaches the save the same way it reaches an
 * attack.
 * @param {Creature} creature
 * @param {string} ability one of the six ability keys
 * @returns {number}
 */
export function creatureSaveBonus(creature, ability) {
  const mod = abilityModifier(effectiveStatBlock(creature)[ability] ?? 10);
  const trained = isProficientCreatureSave(creature, ability)
    ? creatureProficiencyBonus(creature)
    : 0;
  return mod + trained + d20Penalty(creature);
}

/**
 * What a creature adds to an ability check. A skill id resolves to its
 * governing ability and adds proficiency where the creature is trained. A bare
 * ability key is never trained, because 5e attaches skill proficiency to the
 * skill and not to the ability. A key that names neither reads as a score of
 * 10. A creature has no expertise, so no bonus doubles.
 * @param {Creature} creature
 * @param {string} key a skill id or one of the six ability keys
 * @returns {number}
 */
export function creatureCheckBonus(creature, key) {
  const ability = checkAbility(key);
  const block = effectiveStatBlock(creature);
  const mod = abilityModifier((ability ? block[ability] : undefined) ?? 10);
  const trained =
    SKILL_IDS.includes(key) && isProficientCreatureSkill(creature, key)
      ? creatureProficiencyBonus(creature)
      : 0;
  return mod + trained + d20Penalty(creature);
}

/**
 * One line naming what a creature is trained in and what it adds to each, for
 * example "Saves DEX +4, WIS +2 | Skills Stealth +6". A creature trained in
 * nothing gives an empty string. Both creature panels print this, so the
 * numbers they show and the numbers the dice paths roll come from one place.
 * @param {Creature} creature
 * @returns {string}
 */
export function proficiencySummary(creature) {
  const parts = [];
  const saves = creature.proficiencies?.saves ?? [];
  const skills = creature.proficiencies?.skills ?? [];
  if (saves.length > 0) {
    parts.push(
      `Saves ${saves.map((a) => `${a} ${signed(creatureSaveBonus(creature, a))}`).join(', ')}`,
    );
  }
  if (skills.length > 0) {
    const listed = skills.map(
      (id) => `${skillName(id)} ${signed(creatureCheckBonus(creature, id))}`,
    );
    parts.push(`Skills ${listed.join(', ')}`);
  }
  return parts.join(' | ');
}

/** A bonus with its sign, the way a stat block prints one.
 * @param {number} bonus
 * @returns {string} */
function signed(bonus) {
  return bonus < 0 ? String(bonus) : `+${bonus}`;
}
