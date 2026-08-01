/**
 * The encounter's authoring fields, described once. The campaign dialog
 * (`encounterForm`) and the bestiary template form in the Library rail render
 * this same list, one through `promptModal` and one through `buildSpecForm`,
 * and read it back through `readEncounterFields`. The two surfaces differ only
 * in what surrounds the blueprint: the dialog adds the placement fields, and
 * an edit of a live encounter leaves the stat block out, because the Build
 * rail's row chips own it there.
 */

import { defaultEnemyGear } from '../entities/Encounter.js';
import { defaultEnemyStats, ENEMY_TIERS, STAT_KEYS } from '../entities/Modifiers.js';
import { clampInt } from '../util/num.js';
import { casterFields, readCasterOptions, refilterSpellsOnChange } from './casterFields.js';
import { readGear } from './gearFields.js';
import { readStats, statFields } from './statFields.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('./gearFields.js').GearOptions} GearOptions */

/**
 * The seed an encounter form fills itself from: a live encounter being
 * edited, a bestiary template being edited, or null while creating.
 * @typedef {{
 *   name?: string,
 *   tier?: EnemyTier,
 *   maxHP?: number,
 *   level?: number,
 *   statBlock?: Record<string, number>,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * } | null} EncounterSeed
 */

/** The tier picker's choices. Both surfaces show the same two. */
function tierOptions() {
  return ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' }));
}

/**
 * The encounter blueprint fields: identity, vitals, gear, the stat block, and
 * the optional caster section. A caster class turns the foe into a combatant
 * that can cast during initiative, and "None" leaves it a plain fighter.
 *
 * With `stats` false, the stat block is left out, for a surface that edits it
 * elsewhere. A new foe defaults to the tier's armed gear, the common humanoid
 * case, while an edit shows what the foe carries, including the explicit
 * "None" of a creature with no weapon or armor by design.
 * @param {EncounterSeed} seed
 * @param {GearOptions} gear the merged weapon and armor choices
 * @param {{ stats?: boolean }} [options]
 * @returns {ModalField[]}
 */
export function encounterFields(seed, gear, { stats = true } = {}) {
  return [
    { name: 'name', label: 'Name', value: seed?.name ?? '', placeholder: 'Enemy name' },
    {
      name: 'tier',
      label: 'Tier',
      type: 'select',
      value: seed?.tier ?? 'mob',
      options: tierOptions(),
    },
    { name: 'level', label: 'Level', type: 'number', value: seed?.level ?? 1, min: 1 },
    { name: 'maxHP', label: 'Max HP', type: 'number', value: seed?.maxHP ?? 10, min: 1 },
    {
      name: 'weapon',
      label: 'Weapon',
      type: 'select',
      newRow: true,
      value: seed ? (gear.currentWeapon?.name ?? '') : defaultEnemyGear(1, 'mob').weapon.name,
      options: gear.weaponOptions,
    },
    {
      name: 'armor',
      label: 'Armor',
      type: 'select',
      value: seed ? (gear.currentArmor?.name ?? '') : defaultEnemyGear(1, 'mob').armor.name,
      options: gear.armorOptions,
    },
    ...(stats ? statFields(STAT_KEYS, seed?.statBlock ?? defaultEnemyStats(1, 'mob')) : []),
    ...casterFields(seed),
  ];
}

/**
 * The form's live behavior: refilter the spell picker for the chosen caster
 * class and level, and, while creating, re-stamp the stat defaults as level or
 * tier change. The re-stamping stops as soon as a stat is hand-edited, so the
 * GM's own numbers stand, and an edit of a stored foe never re-stamps at all,
 * because its block is authoritative.
 *
 * Each call returns a fresh handler, which holds the "a stat was touched"
 * flag for one open form.
 * @param {{ restampStats: boolean }} options
 * @returns {(name: string, form: ModalFormHandle) => void}
 */
export function encounterFieldsChange({ restampStats }) {
  let statsTouched = false;
  return (name, form) => {
    if (refilterSpellsOnChange(name, form)) return;
    if (!restampStats) return;
    if (name.startsWith('stat-')) {
      statsTouched = true;
      return;
    }
    if (statsTouched || (name !== 'level' && name !== 'tier')) return;
    const stats = defaultEnemyStats(
      clampInt(form.get('level'), 1),
      /** @type {EnemyTier} */ (form.get('tier')),
    );
    for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
  };
}

/**
 * Read the blueprint fields back out of a submitted form. The gear cascade,
 * the clamps, and the caster read-back are the same on both surfaces. The
 * result carries `statBlock` only when the form showed the block.
 * @param {Record<string, string>} values
 * @param {GearOptions} gear the same options the fields were built from
 * @param {{ stats?: boolean }} [options]
 * @returns {{
 *   name: string,
 *   maxHP: number,
 *   level: number,
 *   tier: EnemyTier,
 *   statBlock?: Record<string, number>,
 *   weapon: import('../types/entities.js').EnemyWeapon | null,
 *   armor: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * }}
 */
export function readEncounterFields(values, gear, { stats = true } = {}) {
  const level = clampInt(values.level, 1);
  const tier = /** @type {EnemyTier} */ (values.tier);
  // The empty value is the explicit "None" choice. It stores null, which
  // suppresses the default-gear stamping that the fallback would otherwise do.
  const { weapon, armor } = readGear(
    values.weapon,
    values.armor,
    gear,
    defaultEnemyGear(level, tier),
  );
  return {
    name: values.name.trim(),
    maxHP: clampInt(values.maxHP, 1),
    level,
    tier,
    ...(stats ? { statBlock: readStats(STAT_KEYS, values) } : {}),
    weapon,
    armor,
    ...readCasterOptions(values),
  };
}
