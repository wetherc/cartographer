/**
 * The saving-throw and skill blocks on the character sheet. Each block is a
 * list of rows, one per save or skill, showing how trained the character is,
 * what the roll adds, and, when the host wires a handler, a click that rolls
 * it. The skill block also states passive Perception, the score a GM reads
 * when nobody says they are looking.
 *
 * The row values come from `entities/Checks.js`. This module holds no rule of
 * its own. `saveRows` and `skillRows` are exported apart from the builders,
 * because they are pure and can be read without a document.
 */

import { checkBonus, saveBonus, passivePerception } from '../entities/Checks.js';
import { stealthPenalty } from '../entities/Armor.js';
import { formatModifier, ABILITY_SCORES } from '../entities/Modifiers.js';
import { isProficientSave, isProficientSkill, hasExpertise } from '../entities/Proficiencies.js';
import { SKILL_ABILITIES, SKILL_IDS, skillDescription, skillName } from '../data/skills.js';
import { abilityDescription, abilityName } from '../data/abilities.js';
import { bareButton, sectionLabel } from './buttons.js';
import { el } from './dom.js';
import { setTip } from './Tooltip.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * One row of a block. `kind` is what rolling the row resolves, which is what
 * the host needs to route the roll. `key` is the ability for a save and the
 * skill id for a skill. `ability` is the ability the roll adds, which for a
 * save is the key again. `description` is the reference line the row's tooltip
 * adds under the numbers: what the ability covers for a save, and what the
 * skill is rolled for for a skill.
 * @typedef {{
 *   kind: 'save' | 'check',
 *   key: string,
 *   name: string,
 *   ability: string,
 *   bonus: number,
 *   proficient: boolean,
 *   expert: boolean,
 *   description: string,
 *   slant?: string,
 * }} CheckRow
 *
 * `slant` is why the row rolls at disadvantage before any condition chip, for
 * example noisy armor on Stealth. It is absent on a straight row. The chips
 * are left out of it, because they change between the sheet drawing and the
 * roll, and `app/checkRolls.js` reads them at the moment of the throw.
 */

/**
 * The host's roll handler. It gets the kind of roll and the key that names
 * it, which is everything `entities/Checks.js` needs to resolve one.
 * @typedef {(event: { kind: 'save' | 'check', key: string }) => void} CheckHandler
 */

/**
 * What a block builder accepts. Leaving `onCheck` out builds a block that
 * reports the numbers and rolls nothing, which is a spectator's sheet.
 * @typedef {{ onCheck?: CheckHandler }} ChecksOptions
 */

/**
 * How trained a row is, as one word. Expertise implies proficiency, so the
 * wider grant wins.
 * @param {CheckRow} row
 * @returns {'expert' | 'proficient' | 'untrained'}
 */
export function training(row) {
  if (row.expert) return 'expert';
  return row.proficient ? 'proficient' : 'untrained';
}

/** How each training state reads in a sentence. */
const TRAINING_TEXT = {
  expert: 'expertise',
  proficient: 'proficient',
  untrained: 'not proficient',
};

/**
 * A row per saving throw, in the conventional ability order. Every character
 * has all six, whether or not the class grants any of them, because a GM can
 * call for any save.
 * @param {Character} character
 * @returns {CheckRow[]}
 */
export function saveRows(character) {
  return ABILITY_SCORES.map((ability) => ({
    kind: 'save',
    key: ability,
    name: ability,
    ability,
    bonus: saveBonus(character, ability),
    proficient: isProficientSave(character, ability),
    // Expertise doubles a skill proficiency. No save carries it.
    expert: false,
    // A save row shows the bare key, so the tooltip leads with the word.
    description: `${abilityName(ability)}. ${abilityDescription(ability)}`,
  }));
}

/**
 * A row per plain ability check, such as a STR check with no skill. No
 * proficiency applies to one, so the bonus is the modifier and any
 * exhaustion penalty.
 * @param {Character} character
 * @returns {CheckRow[]}
 */
export function abilityRows(character) {
  return ABILITY_SCORES.map((ability) => ({
    kind: 'check',
    key: ability,
    name: ability,
    ability,
    bonus: checkBonus(character, ability),
    proficient: false,
    expert: false,
    description: `${abilityName(ability)}. ${abilityDescription(ability)}`,
  }));
}

/**
 * A row per skill, in the skill table's display order. As with saves, an
 * untrained skill still gets a row, since anyone can attempt one.
 * @param {Character} character
 * @returns {CheckRow[]}
 */
export function skillRows(character) {
  const noisy = stealthPenalty(character);
  return SKILL_IDS.map((id) => ({
    kind: 'check',
    key: id,
    name: skillName(id),
    ability: SKILL_ABILITIES[id],
    bonus: checkBonus(character, id),
    proficient: isProficientSkill(character, id),
    expert: hasExpertise(character, id),
    description: skillDescription(id),
    ...(id === 'stealth' && noisy ? { slant: `wearing ${noisy}` } : {}),
  }));
}

/**
 * Build one row. With a handler, the row is a button that rolls the check.
 * Without one, it is a plain line that only reports the number.
 *
 * The training dot states its meaning by shape, hollow for untrained, solid
 * for proficient, and ringed for expertise, so the three read apart without
 * color. The word itself goes into the button's accessible name, or into a
 * screen-reader line on a plain row.
 * @param {CheckRow} row
 * @param {CheckHandler | null} onCheck
 * @returns {HTMLElement}
 */
function buildRow(row, onCheck) {
  const state = training(row);
  const dot = el('span', `check-row__dot check-row__dot--${state}`);
  dot.setAttribute('aria-hidden', 'true');
  const parts = [
    dot,
    el('span', 'check-row__name', row.name),
    row.ability !== row.name && el('span', 'check-row__ability u-muted', row.ability),
    // The marker is a word rather than an icon, so it reads the same to a
    // screen reader as it does on the page.
    row.slant && el('span', 'check-row__slant', 'dis'),
    el('span', 'check-row__bonus', formatModifier(row.bonus)),
  ];
  const slantText = row.slant ? `, disadvantage (${row.slant})` : '';
  const reading = `${row.name} ${formatModifier(row.bonus)}, ${TRAINING_TEXT[state]}${slantText}`;
  // The numbers first, then what the row is for. The tooltip keeps the break,
  // so the reference line reads as its own sentence under the reading.
  const detail = row.description ? `\n${row.description}` : '';
  if (!onCheck) {
    const line = el('div', 'check-row', ...parts, el('span', 'sr-only', TRAINING_TEXT[state]));
    setTip(line, `${reading}${detail}`);
    return line;
  }
  return bareButton(parts, () => onCheck({ kind: row.kind, key: row.key }), {
    className: 'check-row check-row--roll',
    ariaLabel: `Roll ${reading}`,
    title: `Roll ${reading}${detail}`,
  });
}

/**
 * Build a titled block of rows, with an optional line beneath them.
 * @param {string} title
 * @param {CheckRow[]} rows
 * @param {ChecksOptions} opts
 * @param {HTMLElement} [footer]
 * @returns {HTMLElement}
 */
function buildBlock(title, rows, opts, footer) {
  const list = el('div', 'check-block__rows');
  for (const row of rows) list.appendChild(buildRow(row, opts.onCheck ?? null));
  return el('div', 'check-block u-col u-g1', sectionLabel(title), list, footer);
}

/**
 * The saving-throw block: the six saves with their bonuses. `onCheck` is the
 * host's roll handler, and it receives the kind of roll and its key. Omit it
 * for a read-only sheet, for example a spectator's.
 * @param {Character} character
 * @param {ChecksOptions} [opts]
 * @returns {HTMLElement}
 */
export function buildSavesBlock(character, opts = {}) {
  return buildBlock('Saving Throws', saveRows(character), opts);
}

/**
 * The skill block: the 18 skills with their bonuses, over the character's
 * passive Perception. The passive score sits here rather than beside the
 * ability scores, because it is the Perception row read without a die.
 * @param {Character} character
 * @param {ChecksOptions} [opts]
 * @returns {HTMLElement}
 */
export function buildSkillsBlock(character, opts = {}) {
  const passive = el(
    'div',
    'check-block__passive u-muted',
    `Passive Perception ${passivePerception(character)}`,
  );
  // The key to the training dots of the saves above and the skills here.
  /** @param {string} modifier @param {string} text */
  const key = (modifier, text) =>
    el('span', 'u-row u-g1', el('span', `check-row__dot ${modifier}`), text);
  const legend = el(
    'div',
    'check-block__legend u-row u-g3 u-muted',
    key('check-row__dot--proficient', 'Proficient'),
    key('check-row__dot--expert', 'Expertise'),
  );
  const footer = el('div', 'u-col u-g1 check-block__footer', passive, legend);
  return buildBlock('Skills', skillRows(character), opts, footer);
}

/**
 * The quick rolls of the summary card: the six abilities across the top,
 * with a row of plain ability checks and a row of saving throws under them.
 * Each number is a button that rolls when the host wires `onCheck`. A save
 * the character is proficient in has the solid training dot.
 * @param {Character} character
 * @param {ChecksOptions} [opts]
 * @returns {HTMLElement}
 */
export function buildQuickRolls(character, opts = {}) {
  const onCheck = opts.onCheck ?? null;
  const grid = el('div', 'quick-rolls__grid');
  /** @param {string} text */
  const label = (text) => {
    const span = el('span', 'quick-rolls__label u-muted', text);
    span.setAttribute('aria-hidden', 'true');
    return span;
  };
  grid.append(el('span', 'quick-rolls__corner'), ...ABILITY_SCORES.map(label));
  /** @param {string} title @param {CheckRow[]} rows @param {string} noun */
  const addLine = (title, rows, noun) => {
    grid.appendChild(label(title));
    for (const row of rows) {
      const state = training(row);
      const dot = el('span', `check-row__dot check-row__dot--${state}`);
      dot.setAttribute('aria-hidden', 'true');
      const parts = [
        row.proficient ? dot : null,
        el('span', 'check-row__bonus', formatModifier(row.bonus)),
      ];
      const trained = row.proficient ? `, ${TRAINING_TEXT[state]}` : '';
      const reading = `${row.name} ${noun} ${formatModifier(row.bonus)}${trained}`;
      if (onCheck) {
        grid.appendChild(
          bareButton(parts, () => onCheck({ kind: row.kind, key: row.key }), {
            className: 'quick-rolls__cell quick-rolls__cell--roll',
            ariaLabel: `Roll ${reading}`,
            title: `Roll ${reading}`,
          }),
        );
      } else {
        const cell = el('span', 'quick-rolls__cell', ...parts, el('span', 'sr-only', reading));
        grid.appendChild(cell);
      }
    }
  };
  addLine('Check', abilityRows(character), 'check');
  addLine('Save', saveRows(character), 'saving throw');
  return el('div', 'quick-rolls u-col u-g1', sectionLabel('Checks and saves'), grid);
}
