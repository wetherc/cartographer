import { CLASS_LIST, isCasterClass, getClass, slotsForClass } from '../entities/Classes.js';
import { activeSpells, activeSpellIndex } from '../library/Library.js';
import { emptySpellbook } from '../entities/Character.js';
import { clampInt } from '../util/num.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/**
 * Returns the class options for a caster picker: "None" (a non-caster) plus
 * every spellcasting class. The picker omits non-caster classes, because its
 * only job is to turn a combatant into a caster. A non-caster choice is
 * simply "None".
 * @returns {{ value: string, label: string }[]}
 */
export function casterClassOptions() {
  return [
    { value: '', label: 'None (non-caster)' },
    ...CLASS_LIST.filter((c) => c.casterType !== 'none').map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ];
}

/**
 * Returns the highest spell level a class can cast at a given caster level.
 * The picker uses this to hide spells the caster cannot slot. This function
 * reads the value from the class's slot table, where the table length is the
 * top slot level. Pact casters (Warlock) have no table entry, so this
 * function computes their pact-slot progression directly: one spell level
 * every two caster levels, up to a maximum of 5. The function returns 0 for
 * a non-caster or unknown class, and for a level-1 half-caster with no slots
 * yet.
 * @param {string | undefined | null} classId
 * @param {number} casterLevel
 * @returns {number}
 */
export function maxSpellLevelForClass(classId, casterLevel) {
  const def = getClass(classId);
  if (!def || def.casterType === 'none') return 0;
  const level = Math.max(1, Math.floor(casterLevel) || 1);
  const slots = slotsForClass(classId, level);
  if (slots.length > 0) return slots.length;
  if (def.casterType === 'pact') return Math.min(5, Math.ceil(level / 2));
  return 0;
}

/**
 * Returns library spells as multiselect options, ordered by level then name,
 * and labelled with their level (cantrips first). Each option's value is the
 * spell id, so the multiselect's comma-joined result is a set of spell ids. A
 * caster class filters the list to that class's spell list and to the spell
 * levels it can slot at `casterLevel`. With no caster class (None or
 * non-caster), this function offers the whole library, because the field is
 * discarded downstream anyway.
 * @param {string} [classId]
 * @param {number} [casterLevel]
 * @returns {{ value: string, label: string }[]}
 */
export function spellPickerOptions(classId = '', casterLevel = 1) {
  const filtered = isCasterClass(classId);
  const max = filtered ? maxSpellLevelForClass(classId, casterLevel) : 0;
  return (
    activeSpells()
      // `filter` already returns a fresh array. Sorting it in place cannot
      // reach the shared library list that this reads from.
      .filter((s) => !filtered || (s.classes.includes(classId) && s.level <= max))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((s) => ({
        value: s.id,
        label: `${s.level === 0 ? 'Cantrip' : `L${s.level}`} — ${s.name}`,
      }))
  );
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

/**
 * Returns the three caster fields (class, caster level, and a spell
 * multiselect) shared by the encounter and NPC dialogs. A seed from an
 * existing caster's class, level, and spellbook pre-selects these fields for
 * editing. The spell list offers the whole library, because a foe can know
 * any spell, and it is pre-checked from the seed's spellbook.
 * @param {{ class?: string, casterLevel?: number, level?: number, spellbook?: Spellbook } | null} seed
 * @returns {ModalField[]}
 */
export function casterFields(seed) {
  return [
    {
      name: 'casterClass',
      label: 'Caster class',
      type: 'select',
      value: seed?.class ?? '',
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
      // Seed the list filtered to the seed's class and level. The dialog's
      // onChange refilters it live as the caster class or level changes.
      options: spellPickerOptions(seed?.class ?? '', seed?.casterLevel ?? seed?.level ?? 1),
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
 * Reads the caster fields back into `withCasterFields`/`createNPC` options. A
 * non-caster class yields no caster options, an empty object, so the entity
 * stays a plain combatant.
 * @param {Record<string, string>} values
 * @returns {{ class?: string, casterLevel?: number, spellbook?: Spellbook }}
 */
export function readCasterOptions(values) {
  const cls = values.casterClass;
  if (!isCasterClass(cls)) return {};
  const casterLevel = clampInt(values.casterLevel, 1);
  const ids = splitList(values.spells);
  return { class: cls, casterLevel, spellbook: spellbookFromIds(ids) };
}
