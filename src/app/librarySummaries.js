import { spellLevelName } from '../entities/SpellView.js';
import { formatDamage } from '../entities/DamageParts.js';
import { riderText } from '../entities/Riders.js';
import { crLabel } from '../data/challenge.js';
import { SPELL_KINDS } from '../entities/SpellKinds.js';
import { countNoun, capitalize } from '../util/text.js';
import { itemSummary } from '../entities/Equipment.js';
import { formatCost } from '../entities/Purse.js';

/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/feat.js').Feat} Feat */

/**
 * The one-line summaries under each row of the Library rail. Each function is
 * pure and reads one merged entry.
 */

/** The words a spell row uses for an effect kind. An attack and a save name
 * the roll, and the other kinds use the label of the spell form. */
const KIND_WORDS = { attack: 'Attack roll', save: 'Saving throw' };

/** Build the one-line summary for a spell in the library row.
 * It shows the level, the school, the effect kind, and a concentration marker
 * if the spell needs concentration.
 * @param {Spell} spell
 * @returns {string} */
export function spellSummary(spell) {
  const level = spellLevelName(spell.level);
  return [
    `${level} ${capitalize(spell.school)}`,
    KIND_WORDS[/** @type {keyof typeof KIND_WORDS} */ (spell.effect.kind)] ??
      SPELL_KINDS[spell.effect.kind]?.label ??
      spell.effect.kind,
    spell.concentration ? 'Concentration' : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

/** Build the one-line summary for a feat in the library row: one phrase per
 * effect, or "No automatic effect" for a feat the engine cannot apply, plus
 * the prerequisite text.
 * @param {Feat} feat
 * @returns {string} */
export function featSummary(feat) {
  const parts = feat.effects.map((effect) => {
    if (effect.kind === 'asi') {
      return `+1 ${effect.abilities.length > 0 ? effect.abilities.join('/') : 'any'}`;
    }
    if (effect.kind === 'rider') return `${riderText(effect.rider)} rider`;
    if (effect.kind === 'concentrationAdvantage') return 'advantage on concentration saves';
    if (effect.kind === 'hitDieFloor') return 'hit die minimum';
    if (effect.kind === 'hp') return `+${effect.perLevel} HP per level`;
    if (effect.kind === 'initiative') return `+${effect.bonus} initiative`;
    return [
      effect.skills ? `${countNoun(effect.skills.choose, 'skill')}` : '',
      effect.saves ? `${countNoun(effect.saves.choose, 'save')}` : '',
      effect.expertise ? 'expertise' : '',
      effect.armor ? `armor: ${effect.armor.join(', ')}` : '',
      effect.tools ? 'tools' : '',
      effect.languages ? 'languages' : '',
    ]
      .filter(Boolean)
      .join(', ');
  });
  if (parts.length === 0) parts.push('No automatic effect');
  if (feat.prerequisite) parts.push(`Requires ${feat.prerequisite}`);
  return parts.join(' | ');
}

/** The one-line summary for a creature row. A foe leads with its combat
 * numbers, and everyone else with who they are. A rated foe shows its
 * challenge rating first, because the encounter budget reads the rating,
 * and an unrated foe shows its tier and level instead. The tier reads
 * "Mob" or "Legend", the same words as the creature form.
 * @param {CreatureTemplate} entry
 * @returns {string} */
export function creatureSummary(entry) {
  if (entry.disposition === 'hostile') {
    const cr = entry.cr != null ? crLabel(entry.cr) : '';
    const tier = entry.tier === 'legend' ? 'Legend' : 'Mob';
    const rank = cr ? `CR ${cr}, ` : entry.level != null ? `${tier}, level ${entry.level}, ` : '';
    return [
      `${rank}${entry.maxHP} HP`,
      ...(entry.weapons ?? []).map((w) => `${w.name} ${formatDamage(w.damage)}`),
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return [entry.role, entry.disposition].filter(Boolean).join(' | ');
}

/** Build the one-line summary for an equipment entry in the library row.
 * It shows the item's effects, or its description when it has none, and
 * then its price when the entry has one.
 * @param {import('../types/library.js').EquipmentTemplate} entry
 * @returns {string} */
export function equipmentSummary(entry) {
  const effects =
    itemSummary(/** @type {import('../types/entities.js').InventoryItem} */ (entry)) ||
    entry.description ||
    '';
  return [effects, entry.cost ? formatCost(entry.cost) : ''].filter(Boolean).join(' | ');
}
