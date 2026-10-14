import { promptModal } from './Modal.js';
import { getHP } from '../entities/Character.js';
import { spendablePools } from '../entities/RestHitDice.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Ask how many hit dice each character spends in a short rest. The dialog
 * has one number field per hit-dice pool of each living, hurt character
 * with a die left, and each field starts at 0. It resolves to the counts keyed by
 * character id and then pool id, or null when the GM cancels the rest. A
 * party with no die to spend skips the dialog and resolves to no counts.
 * This file is DOM wiring over RestHitDice.js, verified visually.
 * @param {Character[]} characters
 * @returns {Promise<Record<string, Record<string, number>> | null>}
 */
export async function askShortRestDice(characters) {
  const rows = characters.flatMap((character) => {
    const hp = getHP(character);
    // A die heals nothing at full HP, so an unhurt character gets no field.
    if (hp && hp.current >= hp.max) return [];
    const hpText = hp ? `, HP ${hp.current}/${hp.max}` : '';
    return spendablePools(character).map((pool) => ({
      key: `${character.id} ${pool.id}`,
      characterId: character.id,
      poolId: pool.id,
      field: /** @type {const} */ ({
        name: `${character.id} ${pool.id}`,
        label: `${character.name}${hpText}: ${pool.name} to spend (${pool.current} left)`,
        type: 'number',
        value: 0,
        min: 0,
        max: pool.current,
      }),
    }));
  });
  if (rows.length === 0) return {};
  const values = await promptModal(
    'Short rest',
    rows.map((row) => row.field),
    { submitLabel: 'Rest' },
  );
  if (!values) return null;
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  for (const row of rows) {
    const count = Number(values[row.key]) || 0;
    if (count > 0) counts[row.characterId] = { ...counts[row.characterId], [row.poolId]: count };
  }
  return counts;
}
