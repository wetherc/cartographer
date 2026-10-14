/**
 * The creature's authoring fields, described once. The campaign dialog
 * (`creatureForm`) and the template form in the Library rail render this same
 * list, one through `promptModal` and one through `buildSpecForm`, and read
 * it back through `readCreatureFields` in `creatureRead.js`. The two surfaces differ only in what
 * surrounds the blueprint: the dialog adds the placement fields, and an edit
 * of a live foe leaves the stat block out, because the Build rail's row chips
 * own it there.
 */

import { crOptions } from '../../data/challenge.js';
import { SKILL_IDS, skillName } from '../../data/skills.js';
import { DEFAULT_CREATURE_HP, dispositionOptions } from '../../entities/Creature.js';
import { defaultEnemyGear } from '../../entities/CreatureLoadout.js';
import {
  ABILITY_SCORES,
  defaultEnemyStats,
  ENEMY_TIERS,
  normalizeStatBlock,
  STAT_KEYS,
} from '../../entities/Modifiers.js';
import { DAMAGE_TYPES } from '../../entities/DamageParts.js';
import { CONCENTRATING, CONDITIONS } from '../../entities/Conditions.js';
import { CREATURE_TYPES } from '../../entities/CreatureType.js';
import { MAX_LEGENDARY, MAX_MULTIATTACK, SURPRISE_SIDES } from '../../entities/CreatureAttacks.js';
import { capitalize } from '../../util/text.js';
import { casterFields, refilterSpellsOnChange } from './casterFields.js';
import { acLabelFromForm, statFields } from './statFields.js';
import { arrangeFields } from './creatureLayout.js';
import { readLevel } from './creatureRead.js';

/** @typedef {import('../../types/modal.js').ModalField} ModalField */
/** @typedef {import('../../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../../types/creature.js').Disposition} Disposition */
/** @typedef {import('../../types/entities.js').CreatureTier} CreatureTier */
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
 *   actions?: import('../../types/creature.js').CreatureAction[],
 *   stats?: Record<string, number>,
 *   weapons?: import('../../types/entities.js').CreatureWeapon[],
 *   armor?: import('../../types/entities.js').CreatureArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../../types/entities.js').Spellbook,
 * } | null} CreatureSeed
 */

/**
 * The three damage-type pickers: resistances, vulnerabilities, and immunities.
 * @param {import('../../types/creature.js').DamageDefenses | undefined} defenses
 * @returns {ModalField[]}
 */
function defenseFieldList(defenses) {
  const options = DAMAGE_TYPES.map((type) => ({ value: type, label: capitalize(type) }));
  /** @type {['resist' | 'vulnerable' | 'immune', string][]} */
  const rows = [
    ['resist', 'Resistant to'],
    ['vulnerable', 'Vulnerable to'],
    ['immune', 'Immune to'],
  ];
  return rows.map(([name, label]) => ({
    name,
    label,
    type: 'multiselect',
    full: true,
    columns: true,
    value: (defenses?.[name] ?? []).join(','),
    options,
  }));
}

/** The tier picker's choices. Both surfaces show the same two. */
function tierOptions() {
  return ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' }));
}

/**
 * The creature blueprint fields: identity, disposition, notes, the optional
 * level, tier, and challenge rating, the save and skill proficiencies, the
 * damage defenses, vitals,
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
  const built = blueprintFields(seed, gear, stats);
  /** @type {Record<string, string>} */
  const values = Object.fromEntries(
    built.map((field) => [field.name, String(('value' in field ? field.value : '') ?? '')]),
  );
  const acLabel = acLabelFromForm((name) => values[name] ?? '', gear);
  const fields = built.map((field) =>
    field.name === 'stat-AC' ? { ...field, label: acLabel } : field,
  );
  const casters = casterFields(seed);
  return arrangeFields(fields, casters);
}

/**
 * The blueprint fields before the sections order them, keyed by name.
 * @param {CreatureSeed} seed
 * @param {GearOptions} gear
 * @param {boolean} stats
 * @returns {ModalField[]}
 */
function blueprintFields(seed, gear, stats) {
  const leveled = seed?.level != null;
  const stamp = leveled
    ? defaultEnemyGear(/** @type {number} */ (seed.level), seed.tier ?? 'mob')
    : null;
  return [
    { name: 'name', label: 'Name', value: seed?.name ?? '', placeholder: 'Creature name' },
    {
      name: 'role',
      label: 'Role / faction (players see it)',
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
      name: 'creatureType',
      label: 'Creature type',
      type: 'select',
      value: seed?.creatureType ?? '',
      options: [
        { value: '', label: 'Untyped' },
        ...CREATURE_TYPES.map((t) => ({ value: t, label: capitalize(t) })),
      ],
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
      label: 'Notes (GM only)',
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
    ...defenseFieldList(seed?.defenses),
    {
      name: 'conditionImmunities',
      label: 'Immune to conditions',
      type: 'multiselect',
      full: true,
      columns: true,
      value: (seed?.conditionImmunities ?? []).join(','),
      options: CONDITIONS.filter((c) => c !== CONCENTRATING).map((c) => ({ value: c, label: c })),
    },
    {
      name: 'weapon',
      label: 'Weapon',
      type: 'select',
      newRow: true,
      value:
        seed?.weapons !== undefined ? (gear.currentWeapon?.name ?? '') : (stamp?.weapon.name ?? ''),
      options: gear.weaponOptions,
    },
    {
      name: 'otherWeapons',
      label: 'Other weapons',
      type: 'multiselect',
      full: true,
      fixedHeight: true,
      value: gear.currentOthers,
      options: gear.otherWeaponOptions,
    },
    {
      name: 'armor',
      label: 'Armor',
      type: 'select',
      value:
        seed?.armor !== undefined ? (gear.currentArmor?.name ?? '') : (stamp?.armor.name ?? ''),
      options: gear.armorOptions,
    },
    // A creature has one weapon, so its Multiattack is a count of swings
    // with it. A blank box or a 1 stores no Multiattack.
    {
      name: 'multiattack',
      label: 'Multiattack (attacks per action)',
      type: 'number',
      value: seed?.multiattack ?? '',
      min: 1,
      max: MAX_MULTIATTACK,
    },
    // The swing of the Multiattack that rolls with disadvantage, counted
    // from 1. A blank box, or a number past the last swing, stores none.
    {
      name: 'multiattackDisadvantage',
      label: 'Multiattack: attack with disadvantage',
      type: 'number',
      value: seed?.multiattackDisadvantage ?? '',
      min: 1,
      max: MAX_MULTIATTACK,
    },
    {
      name: 'redirectAttack',
      label: 'Redirect Attack (reaction: an ally becomes the target)',
      type: 'checkbox',
      value: seed?.redirectAttack === true,
    },
    {
      name: 'turnResistance',
      label: 'Turn Resistance (advantage on saves against Turn Undead)',
      type: 'checkbox',
      value: seed?.turnResistance === true,
    },
    // Legendary actions per round and legendary resistances per day. A
    // blank box stores none.
    {
      name: 'legendaryActions',
      label: 'Legendary actions per round',
      type: 'number',
      value: seed?.legendaryActions ?? '',
      min: 1,
      max: MAX_LEGENDARY,
    },
    {
      name: 'legendaryResistance',
      label: 'Legendary resistance per day',
      type: 'number',
      value: seed?.legendaryResistance ?? '',
      min: 1,
      max: MAX_LEGENDARY,
    },
    {
      name: 'packTactics',
      label: 'Pack Tactics',
      type: 'checkbox',
      value: seed?.packTactics === true,
    },
    // Surprise Attack dice land on a hit against a surprised target in
    // round 1. A blank count stores none.
    {
      name: 'surpriseCount',
      label: 'Surprise Attack: dice',
      type: 'number',
      newRow: true,
      value: seed?.surpriseAttack?.count ?? '',
      min: 0,
    },
    {
      name: 'surpriseDie',
      label: 'Surprise Attack: die',
      type: 'select',
      value: String(seed?.surpriseAttack?.sides ?? 6),
      options: SURPRISE_SIDES.map((sides) => ({ value: String(sides), label: `d${sides}` })),
    },
    // A save the weapon forces on a hit, such as a wolf bite that knocks
    // the target prone. A blank ability stores no save.
    {
      name: 'hitSaveAbility',
      label: 'On hit: save',
      type: 'select',
      newRow: true,
      value: seed?.weapons?.[0]?.onHitSave?.ability ?? '',
      options: [
        { value: '', label: 'None' },
        ...ABILITY_SCORES.map((ability) => ({ value: ability, label: ability })),
      ],
    },
    {
      name: 'hitSaveDC',
      label: 'On hit: DC',
      type: 'number',
      value: seed?.weapons?.[0]?.onHitSave?.dc ?? 10,
      min: 1,
    },
    {
      name: 'hitSaveCondition',
      label: 'On hit: condition on a fail',
      type: 'select',
      value: seed?.weapons?.[0]?.onHitSave?.condition ?? 'Prone',
      options: CONDITIONS.filter((c) => c !== CONCENTRATING).map((c) => ({ value: c, label: c })),
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
 *
 * With `gear`, which a form that shows the stat block passes, the handler
 * also rewrites the AC caption after a change of armor, AC, DEX, level, or
 * tier, so the caption names the AC that combat uses.
 * @param {{ restampStats: boolean, gear?: GearOptions }} options
 * @returns {(name: string, form: ModalFormHandle) => void}
 */
export function creatureFieldsChange({ restampStats, gear }) {
  const restamp = restampChange(restampStats);
  return (name, form) => {
    restamp(name, form);
    if (gear && ['armor', 'stat-AC', 'stat-DEX', 'level', 'tier'].includes(name))
      form.setLabel('stat-AC', acLabelFromForm(form.get, gear));
  };
}

/**
 * The spell refilter and stat re-stamp part of `creatureFieldsChange`.
 * @param {boolean} restampStats
 * @returns {(name: string, form: ModalFormHandle) => void}
 */
function restampChange(restampStats) {
  let statsTouched = false;
  return (name, form) => {
    if (refilterSpellsOnChange(name, form)) return;
    if (!restampStats) return;
    if (name.startsWith('stat-')) {
      statsTouched = true;
      return;
    }
    if (statsTouched || (name !== 'level' && name !== 'tier')) return;
    const level = readLevel(form.get('level'));
    if (level === undefined) return;
    const stats = defaultEnemyStats(level, /** @type {CreatureTier} */ (form.get('tier')));
    for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
  };
}
