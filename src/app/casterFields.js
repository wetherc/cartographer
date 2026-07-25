import { CLASS_LIST, isCasterClass, getClass, slotsForClass } from '../entities/Classes.js';
import { activeSpells, activeSpellIndex } from '../library/Library.js';
import { emptySpellbook } from '../entities/Character.js';

/** @typedef {import('../ui/Modal.js').ModalField} ModalField */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/**
 * The class options for a caster picker: "None" (a non-caster) plus every
 * spellcasting class. Non-caster classes are omitted — the picker's only job is
 * to turn a combatant into a caster, and a non-caster choice is just "None".
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
 * The highest spell level a class can cast at a caster level, so the picker
 * hides spells the caster couldn't slot. Read from the class's slot table
 * (its length is the top slot level); pact casters (Warlock) have no table
 * entry, so their pact-slot progression — one spell level every two caster
 * levels, capping at 5 — is computed directly. 0 for a non-caster or unknown
 * class (and, e.g., a level-1 half-caster with no slots yet).
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
 * Library spells as multiselect options, ordered by level then name and
 * labelled with their level (cantrips first). The value is the spell id, so the
 * multiselect's comma-joined result is a set of spell ids. A caster class
 * filters the list to that class's spell list and the spell levels it can slot
 * at `casterLevel`; with no caster class (None/non-caster) the whole library is
 * offered, since the field is discarded downstream anyway.
 * @param {string} [classId]
 * @param {number} [casterLevel]
 * @returns {{ value: string, label: string }[]}
 */
export function spellPickerOptions(classId = '', casterLevel = 1) {
  const filtered = isCasterClass(classId);
  const max = filtered ? maxSpellLevelForClass(classId, casterLevel) : 0;
  return activeSpells()
    .filter((s) => !filtered || (s.classes.includes(classId) && s.level <= max))
    .slice()
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({
      value: s.id,
      label: `${s.level === 0 ? 'Cantrip' : `L${s.level}`} — ${s.name}`,
    }));
}

/**
 * The flat set of spell ids a spellbook holds, for pre-checking the picker.
 * @param {Spellbook | undefined} spellbook
 * @returns {string[]}
 */
export function spellbookIds(spellbook) {
  if (!spellbook) return [];
  return [...new Set([...spellbook.cantrips, ...spellbook.known, ...spellbook.prepared])];
}

/**
 * The three caster fields — class, caster level, and a spell multiselect —
 * shared by the encounter and NPC dialogs. Seeded from an existing caster's
 * class/level/spellbook so editing pre-selects them; the spell list is the whole
 * library (a foe may know any spell), pre-checked from the seed's spellbook.
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
      // Seed the list filtered to the seed's class/level; the dialog's onChange
      // refilters it live as the caster class or level change.
      options: spellPickerOptions(seed?.class ?? '', seed?.casterLevel ?? seed?.level ?? 1),
    },
  ];
}

/**
 * The modal `onChange` fragment behind the caster fields: when the caster class
 * or level changes, refilter the spell multiselect to what that caster can
 * slot. Returns whether the change was handled, so a dialog with its own
 * onChange logic (the encounter form's stat re-stamping) can bail early.
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
 * Partition a flat set of picked spell ids into a spellbook: cantrips (level 0)
 * into `cantrips`, leveled spells into both `known` and `prepared` so a foe can
 * cast them straight away. Unknown ids (a spell removed from the library) are
 * dropped.
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
 * Read the caster fields back into `withCasterFields`/`createNPC` options. A
 * non-caster class yields no caster options (an empty object), so the entity
 * stays a plain combatant.
 * @param {Record<string, string>} values
 * @returns {{ class?: string, casterLevel?: number, spellbook?: Spellbook }}
 */
export function readCasterOptions(values) {
  const cls = values.casterClass;
  if (!isCasterClass(cls)) return {};
  const casterLevel = Math.max(1, Number(values.casterLevel) || 1);
  const ids = values.spells ? values.spells.split(',').filter(Boolean) : [];
  return { class: cls, casterLevel, spellbook: spellbookFromIds(ids) };
}
