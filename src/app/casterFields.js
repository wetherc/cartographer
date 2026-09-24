import { CLASS_LIST } from '../entities/Classes.js';
import { castsAs, spellListOf, subclassDef } from '../entities/ClassCasting.js';
import { classSpellLevelCap } from '../entities/SpellLearning.js';
import { activeSpells, activeSpellIndex } from '../library/Library.js';
import { emptySpellbook } from '../entities/Character.js';
import { clampInt } from '../util/num.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/**
 * The caster picker's option value for a class and subclass pair. A casting
 * subclass joins its id to the class id with a colon ("fighter:eldritch-knight"),
 * and any other pair is the class id alone, so a Life Domain cleric seeds
 * the plain "cleric" option. Class ids contain no colon.
 * @param {string | undefined} classId
 * @param {string | undefined} [subclass]
 * @returns {string}
 */
export function casterValue(classId, subclass) {
  if (!classId) return '';
  const sub = subclassDef(classId, subclass);
  return sub?.casting ? `${classId}:${sub.id}` : classId;
}

/**
 * Split a caster picker value back into its class id and, for a casting
 * subclass, the subclass's display name.
 * @param {string | undefined} value
 * @returns {{ classId: string, subclass?: string }}
 */
export function parseCasterValue(value) {
  const [classId = '', subId] = (value ?? '').split(':');
  const sub = subId ? subclassDef(classId, subId) : null;
  return sub ? { classId, subclass: sub.name } : { classId };
}

/**
 * Returns the class options for a caster picker: "None" (a non-caster),
 * every spellcasting class, and every class-and-subclass pair that casts
 * ("Fighter (Eldritch Knight)"). The picker omits non-caster classes,
 * because its only job is to turn a combatant into a caster. A non-caster
 * choice is simply "None".
 * @returns {{ value: string, label: string }[]}
 */
export function casterClassOptions() {
  return [
    { value: '', label: 'None (non-caster)' },
    ...CLASS_LIST.filter((c) => c.casterType !== 'none').map((c) => ({
      value: c.id,
      label: c.name,
    })),
    ...CLASS_LIST.flatMap((c) =>
      (c.subclasses ?? [])
        .filter((s) => s.casting)
        .map((s) => ({ value: `${c.id}:${s.id}`, label: `${c.name} (${s.name})` })),
    ),
  ];
}

/**
 * Returns the highest spell level a class can cast at a given caster level.
 * The picker uses this to hide spells the caster cannot slot. The value is
 * the class's own learning cap (see `SpellLearning.classSpellLevelCap`),
 * with `subclass` applied. The function returns 0 for a non-caster or
 * unknown class, and for a caster with no slots yet at that level (a
 * level-1 half-caster, or an Eldritch Knight below level 3).
 * @param {string | undefined | null} classId
 * @param {number} casterLevel
 * @param {string} [subclass]
 * @returns {number}
 */
export function maxSpellLevelForClass(classId, casterLevel, subclass) {
  if (!classId) return 0;
  return classSpellLevelCap(classId, Math.max(1, Math.floor(casterLevel) || 1), subclass);
}

/**
 * Returns library spells as multiselect options, ordered by level then name,
 * and labelled with their level (cantrips first). Each option's value is the
 * spell id, so the multiselect's comma-joined result is a set of spell ids. A
 * caster picker value filters the list to that caster's spell list (the
 * wizard list for an Eldritch Knight) and to the spell levels it can slot at
 * `casterLevel`. With no caster (None, or a pair that does not cast at that
 * level), this function offers nothing. The field is discarded downstream
 * for a non-caster, so a full list of checkboxes would only invite picks
 * that never store. The multiselect shows `NO_CASTER_TEXT` in place of the
 * empty list.
 * @param {string} [value] a caster picker value (see `casterValue`)
 * @param {number} [casterLevel]
 * @returns {{ value: string, label: string }[]}
 */
export function spellPickerOptions(value = '', casterLevel = 1) {
  const { classId, subclass } = parseCasterValue(value);
  const level = casterLevelFor(classId, subclass, casterLevel);
  if (!castsAs(classId, subclass, level)) return [];
  const list = spellListOf({ classId, subclass, level });
  const max = maxSpellLevelForClass(classId, level, subclass);
  return (
    activeSpells()
      // `filter` already returns a fresh array. Sorting it in place cannot
      // reach the shared library list that this reads from.
      .filter((s) => s.classes.includes(list) && s.level <= max)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((s) => ({
        value: s.id,
        label: `${s.level === 0 ? 'Cantrip' : `L${s.level}`} — ${s.name}`,
      }))
  );
}

/**
 * The caster level the form stores for a pair. A casting subclass casts
 * only from its class's subclass level, so a lower entry rises to it. A
 * "Fighter (Eldritch Knight)" left at the default level 1 becomes a level 3
 * caster instead of a non-caster.
 * @param {string} classId
 * @param {string | undefined} subclass
 * @param {number} casterLevel
 * @returns {number}
 */
function casterLevelFor(classId, subclass, casterLevel) {
  const level = Math.max(1, Math.floor(casterLevel) || 1);
  if (!subclass) return level;
  const floor = CLASS_LIST.find((c) => c.id === classId)?.subclassLevel ?? 1;
  return Math.max(level, floor);
}

/**
 * Returns the flat set of spell ids that a spellbook holds. The picker uses
 * this set to pre-check its options.
 * @param {Spellbook | undefined} spellbook
 * @returns {string[]}
 */
export function spellbookIds(spellbook) {
  if (!spellbook) return [];
  return [...new Set([...spellbook.cantrips, ...spellbook.known, ...spellbook.prepared])];
}

/** The text the spell picker shows while no caster class is chosen. */
export const NO_CASTER_TEXT = 'Pick a caster class to choose spells.';

/**
 * Returns the three caster fields (class, caster level, and a spell
 * multiselect) of the creature authoring spec. A seed from an existing
 * caster's class, subclass, level, and spellbook pre-selects these fields
 * for editing. The spell list offers what the seed's class can slot, and it is
 * pre-checked from the seed's spellbook. With no caster class the list is
 * empty and shows why, until a class is picked.
 * @param {{ class?: string, subclass?: string, casterLevel?: number, level?: number, spellbook?: Spellbook } | null} seed
 * @returns {ModalField[]}
 */
export function casterFields(seed) {
  return [
    {
      name: 'casterClass',
      label: 'Caster class',
      type: 'select',
      // The caster section begins a row, so it does not pair with the last
      // field of whatever block comes before it.
      newRow: true,
      value: casterValue(seed?.class, seed?.subclass),
      options: casterClassOptions(),
    },
    {
      name: 'casterLevel',
      label: 'Caster level',
      type: 'number',
      value: seed?.casterLevel ?? seed?.level ?? 1,
      min: 1,
    },
    {
      name: 'spells',
      label: 'Spells',
      type: 'multiselect',
      value: spellbookIds(seed?.spellbook).join(','),
      full: true,
      emptyText: NO_CASTER_TEXT,
      // Seed the list filtered to the seed's class and level. The dialog's
      // onChange refilters it live as the caster class or level changes.
      options: spellPickerOptions(
        casterValue(seed?.class, seed?.subclass),
        seed?.casterLevel ?? seed?.level ?? 1,
      ),
    },
  ];
}

/**
 * This is the modal `onChange` fragment behind the caster fields. When the
 * caster class or level changes, it refilters the spell multiselect to what
 * that caster can slot. It returns whether it handled the change, so a
 * dialog with its own onChange logic (the encounter form's stat re-stamping)
 * can exit early.
 * @param {string} name the changed field's name
 * @param {{ get: (name: string) => string, setOptions: (name: string, options: { value: string, label: string }[]) => void }} form
 * @returns {boolean}
 */
export function refilterSpellsOnChange(name, form) {
  if (name !== 'casterClass' && name !== 'casterLevel') return false;
  form.setOptions(
    'spells',
    spellPickerOptions(form.get('casterClass'), Number(form.get('casterLevel')) || 1),
  );
  return true;
}

/**
 * Splits a flat set of picked spell ids into a spellbook. Cantrips (level 0)
 * go into `cantrips`. Leveled spells go into both `known` and `prepared`, so
 * a foe can cast them right away. This function drops unknown ids, such as a
 * spell removed from the library.
 * @param {string[]} ids
 * @returns {Spellbook}
 */
export function spellbookFromIds(ids) {
  const index = activeSpellIndex();
  const spellbook = emptySpellbook();
  for (const id of ids) {
    const spell = index.get(id);
    if (!spell) continue;
    if (spell.level === 0) spellbook.cantrips.push(id);
    else {
      spellbook.known.push(id);
      spellbook.prepared.push(id);
    }
  }
  return spellbook;
}

/**
 * Reads the caster fields back into `createCreature` options. A
 * non-caster class yields no caster options, an empty object, so the entity
 * stays a plain combatant. A casting subclass comes back as its display
 * name, with the caster level raised to the subclass level where it sat
 * below it.
 * @param {Record<string, string>} values
 * @returns {{ class?: string, subclass?: string, casterLevel?: number, spellbook?: Spellbook }}
 */
export function readCasterOptions(values) {
  const { classId, subclass } = parseCasterValue(values.casterClass);
  const casterLevel = casterLevelFor(classId, subclass, clampInt(values.casterLevel, 1));
  if (!castsAs(classId, subclass, casterLevel)) return {};
  const spellbook = spellbookFromIds(splitList(values.spells));
  return { class: classId, ...(subclass ? { subclass } : {}), casterLevel, spellbook };
}
