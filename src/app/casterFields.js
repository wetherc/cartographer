import { CLASS_LIST, isCasterClass } from '../entities/Classes.js';
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
 * Every library spell as a multiselect option, ordered by level then name and
 * labelled with its level (cantrips first). The value is the spell id, so the
 * multiselect's comma-joined result is a set of spell ids.
 * @returns {{ value: string, label: string }[]}
 */
export function spellPickerOptions() {
  return activeSpells()
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
      options: spellPickerOptions(),
    },
  ];
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
