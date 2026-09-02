import { formatDamage } from '../entities/Equipment.js';
import { riderText } from '../entities/Riders.js';

/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/feat.js').Feat} Feat */

/**
 * The one-line summaries under each row of the Library rail. Each function is
 * pure and reads one merged entry.
 */

/** Build the one-line summary for a spell in the library row.
 * It shows the level, the school, the effect kind, and a concentration marker
 * if the spell needs concentration.
 * @param {Spell} spell
 * @returns {string} */
export function spellSummary(spell) {
  const level = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  return [`${level} ${spell.school}`, spell.effect.kind, spell.concentration ? 'concentration' : '']
    .filter(Boolean)
    .join(' | ');
}

/** Build the one-line summary for a feat in the library row: one phrase per
 * effect, or "text only" for a feat the engine cannot apply, plus a
 * prerequisite marker.
 * @param {Feat} feat
 * @returns {string} */
export function featSummary(feat) {
  const parts = feat.effects.map((effect) => {
    if (effect.kind === 'asi') {
      return `+1 ${effect.abilities.length > 0 ? effect.abilities.join('/') : 'any'}`;
    }
    if (effect.kind === 'rider') return `${riderText(effect.rider)} rider`;
    return [
      effect.skills ? `${effect.skills.choose} skill${effect.skills.choose > 1 ? 's' : ''}` : '',
      effect.saves ? `${effect.saves.choose} save${effect.saves.choose > 1 ? 's' : ''}` : '',
      effect.expertise ? 'expertise' : '',
      effect.armor ? `armor: ${effect.armor.join(', ')}` : '',
      effect.tools ? 'tools' : '',
      effect.languages ? 'languages' : '',
    ]
      .filter(Boolean)
      .join(', ');
  });
  if (parts.length === 0) parts.push('text only');
  if (feat.prerequisite) parts.push('prerequisite');
  return parts.join(' | ');
}

/** The one-line summary for a creature row. A foe leads with its combat
 * numbers, and everyone else with who they are.
 * @param {CreatureTemplate} entry
 * @returns {string} */
export function creatureSummary(entry) {
  if (entry.disposition === 'hostile') {
    return [
      entry.level != null
        ? `${entry.maxHP} HP, level ${entry.level} ${entry.tier}`
        : `${entry.maxHP} HP`,
      entry.weapon ? `${entry.weapon.name} ${formatDamage(entry.weapon.damage)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return [entry.role, entry.disposition].filter(Boolean).join(' | ');
}
