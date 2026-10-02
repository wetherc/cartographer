import { promptModal } from './Modal.js';
import { getInvocations, setPactBoon } from '../entities/Invocations.js';
import {
  applyWarlockPicks,
  pactBoonPending,
  pendingInvocationCount,
  unpickedInvocations,
} from '../entities/InvocationLevelUp.js';
import { arcanumOptions, pendingArcana } from '../entities/MysticArcanum.js';
import { activeSpells } from '../library/Library.js';
import { askTomeCantrips, askTomeRituals } from './TomeFlow.js';
import { pendingTomeCantrips, pendingTomeRituals, tomeCantrips } from '../entities/PactTome.js';
import { PACT_BOONS } from '../data/invocations.js';
import { splitList } from '../util/text.js';

/**
 * The warlock dialogs of a level-up and of the sheet's pending row: the pact
 * boon, the new invocations, one optional swap, and the Mystic Arcanum
 * spells. `InvocationLevelUp.js`
 * keeps the rules. This file is DOM wiring over it, verified visually.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/invocation.js').WarlockPicks} WarlockPicks */
/** @typedef {import('../types/invocation.js').PactBoon} PactBoon */

/**
 * Ask for the pact boon of a character that has none.
 * @param {Character} character
 * @returns {Promise<PactBoon | null>} null for a cancel
 */
async function askBoon(character) {
  if (!pactBoonPending(character)) return null;
  const values = await promptModal(
    'Pact boon',
    [
      {
        name: 'boon',
        label: 'Pact boon',
        type: 'select',
        options: PACT_BOONS.map((b) => ({ value: b.id, label: b.name })),
        value: PACT_BOONS[0].id,
      },
    ],
    { submitLabel: 'Choose' },
  );
  return values ? /** @type {PactBoon} */ (values.boon) : null;
}

/**
 * Ask for the invocations that the warlock level allows and the character
 * has not picked. A cancel or a short pick leaves the rest pending.
 * @param {Character} character
 * @returns {Promise<string[]>}
 */
async function askNewInvocations(character) {
  const max = pendingInvocationCount(character);
  const options = unpickedInvocations(character);
  if (max === 0 || options.length === 0) return [];
  const values = await promptModal(
    'New eldritch invocations',
    [
      {
        name: 'invocations',
        label: `Choose ${max}`,
        type: 'multiselect',
        options: options.map((inv) => ({ value: inv.id, label: inv.name })),
        max,
        value: '',
      },
    ],
    { submitLabel: 'Choose' },
  );
  return values ? splitList(values.invocations).slice(0, max) : [];
}

/**
 * Offer to replace one known invocation with another that qualifies. Leaving
 * either list at None keeps every invocation.
 * @param {Character} character
 * @returns {Promise<{ from: string, to: string } | null>}
 */
async function askSwap(character) {
  const known = getInvocations(character);
  const options = unpickedInvocations(character);
  if (known.length === 0 || options.length === 0) return null;
  const none = { value: '', label: 'None' };
  const values = await promptModal(
    'Replace an invocation',
    [
      {
        name: 'from',
        label: 'Replace (optional)',
        type: 'select',
        options: [none, ...known.map((inv) => ({ value: inv.id, label: inv.name }))],
        value: '',
      },
      {
        name: 'to',
        label: 'With',
        type: 'select',
        options: [none, ...options.map((inv) => ({ value: inv.id, label: inv.name }))],
        value: '',
      },
    ],
    { submitLabel: 'Done' },
  );
  return values?.from && values.to ? { from: values.from, to: values.to } : null;
}

/**
 * Ask for the Mystic Arcanum spell of each listed spell level, from the
 * warlock spells of that level in the library. A level left at None stays
 * pending.
 * @param {number[]} levels
 * @param {Record<string, string>} [current] the picks the selects start on
 * @returns {Promise<Record<string, string>>}
 */
export async function askArcana(levels, current = {}) {
  const spells = activeSpells();
  const fields = levels.map((level) => ({
    name: String(level),
    label: `${ordinal(level)}-level spell`,
    type: /** @type {const} */ ('select'),
    options: [
      { value: '', label: 'None' },
      ...arcanumOptions(spells, level).map((s) => ({ value: s.id, label: s.name })),
    ],
    value: current[level] ?? '',
  }));
  if (fields.length === 0) return {};
  const values = await promptModal('Mystic Arcanum', fields, { submitLabel: 'Choose' });
  return Object.fromEntries(Object.entries(values ?? {}).filter(([, id]) => id));
}

/** @param {number} n @returns {string} 6th, 7th, 8th, or 9th */
const ordinal = (n) => `${n}th`;

/**
 * Gather the warlock picks against a preview character. The pact boon comes
 * first, because it changes which invocations qualify, and the swap comes
 * after the new picks, then the Mystic Arcanum and the Book of Shadows. `swap` false skips the swap, as the sheet's pending
 * row does, since the rules allow a swap only when a warlock level is gained.
 * @param {Character} preview
 * @param {{ swap: boolean }} opts
 * @returns {Promise<WarlockPicks>}
 */
export async function askWarlockPicks(preview, opts) {
  const boon = await askBoon(preview);
  let next = boon ? setPactBoon(preview, boon) : preview;
  const added = await askNewInvocations(next);
  next = applyWarlockPicks(next, { added });
  const swap = opts.swap ? await askSwap(next) : null;
  next = applyWarlockPicks(next, { added: [], swap });
  const arcana = await askArcana(pendingArcana(next));
  // A new Tome boon asks for its cantrips, and a new Book of Ancient Secrets
  // for its two 1st-level rituals.
  const tome = pendingTomeCantrips(next) > 0 && tomeCantrips(next).length === 0;
  const tomeCantripIds = tome ? await askTomeCantrips(next) : [];
  const ritualCount = pendingTomeRituals(next);
  const rituals = ritualCount > 0 ? await askTomeRituals(next, ritualCount, 1) : [];
  return { boon, added, swap, arcana, tomeCantrips: tomeCantripIds, rituals };
}

/**
 * The sheet's pending row: ask for the pact boon, the missing invocations,
 * and the missing Mystic Arcanum spells,
 * and commit them to the character read after the last dialog closes.
 * @param {() => Character} getCharacter
 * @param {{ onCommit: (character: Character) => void }} opts
 */
export async function choosePendingWarlockPicks(getCharacter, opts) {
  const picks = await askWarlockPicks(getCharacter(), { swap: false });
  const live = getCharacter();
  const next = applyWarlockPicks(live, picks);
  if (next !== live) opts.onCommit(next);
}
