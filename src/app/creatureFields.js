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
import { defenseFields } from '../entities/DamageDefenses.js';
import { DAMAGE_TYPES } from '../entities/Equipment.js';
import { CONCENTRATING, CONDITIONS } from '../entities/Conditions.js';
import { CREATURE_TYPES, creatureTypeFields } from '../entities/CreatureType.js';
import {
  MAX_LEGENDARY,
  MAX_MULTIATTACK,
  SURPRISE_SIDES,
  attackTraitFields,
} from '../entities/CreatureAttacks.js';
import { normalizeHitSave } from '../combat/HitSave.js';
import { clampInt } from '../util/num.js';
import { capitalize, splitList } from '../util/text.js';
import { casterFields, readCasterOptions, refilterSpellsOnChange } from './casterFields.js';
import { readGear } from './gearFields.js';
import { readStats, statFields } from './statFields.js';
import { arrangeFields, syncDependents } from './creatureLayout.js';

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
 *   defenses?: import('../types/creature.js').DamageDefenses,
 *   creatureType?: import('../types/creature.js').CreatureType,
 *   conditionImmunities?: string[],
 *   multiattack?: number,
 *   packTactics?: boolean,
 *   surpriseAttack?: import("../types/creature.js").SurpriseAttack,
 *   multiattackDisadvantage?: number,
 *   redirectAttack?: boolean,
 *   turnResistance?: boolean,
 *   legendaryActions?: number,
 *   legendaryResistance?: number,
 *   stats?: Record<string, number>,
 *   weapon?: import('../types/entities.js').EnemyWeapon | null,
 *   armor?: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * } | null} CreatureSeed
 */

/**
 * The three damage-type pickers: resistances, vulnerabilities, and immunities.
 * @param {import('../types/creature.js').DamageDefenses | undefined} defenses
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
  const fields = blueprintFields(seed, gear, stats);
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
      value: seed?.weapon?.onHitSave?.ability ?? '',
      options: [
        { value: '', label: 'None' },
        ...ABILITY_SCORES.map((ability) => ({ value: ability, label: ability })),
      ],
    },
    {
      name: 'hitSaveDC',
      label: 'On hit: DC',
      type: 'number',
      value: seed?.weapon?.onHitSave?.dc ?? 10,
      min: 1,
    },
    {
      name: 'hitSaveCondition',
      label: 'On hit: condition on a fail',
      type: 'select',
      value: seed?.weapon?.onHitSave?.condition ?? 'Prone',
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
 * @param {{ restampStats: boolean }} options
 * @returns {(name: string, form: ModalFormHandle) => void}
 */
export function creatureFieldsChange({ restampStats }) {
  let statsTouched = false;
  return (name, form) => {
    syncDependents(name, form);
    if (refilterSpellsOnChange(name, form)) return;
    if (!restampStats) return;
    if (name.startsWith('stat-')) {
      statsTouched = true;
      return;
    }
    if (statsTouched || (name !== 'level' && name !== 'tier')) return;
    const level = readLevel(form.get('level'));
    if (level === undefined) return;
    const stats = defaultEnemyStats(level, /** @type {EnemyTier} */ (form.get('tier')));
    for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
  };
}

/**
 * The level a typed level field means, or undefined for no level. The
 * creature model has no level 0: a creature is either on the leveling ladder
 * at level 1 or above, or it carries no level at all. A blank box, a 0, a
 * negative number, and text that is not a number all read as no level.
 * @param {unknown} raw the field's string value
 * @returns {number | undefined}
 */
function readLevel(raw) {
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
 *   tier?: EnemyTier,
 *   cr?: number,
 *   proficiencies?: import('../types/creature.js').CreatureProficiencies,
 *   defenses?: import('../types/creature.js').DamageDefenses,
 *   creatureType?: import('../types/creature.js').CreatureType,
 *   conditionImmunities?: string[],
 *   multiattack?: number,
 *   packTactics?: boolean,
 *   surpriseAttack?: import("../types/creature.js").SurpriseAttack,
 *   multiattackDisadvantage?: number,
 *   redirectAttack?: boolean,
 *   turnResistance?: boolean,
 *   legendaryActions?: number,
 *   legendaryResistance?: number,
 *   stats?: Record<string, number>,
 *   weapon: import('../types/entities.js').EnemyWeapon | null,
 *   armor: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
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
    ...(level === undefined ? {} : { level, tier: /** @type {EnemyTier} */ (values.tier) }),
    ...(stats ? { stats: readStats(STAT_KEYS, values) } : {}),
    ...withHitSave(readGear(values.weapon, values.armor, gear), values),
    ...readCasterOptions(values),
  };
}

/**
 * Put the on-hit save of the form on the read weapon, or take it off. A
 * blank ability, or a creature with no weapon, stores no save.
 * @param {{ weapon: import('../types/entities.js').EnemyWeapon | null, armor: import('../types/entities.js').EnemyArmor | null }} read
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
