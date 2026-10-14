import { deepFreeze } from '../util/deepFreeze.js';
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */

/**
 * @typedef {object} SpellKindInfo
 * @property {string} label the name of the kind in the spell form's Effect select
 * @property {boolean} helps true when the kind reaches the caster's own side
 *   (a heal or a buff), so the cast dialog says "Recipient" and offers allies
 * @property {boolean} targetFree true when the kind picks no creature (a
 *   utility spell or a summons), so the cast has no target picker and is not
 *   refused for having nobody to aim at
 */

/**
 * The traits of each spell effect kind that code outside the kind's own
 * branches reads. The type is a record over every kind, so a kind added to
 * `SpellEffect` without a row here fails the typecheck. The key order is the
 * order of `SPELL_EFFECT_KINDS` in data/spells.js, which a test checks.
 * @type {Readonly<Record<SpellEffect['kind'], SpellKindInfo>>}
 */
export const SPELL_KINDS = deepFreeze({
  attack: { label: 'Attack', helps: false, targetFree: false },
  save: { label: 'Save', helps: false, targetFree: false },
  heal: { label: 'Heal', helps: true, targetFree: false },
  buff: { label: 'Buff', helps: true, targetFree: false },
  summons: { label: 'Summons', helps: false, targetFree: true },
  utility: { label: 'Utility', helps: false, targetFree: true },
});
