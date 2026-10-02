import { confirmDelete, promptModal } from './Modal.js';
import { iconButton, textButton } from './buttons.js';
import { addCustomPool, editCustomPool, removeCustomPool } from '../entities/CustomPools.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').PoolRecharge} PoolRecharge */

/**
 * This file keeps the GM's controls for the custom resource pools of the
 * character sheet: Add pool, and Edit and Remove on each pool that no rule
 * derives. The rules live in `entities/CustomPools.js`. This file is DOM
 * wiring over them, verified visually.
 */

const RECHARGE_OPTIONS = [
  { value: 'long', label: 'Long rest' },
  { value: 'short', label: 'Short rest' },
  { value: 'none', label: 'No rest' },
];

/**
 * Ask for a pool's name, size, and recharge. Resolve to null on cancel.
 * @param {string} title
 * @param {ResourcePool} [pool]
 * @returns {Promise<{ name: string, max: number, recharge: PoolRecharge } | null>}
 */
async function askPool(title, pool) {
  const values = await promptModal(
    title,
    [
      { name: 'name', label: 'Name', value: pool?.name ?? '', placeholder: 'Wand charges' },
      { name: 'max', label: 'Uses', type: 'number', min: 1, value: pool?.max ?? 1 },
      {
        name: 'recharge',
        label: 'Refills on',
        type: 'select',
        options: RECHARGE_OPTIONS,
        value: pool?.recharge ?? 'long',
      },
    ],
    { submitLabel: pool ? 'Save pool' : 'Add pool' },
  );
  if (!values) return null;
  return {
    name: values.name,
    max: Number(values.max),
    recharge: /** @type {PoolRecharge} */ (values.recharge),
  };
}

/**
 * The Add pool button for the foot of the resource list.
 * @param {() => Character} live
 * @param {(character: Character) => void} commit
 * @returns {HTMLButtonElement}
 */
export function addPoolButton(live, commit) {
  return textButton('Add pool', async () => {
    const spec = await askPool('Add a pool');
    if (spec) commit(addCustomPool(live(), spec));
  });
}

/**
 * The Edit and Remove buttons of one custom pool.
 * @param {ResourcePool} pool
 * @param {() => Character} live
 * @param {(character: Character) => void} commit
 * @returns {HTMLButtonElement[]}
 */
export function poolEditButtons(pool, live, commit) {
  return [
    iconButton('edit', `Edit ${pool.name}`, async () => {
      const current = live().resources.find((r) => r.id === pool.id) ?? pool;
      const spec = await askPool(`Edit ${current.name}`, current);
      if (spec) commit(editCustomPool(live(), pool.id, spec));
    }),
    iconButton(
      'remove',
      `Remove ${pool.name}`,
      async () => {
        if (await confirmDelete(pool.name)) commit(removeCustomPool(live(), pool.id));
      },
      { variant: 'danger' },
    ),
  ];
}
