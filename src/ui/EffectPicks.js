import { promptModal } from './Modal.js';
import { getProficiencies } from '../entities/Proficiencies.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { abilityPool, choicePool } from '../entities/FeatChoices.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/feat.js').FeatEffect} FeatEffect */
/** @typedef {{ abilities: string[], skills: string[], saves: string[], expertise: string[] }} EffectPicks */

/**
 * Gather the picks an effect list needs, dialog by dialog. The take-feat
 * flow and the class-feature grant flow both run their choices through
 * here, so a feat and a feature with the same effects prompt the same way.
 *
 * A pick whose pool holds no more options than the count grants outright,
 * with no dialog. The expertise prompt runs after the skill picks, because
 * its options depend on them. A cancel anywhere returns null and the caller
 * abandons the take. This module is DOM wiring over the pools in
 * FeatChoices; it is verified visually.
 * @param {string} title
 * @param {FeatEffect[]} effects
 * @param {Character} taker
 * @returns {Promise<EffectPicks | null>}
 */
export async function gatherEffectPicks(title, effects, taker) {
  const p = getProficiencies(taker);
  /** @type {EffectPicks} */
  const picks = { abilities: [], skills: [], saves: [], expertise: [] };
  /** @type {import('../types/modal.js').ModalField[]} */
  const fields = [];
  /** @type {((values: Record<string, string>) => void)[]} */
  const readers = [];
  /** @param {string} name @param {string} label @param {string[]} pool
   * @param {number} choose @param {string[]} into
   * @param {(id: string) => string} nameOf */
  const addPick = (name, label, pool, choose, into, nameOf) => {
    if (pool.length === 0) return;
    if (pool.length <= choose) {
      into.push(...pool);
      return;
    }
    fields.push({
      name,
      label,
      type: 'multiselect',
      options: pool.map((id) => ({ value: id, label: nameOf(id) })),
      max: choose,
      value: '',
    });
    readers.push((values) => into.push(...splitList(values[name]).slice(0, choose)));
  };

  effects.forEach((effect, i) => {
    if (effect.kind === 'asi') {
      const pool = abilityPool(taker, effect);
      if (pool.length === 1) picks.abilities.push(pool[0]);
      else if (pool.length > 1) {
        fields.push({
          name: `ability${i}`,
          label: '+1 to',
          type: 'select',
          options: pool.map((key) => ({ value: key, label: key })),
          value: pool[0],
        });
        readers.push((values) => picks.abilities.push(values[`ability${i}`]));
      }
      // Every allowed score at the cap: the point has nowhere to land, and
      // the rest of the effects still apply.
    } else if (effect.kind === 'proficiency') {
      if (effect.skills) {
        addPick(
          `skills${i}`,
          `Skills (choose ${effect.skills.choose})`,
          choicePool(effect.skills, SKILL_IDS, p.skills),
          effect.skills.choose,
          picks.skills,
          skillName,
        );
      }
      if (effect.saves) {
        addPick(
          `saves${i}`,
          `Saving throws (choose ${effect.saves.choose})`,
          choicePool(effect.saves, ABILITY_SCORES, p.saves),
          effect.saves.choose,
          picks.saves,
          (key) => key,
        );
      }
    }
  });

  if (fields.length > 0) {
    const values = await promptModal(title, fields, { submitLabel: 'Choose' });
    if (!values) return null;
    for (const read of readers) read(values);
  }

  // Expertise second: its pool is the proficient skills, including the ones
  // just picked, minus what already has expertise.
  for (const [i, effect] of effects.entries()) {
    if (effect.kind !== 'proficiency' || !effect.expertise) continue;
    const held = [...p.skills, ...picks.skills];
    const pool = choicePool(effect.expertise, SKILL_IDS, p.expertise).filter((id) =>
      held.includes(id),
    );
    if (pool.length === 0) continue;
    if (pool.length <= effect.expertise.choose) {
      picks.expertise.push(...pool);
      continue;
    }
    const values = await promptModal(
      `${title}: expertise`,
      [
        {
          name: `expertise${i}`,
          label: `Expertise (choose ${effect.expertise.choose})`,
          type: 'multiselect',
          options: pool.map((id) => ({ value: id, label: skillName(id) })),
          max: effect.expertise.choose,
          value: '',
        },
      ],
      { submitLabel: 'Choose' },
    );
    if (!values) return null;
    picks.expertise.push(...splitList(values[`expertise${i}`]).slice(0, effect.expertise.choose));
  }

  return picks;
}
