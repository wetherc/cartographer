/**
 * The creature's authoring fields, described once. The campaign dialog
 * (`creatureForm`) and the template form in the Library rail render this same
 * list, one through `promptModal` and one through `buildSpecForm`, and read
 * it back through `readCreatureFields`. The two surfaces differ only in what
 * surrounds the blueprint: the dialog adds the placement fields, and an edit
 * of a live foe leaves the stat block out, because the Build rail's row chips
 * own it there.
 */

import { coerceCR, crOptions } from '../data/challenge.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { DEFAULT_CREATURE_HP, defaultEnemyGear, dispositionOptions } from '../entities/Creature.js';
import {
  ABILITY_SCORES,
  defaultEnemyStats,
  ENEMY_TIERS,
  normalizeStatBlock,
  STAT_KEYS,
} from '../entities/Modifiers.js';
import { creatureProficiencyFields } from '../entities/Proficiencies.js';
import { clampInt } from '../util/num.js';
import { splitList } from '../util/text.js';
import { casterFields, readCasterOptions, refilterSpellsOnChange } from './casterFields.js';
import { readGear } from './gearFields.js';
import { readStats, statFields } from './statFields.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../types/creature.js').Disposition} Disposition */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('./gearFields.js').GearOptions} GearOptions */

/**
 * The seed a creature form fills itself from: a live creature being edited, a
 * library template, or a partial preset such as the context menu's
 * `{ disposition: 'hostile', level: 1 }` for a new foe.
 * @typedef {{
 *   name?: string,
 *   role?: string,
 *   disposition?: Disposition,
 *   notes?: string,
 *   maxHP?: number,
 *   level?: number,
 *   tier?: EnemyTier,
 *   cr?: number,
 *   proficiencies?: import('../types/creature.js').CreatureProficiencies,
 *   stats?: Record<string, number>,
 *   weapon?: import('../types/entities.js').EnemyWeapon | null,
 *   armor?: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * } | null} CreatureSeed
 */

/** The tier picker's choices. Both surfaces show the same two. */
function tierOptions() {
  return ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' }));
}

/**
 * The creature blueprint fields: identity, disposition, notes, the optional
 * level, tier, and challenge rating, the save and skill proficiencies, vitals,
 * gear, the stat block, and the optional caster section. A caster class turns the creature into a combatant that can cast
 * during initiative, and "None" leaves it a plain fighter.
 *
 * A blank level marks a creature outside the leveling ladder, which is what
 * most townsfolk are. A seed with a level pre-fills the gear pickers and the
 * stat block with the tier's level-appropriate defaults, so a plain mob needs
 * no typing. A seed without one starts unarmed, unarmored, and at the
 * commoner's hit points, and every field stays overridable. A seed that
 * carries explicit gear shows it, including the explicit "None" of a creature
 * with no weapon or armor by design.
 *
 * With `stats` false, the stat block is left out, for a surface that edits it
 * elsewhere.
 * @param {CreatureSeed} seed
 * @param {GearOptions} gear the merged weapon and armor choices
 * @param {{ stats?: boolean }} [options]
 * @returns {ModalField[]}
 */
export function creatureFields(seed, gear, { stats = true } = {}) {
  const leveled = seed?.level != null;
  const stamp = leveled
    ? defaultEnemyGear(/** @type {number} */ (seed.level), seed.tier ?? 'mob')
    : null;
  return [
    { name: 'name', label: 'Name', value: seed?.name ?? '', placeholder: 'Creature name' },
    {
      name: 'role',
      label: 'Role / faction',
      value: seed?.role ?? '',
      placeholder: 'Role / faction',
    },
    {
      name: 'disposition',
      label: 'Disposition',
      type: 'select',
      value: seed?.disposition ?? 'neutral',
      options: dispositionOptions(),
    },
    {
      name: 'maxHP',
      label: 'Max HP',
      type: 'number',
      value: seed?.maxHP ?? DEFAULT_CREATURE_HP,
      min: 1,
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      value: seed?.notes ?? '',
      rows: 3,
      full: true,
    },
    {
      name: 'level',
      label: 'Level (blank for none)',
      type: 'number',
      value: seed?.level ?? '',
      min: 1,
    },
    {
      name: 'tier',
      label: 'Tier',
      type: 'select',
      value: seed?.tier ?? 'mob',
      options: tierOptions(),
    },
    {
      name: 'cr',
      label: 'Challenge rating',
      type: 'select',
      value: seed?.cr != null ? String(seed.cr) : '',
      options: crOptions(),
    },
    {
      name: 'saves',
      label: 'Save proficiencies',
      type: 'multiselect',
      newRow: true,
      full: true,
      value: (seed?.proficiencies?.saves ?? []).join(','),
      options: ABILITY_SCORES.map((ability) => ({ value: ability, label: ability })),
    },
    {
      name: 'skills',
      label: 'Skill proficiencies',
      type: 'multiselect',
      full: true,
      value: (seed?.proficiencies?.skills ?? []).join(','),
      options: SKILL_IDS.map((id) => ({ value: id, label: skillName(id) })),
    },
    {
      name: 'weapon',
      label: 'Weapon',
      type: 'select',
      newRow: true,
      value:
        seed?.weapon !== undefined ? (gear.currentWeapon?.name ?? '') : (stamp?.weapon.name ?? ''),
      options: gear.weaponOptions,
    },
    {
      name: 'armor',
      label: 'Armor',
      type: 'select',
      value:
        seed?.armor !== undefined ? (gear.currentArmor?.name ?? '') : (stamp?.armor.name ?? ''),
      options: gear.armorOptions,
    },
    ...(stats
      ? statFields(
          STAT_KEYS,
          normalizeStatBlock(
            seed?.stats ??
              (leveled
                ? defaultEnemyStats(/** @type {number} */ (seed.level), seed.tier ?? 'mob')
                : {}),
          ),
        )
      : []),
    ...casterFields(seed),
  ];
}

/**
 * The form's live behavior: refilter the spell picker for the chosen caster
 * class and level, and, while creating, re-stamp the stat defaults as level
 * or tier change. The re-stamping stops as soon as a stat is hand-edited, so
 * the GM's own numbers stand, and it never runs while the level is blank,
 * because an unleveled creature has no stat ladder. An edit of a stored
 * creature or a template never re-stamps at all, because its block is
 * authoritative.
 *
 * Each call returns a fresh handler, which holds the "a stat was touched"
 * flag for one open form.
 * @param {{ restampStats: boolean }} options
 * @returns {(name: string, form: ModalFormHandle) => void}
 */
export function creatureFieldsChange({ restampStats }) {
  let statsTouched = false;
  return (name, form) => {
    if (refilterSpellsOnChange(name, form)) return;
    if (!restampStats) return;
    if (name.startsWith('stat-')) {
      statsTouched = true;
      return;
    }
    if (statsTouched || (name !== 'level' && name !== 'tier')) return;
    if (String(form.get('level')).trim() === '') return;
    const stats = defaultEnemyStats(
      clampInt(form.get('level'), 1),
      /** @type {EnemyTier} */ (form.get('tier')),
    );
    for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
  };
}

/**
 * Read the blueprint fields back out of a submitted form. The empty gear
 * value is the explicit "None" choice and stores null, with no fallback: the
 * field's own default already offered the level's loadout, so what the picker
 * shows is what the creature gets. A blank level stores no level and no tier.
 * A blank challenge rating stores none, which the app reads as unrated. Two
 * empty proficiency pickers store no proficiency record. The result carries
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
 *   tier?: EnemyTier,
 *   cr?: number,
 *   proficiencies?: import('../types/creature.js').CreatureProficiencies,
 *   stats?: Record<string, number>,
 *   weapon: import('../types/entities.js').EnemyWeapon | null,
 *   armor: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * }}
 */
export function readCreatureFields(values, gear, { stats = true } = {}) {
  const rawLevel = String(values.level ?? '').trim();
  const cr = coerceCR(values.cr);
  return {
    ...(cr === undefined ? {} : { cr }),
    ...creatureProficiencyFields({
      saves: splitList(values.saves),
      skills: splitList(values.skills),
    }),
    name: values.name.trim(),
    disposition: /** @type {Disposition} */ (values.disposition),
    role: values.role.trim(),
    notes: values.notes.trim(),
    maxHP: clampInt(values.maxHP, 1, Infinity, DEFAULT_CREATURE_HP),
    ...(rawLevel === ''
      ? {}
      : { level: clampInt(rawLevel, 1), tier: /** @type {EnemyTier} */ (values.tier) }),
    ...(stats ? { stats: readStats(STAT_KEYS, values) } : {}),
    ...readGear(values.weapon, values.armor, gear),
    ...readCasterOptions(values),
  };
}
