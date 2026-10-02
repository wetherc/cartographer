/**
 * The curated built-in spell corpus. This is a common cross-section of the
 * SRD, with every cantrip and leveled band represented, spanning all six
 * caster lists and all six effect kinds (attack, save, heal, buff, summons,
 * utility). The
 * schema is identical to a GM-authored or imported spell, so the gap
 * between this set and the full SRD closes by hand-authoring or JSON
 * import with no code change. SRD spells not yet included are tracked in
 * docs/spells-missing.md. The spells themselves live in the files under
 * `spells/`, one file per level band, plus `spells/utility.js`
 * for the utility spells that the eldritch invocations of a warlock cast.
 *
 * @typedef {import('../types/spell.js').Spell} Spell
 */

import { deepFreeze } from '../util/deepFreeze.js';
import { CANTRIPS } from './spells/cantrips.js';
import { LEVEL_1 } from './spells/level1.js';
import { LEVEL_2 } from './spells/level2.js';
import { LEVEL_3 } from './spells/level3.js';
import { LEVEL_4_TO_5 } from './spells/level4to5.js';
import { LEVEL_6_TO_9 } from './spells/level6to9.js';
import { UTILITY_SPELLS } from './spells/utility.js';

/** The eight schools of magic, in the order the authoring form lists them.
 * @type {import('../types/spell.js').SpellSchool[]} */
export const SPELL_SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
];

/** The six abilities a save-based spell can key off. @type {import('../types/spell.js').Ability[]} */
export const SPELL_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** The effect kinds a spell resolves as. @type {import('../types/spell.js').SpellEffect['kind'][]} */
export const SPELL_EFFECT_KINDS = ['attack', 'save', 'heal', 'buff', 'summons', 'utility'];

/**
 * Every built-in spell, from cantrips up. Each level band lives in its own
 * file under `spells/`, so no one file grows past a few hundred lines.
 * @type {Spell[]}
 */
export const DEFAULT_SPELLS = deepFreeze([
  ...CANTRIPS,
  ...LEVEL_1,
  ...LEVEL_2,
  ...LEVEL_3,
  ...LEVEL_4_TO_5,
  ...LEVEL_6_TO_9,
  ...UTILITY_SPELLS,
]);
