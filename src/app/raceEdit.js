import { getRace, withRace } from '../entities/Races.js';
import { derive } from '../entities/Progression.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { capitalize, splitList } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/race.js').RacePicks} RacePicks */

/**
 * This module defines the race pick fields of a character's edit dialog and
 * the pure function that applies them. A GM can change the floating ability
 * increases (the Half-Elf) and the ancestry resistance (the Dragonborn) after
 * creation. Race skills and the race tool sit in the Skills and Tools lists of
 * the same dialog, so they have no separate field here.
 */

/**
 * The race picks the character has now. The ability picks are the abilities
 * whose stored increase is larger than the race's fixed increase.
 * @param {Character} character
 * @returns {RacePicks}
 */
export function currentRacePicks(character) {
  const def = getRace(character.raceId);
  const applied = /** @type {Record<string, number>} */ (
    character.raceTraits?.abilityIncreases ?? {}
  );
  const fixed = /** @type {Record<string, number>} */ (def?.abilityIncreases ?? {});
  return {
    abilities: ABILITY_SCORES.filter((key) => (applied[key] ?? 0) > (fixed[key] ?? 0)),
    skills: character.raceTraits?.chosenSkills ?? [],
    resistance: character.raceTraits?.chosenResistance ?? '',
    tool: character.raceTraits?.chosenTool ?? '',
  };
}

/**
 * The race pick fields for a catalog race with an ability or resistance
 * choice. Any other character gets no fields.
 * @param {Character} character
 * @returns {ModalField[]}
 */
export function racePickFields(character) {
  const def = getRace(character.raceId);
  if (!def) return [];
  const picks = currentRacePicks(character);
  /** @type {ModalField[]} */
  const fields = [];
  const choice = def.abilityChoice;
  if (choice) {
    const excluded = new Set(/** @type {string[]} */ (choice.exclude));
    fields.push({
      name: 'raceAbilities',
      label: `Race ability increases (choose ${choice.count}, +${choice.amount} each)`,
      type: 'multiselect',
      value: (picks.abilities ?? []).join(','),
      options: ABILITY_SCORES.filter((key) => !excluded.has(key)).map((key) => ({
        value: key,
        label: key,
      })),
      max: choice.count,
      columns: true,
      full: true,
    });
  }
  if (def.resistanceChoice?.length) {
    fields.push({
      name: 'raceResistance',
      label: 'Draconic ancestry resistance',
      type: 'select',
      value: picks.resistance || def.resistanceChoice[0],
      options: def.resistanceChoice.map((type) => ({ value: type, label: capitalize(type) })),
    });
  }
  return fields.length ? [{ ...fields[0], section: `Race (${def.name})` }, ...fields.slice(1)] : [];
}

/**
 * Apply the submitted race picks. `withRace` takes the old increases back
 * off the scores and adds the new ones, so the scores move by the
 * difference. The skill and tool picks stay as they are. A field missing
 * from `values`, or picks that match the current ones, leave the character
 * unchanged. The function is pure.
 * @param {Character} character
 * @param {Record<string, string>} values
 * @returns {Character}
 */
export function applyRacePicks(character, values) {
  const def = getRace(character.raceId);
  if (!def) return character;
  const now = currentRacePicks(character);
  const abilities =
    values.raceAbilities === undefined ? now.abilities : splitList(values.raceAbilities);
  const resistance = values.raceResistance ?? now.resistance;
  const sameAbilities =
    [...(abilities ?? [])].sort().join() === [...(now.abilities ?? [])].sort().join();
  if (sameAbilities && resistance === now.resistance) return character;
  const next = withRace(character, def.id, { ...now, abilities, resistance });
  return derive(next);
}
