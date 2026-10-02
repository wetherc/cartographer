import { confirmModal, promptModal } from './Modal.js';
import { subclassButtons } from './SubclassPicker.js';
import { sectionLabel, textButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { getClasses, pendingLevels } from '../entities/Multiclass.js';
import { assignOptions, className } from '../entities/LevelAssign.js';
import { pendingASISlots, listASIChoices } from '../entities/LevelUp.js';
import { getProficiencies } from '../entities/Proficiencies.js';
import { undoLastChoice, withExpertise, applyFeatureGrant } from '../entities/Progression.js';
import { pendingFeatureGrants } from '../entities/FeatureGrants.js';
import { getHitDicePools, hitDieOfPool, spendHitDie } from '../entities/HitDice.js';
import { hasExpertiseSource } from '../entities/ExpertiseSources.js';
import { buildInvocationRows } from './InvocationPicker.js';
import { askFeatureStamp, assignLevelFlow } from './LevelAssignFlow.js';
import { chooseASI, chooseFeat } from './ImprovementFlow.js';
import { skillName } from '../data/skills.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../entities/FeatureGrants.js').FeatureStamp} FeatureStamp */

/**
 * This is the progression section of the character sheet. It shows the
 * class list, the pending-level assignment flow (a multiclass character's
 * XP levels wait here until spent), pending ability-score improvements
 * (apply an increase, take a feat, undo the last choice), pending class
 * feature grants with their prompted picks, the warlock's pact boon and
 * invocations (see InvocationPicker.js), the GM's expertise grant, and the
 * hit-dice pools with their short-rest spend. The unlocked class features
 * have their own section (CharacterFeatures.js). The level dialogs live in
 * LevelAssignFlow.js and the improvement
 * dialogs in ImprovementFlow.js. All rule logic lives in the entity modules LevelAssign, LevelUp,
 * FeatureGrants, HitDice, and Proficiencies. This file is DOM wiring over
 * them, verified visually.
 */

/**
 * Build the progression section. Return null when the character has
 * nothing progression-shaped, for example a classless character with no
 * hit-dice pools.
 *
 * The section lays out from the character as it is at build time, but
 * every action reads getCharacter() again when it fires. The sheet keeps
 * this DOM across changes it can write in place. If a hit-die spend heals
 * against a build-time snapshot, it undoes whatever the HP bar has
 * done since.
 * @param {() => Character} getCharacter
 * @param {{
 *   editBase: boolean,
 *   play: boolean,
 *   onCommit: (character: Character) => void,
 *   notify: (message: string) => void,
 * }} opts editBase gates the level, ASI, and feat choices, since they
 *   change the base character. play gates the hit-die spend. notify shows
 *   roll results and dead-end explanations as toasts.
 * @returns {HTMLElement | null}
 */
export function buildProgressSection(getCharacter, opts) {
  const character = getCharacter();
  const classes = getClasses(character);
  const hitDice = getHitDicePools(character);
  if (classes.length === 0 && hitDice.length === 0) return null;

  const section = el('div', 'character-sheet__progress u-col u-g2', sectionLabel('Progression'));

  /** @param {string} [cls] @returns {HTMLElement} */
  const addRow = (cls) =>
    section.appendChild(
      el('div', classNames(['character-sheet__progress-row u-row u-g2 u-muted', cls])),
    );
  /** @param {HTMLElement} row @param {string} text */
  const addText = (row, text) => {
    row.appendChild(el('span', 'character-sheet__progress-text', text));
  };

  if (classes.length > 0) {
    const line = classes
      .map((ref) => {
        const subclass = ref.subclass ? ` (${ref.subclass})` : '';
        return `${className(ref.classId)} ${ref.level}${subclass}`;
      })
      .join(' / ');
    addText(addRow('character-sheet__classes'), line);
  }

  const subclassRow = opts.editBase ? subclassButtons(getCharacter, opts) : [];
  if (subclassRow.length > 0) addRow().append(...subclassRow);

  const pending = pendingLevels(character);
  const assignable = assignOptions(character).some((option) => !option.disabled);
  if (pending > 0 || (opts.editBase && assignable)) {
    const row = addRow();
    if (pending > 0) {
      addText(row, `${pending} level${pending === 1 ? '' : 's'} to assign`);
    }
    if (opts.editBase) {
      row.appendChild(
        textButton(pending > 0 ? 'Assign level' : 'Add a class', () =>
          assignLevelFlow(getCharacter, opts),
        ),
      );
    }
  }

  const slots = pendingASISlots(character);
  if (slots.length > 0) {
    const row = addRow();
    const [first] = slots;
    const where = `${className(first.classId)} ${first.classLevel}`;
    addText(row, `${slots.length} improvement${slots.length === 1 ? '' : 's'} pending (${where})`);
    if (opts.editBase) {
      const asi = textButton('+2 ability', () => chooseASI(getCharacter, opts));
      // The level-up banner focuses the first button marked pending.
      asi.dataset.pending = '';
      row.append(
        asi,
        textButton('Take feat', () => chooseFeat(getCharacter, opts)),
      );
    }
  }

  async function runFeatureGrants() {
    let preview = getCharacter();
    /** @type {FeatureStamp[]} */
    const stamps = [];
    for (const grant of pendingFeatureGrants(preview)) {
      const stamp = await askFeatureStamp(preview, grant);
      if (!stamp) continue;
      stamps.push(stamp);
      preview = applyFeatureGrant(preview, stamp);
    }
    const live = getCharacter();
    const next = stamps.reduce(applyFeatureGrant, live);
    if (next !== live) opts.onCommit(next);
  }

  const grants = pendingFeatureGrants(character);
  if (grants.length > 0) {
    const row = addRow();
    const [first] = grants;
    const where = `${first.name}, ${className(first.classId)} ${first.classLevel}`;
    addText(
      row,
      `${grants.length} feature choice${grants.length === 1 ? '' : 's'} pending (${where})`,
    );
    if (opts.editBase) {
      const choose = textButton('Choose', runFeatureGrants, {
        ariaLabel: 'Choose the pending class feature grants',
      });
      choose.dataset.pending = '';
      row.appendChild(choose);
    }
  }

  const choices = listASIChoices(character);
  if (choices.length > 0) {
    const row = addRow();
    const line = choices
      .map((choice) => {
        const at = `${className(choice.classId)} ${choice.classLevel}`;
        const parts = Object.entries(choice.increases ?? {})
          .filter(([, v]) => v !== 0)
          .map(([key, v]) => `+${v} ${key}`)
          .join(', ');
        if (choice.type === 'feat') return `${at}: ${choice.feat}${parts ? ` (${parts})` : ''}`;
        return `${at}: ${parts}`;
      })
      .join(' · ');
    addText(row, line);
    if (opts.editBase) {
      row.appendChild(
        textButton('Revert last choice', () => opts.onCommit(undoLastChoice(getCharacter())), {
          ariaLabel: 'Revert the last improvement choice',
        }),
      );
    }
  }

  section.append(...buildInvocationRows(getCharacter, opts));

  // Expertise doubles a skill proficiency. The Bard and Rogue features grant
  // it through the pending-grant flow above. This row is the GM's hand grant
  // for subclasses and homebrew, with no maximum. Only proficient skills are
  // offered, which is the one rule the normalizer enforces anyway. The
  // button shows for any character with a skill proficiency. The status text
  // shows only for a character with a source of expertise (see
  // ExpertiseSources.js), so a Fighter does not read "No expertise chosen".
  async function runExpertise() {
    const p = getProficiencies(getCharacter());
    const values = await promptModal(
      'Expertise',
      [
        {
          name: 'skills',
          label: 'Skills with a doubled proficiency',
          type: 'multiselect',
          options: p.skills.map((id) => ({ value: id, label: skillName(id) })),
          value: p.expertise.join(','),
        },
      ],
      { submitLabel: 'Set expertise' },
    );
    if (!values) return;
    opts.onCommit(withExpertise(getCharacter(), splitList(values.skills)));
  }

  const { skills, expertise } = getProficiencies(character);
  if (opts.editBase && skills.length > 0) {
    const row = addRow();
    if (hasExpertiseSource(character)) {
      addText(
        row,
        expertise.length > 0
          ? `Expertise: ${expertise.map(skillName).join(', ')}`
          : 'No expertise chosen',
      );
    }
    row.appendChild(
      textButton('Set expertise', runExpertise, {
        ariaLabel: 'Choose which skills have expertise',
      }),
    );
  }

  for (const pool of hitDice) {
    const row = addRow();
    addText(row, `${pool.name} ${pool.current}/${pool.max}`);
    if (opts.play && pool.current > 0) {
      row.appendChild(
        textButton(
          'Spend',
          async () => {
            // Hit dice heal during a short rest, and the Short rest dialog
            // spends them. A spend from the sheet asks first, so a click in
            // the middle of a fight does not heal by mistake.
            const ok = await confirmModal(
              'Hit dice heal during a short rest, and the Short rest button of the ' +
                'Time panel spends them. Spend one now anyway?',
              { title: 'Spend a hit die', confirmLabel: 'Spend' },
            );
            if (!ok) return;
            const from = getCharacter();
            const result = spendHitDie(from, hitDieOfPool(pool));
            if (result.character === from) return;
            opts.notify(
              `${from.name} spends a hit die: rolled ${result.rolled}, ` +
                `healed ${result.healed} HP.`,
            );
            opts.onCommit(result.character);
          },
          { ariaLabel: `Spend one ${pool.name} for healing` },
        ),
      );
    }
  }

  return section;
}
