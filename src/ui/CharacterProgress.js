import { promptModal } from './Modal.js';
import { pickSubclass, subclassButtons } from './SubclassPicker.js';
import { subclassNotice, withSubclass } from '../entities/Subclass.js';
import { sectionLabel, textButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { getClass } from '../entities/Classes.js';
import { getClasses, pendingLevels, classLevelOf } from '../entities/Multiclass.js';
import {
  applyLevelChoices,
  assignLevel,
  assignOptions,
  className,
  asksForSubclass,
} from '../entities/LevelAssign.js';
import {
  ABILITY_MAX,
  pendingASISlots,
  listASIChoices,
  unlockedFeatures,
  featuresGained,
} from '../entities/LevelUp.js';
import { getProficiencies } from '../entities/Proficiencies.js';
import {
  applyASI,
  takeFeat,
  undoLastChoice,
  withExpertise,
  applyFeatureGrant,
  undoFeatureGrant,
} from '../entities/Progression.js';
import {
  featureKey,
  getFeatureChoices,
  pendingFeatureGrants,
  buildFeatureStamp,
} from '../entities/FeatureGrants.js';
import { getHitDicePools, hitDieOfPool, spendHitDie } from '../entities/HitDice.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { availableFeats, buildStamp } from '../entities/FeatChoices.js';
import { featOptions } from '../entities/FeatRequirement.js';
import { gatherEffectPicks } from './EffectPicks.js';
import { activeFeats } from '../library/Library.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { splitList } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../entities/FeatureGrants.js').FeatureStamp} FeatureStamp */

/**
 * This is the progression section of the character sheet. It shows the
 * class list, the pending-level assignment flow (a multiclass character's
 * XP levels wait here until spent), pending ability-score improvements
 * (apply an increase, take a feat, undo the last choice), pending class
 * feature grants with their prompted picks, the GM's expertise grant, the
 * unlocked class features, and the hit-dice pools with their short-rest
 * spend. All rule logic lives in the entity modules LevelAssign, LevelUp,
 * FeatureGrants, HitDice, and Proficiencies. This file is DOM wiring over
 * them, verified visually.
 */

/**
 * After a character takes a new class, prompt for its multiclass skill
 * pick, if the class's reduced grant includes one. The prompt excludes
 * skills the character already holds. A cancel, or an empty pick list,
 * keeps the assignment without a skill.
 * @param {Character} character
 * @param {string} classId
 * @returns {Promise<string[]>} the picked skill ids
 */
async function pickMulticlassSkills(character, classId) {
  const choice = getClass(classId)?.multiclassGrant.skillChoice;
  if (!choice) return [];
  const p = getProficiencies(character);
  const pool = choice.from.length > 0 ? choice.from : SKILL_IDS;
  const from = pool.filter((id) => !p.skills.includes(id));
  if (from.length === 0) return [];
  const values = await promptModal(
    `${className(classId)} skill`,
    [
      {
        name: 'skills',
        label: `Choose ${choice.choose}`,
        type: 'multiselect',
        options: from.map((id) => ({ value: id, label: skillName(id) })),
        max: choice.choose,
        value: '',
      },
    ],
    { submitLabel: 'Choose' },
  );
  return values ? splitList(values.skills).slice(0, choice.choose) : [];
}

/**
 * Prompt for a pending feature grant's picks and return the stamp that
 * claims it. A cancel in any dialog returns null, so the grant stays pending
 * and the sheet's pending row offers it again. The caller applies the stamp
 * to the character read after the last dialog closes, because the character
 * can change while a dialog is open: a heal lands, or a player tab spends a
 * slot.
 * @param {Character} character
 * @param {import('../entities/FeatureGrants.js').PendingFeature} grant
 * @returns {Promise<FeatureStamp | null>}
 */
async function askFeatureStamp(character, grant) {
  const title = `${grant.name} (${className(grant.classId)} ${grant.classLevel})`;
  const picks = await gatherEffectPicks(title, grant.effects, character);
  return picks ? buildFeatureStamp(grant, picks) : null;
}

/**
 * The picks a claimed feature grant recorded, as one display line. Only
 * what the grant actually added shows, so a pick the character already
 * had from the GM or a feat does not repeat here.
 * @param {import('../types/entities.js').FeatureChoice | undefined} choice
 * @returns {string}
 */
function grantPicksText(choice) {
  if (!choice?.granted) return '';
  const g = choice.granted;
  const parts = [
    ...(g.skills ?? []).map(skillName),
    ...(g.saves ?? []),
    ...(g.expertise ?? []).map(skillName),
    ...(g.armor ?? []),
    ...(g.tools ?? []),
    ...(g.languages ?? []),
  ];
  return [...new Set(parts)].join(', ');
}

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

  async function runAssign() {
    const options = assignOptions(getCharacter());
    const first = options.find((option) => !option.disabled);
    if (!first) {
      opts.notify('No class assignment is available.');
      return;
    }
    const values = await promptModal(
      'Assign a level',
      [{ name: 'class', label: 'Class', type: 'select', options, value: first.value }],
      { submitLabel: 'Assign' },
    );
    if (!values) return;
    const classId = values.class;
    // The picks gather against a preview of the level. The dialogs stay open
    // long enough for the sheet's HP or slots to change underneath them, so
    // the level and its picks apply again to the character read after the
    // last dialog closes.
    const from = getCharacter();
    let preview = assignLevel(from, classId);
    if (preview === from) return;
    const skills =
      classLevelOf(from, classId) === 0 ? await pickMulticlassSkills(preview, classId) : [];
    preview = applyLevelChoices(from, { classId, skills, stamps: [] });
    // Reaching the subclass level asks for one. A cancelled pick still takes
    // the level, and the sheet's Choose button asks again later.
    const subclass = asksForSubclass(preview, classId)
      ? ((await pickSubclass(preview, classId)) ?? undefined)
      : undefined;
    if (subclass) preview = withSubclass(preview, classId, subclass);
    const gained = featuresGained(preview, from);
    /** @type {FeatureStamp[]} */
    const stamps = [];
    for (const feature of gained) {
      if (!feature.effects) continue;
      const stamp = await askFeatureStamp(preview, {
        classId: feature.classId,
        classLevel: feature.level,
        name: feature.name,
        effects: feature.effects,
      });
      if (!stamp) continue;
      stamps.push(stamp);
      // A later grant's picks exclude what an earlier one already gave.
      preview = applyFeatureGrant(preview, stamp);
    }
    const live = getCharacter();
    const next = applyLevelChoices(live, { classId, skills, stamps, subclass });
    if (next === live) {
      opts.notify('That level can no longer be assigned.');
      return;
    }
    const gainedText = gained.length > 0 ? ` New: ${gained.map((f) => f.name).join(', ')}.` : '';
    const subclassText = subclass ? ` ${subclassNotice(next, classId)}` : '';
    opts.notify(
      `${live.name} takes ${className(classId)} ${classLevelOf(next, classId)}.${gainedText}${subclassText}`,
    );
    opts.onCommit(next);
  }

  const pending = pendingLevels(character);
  const assignable = assignOptions(character).some((option) => !option.disabled);
  if (pending > 0 || (opts.editBase && assignable)) {
    const row = addRow();
    if (pending > 0) {
      addText(row, `${pending} level${pending === 1 ? '' : 's'} to assign`);
    }
    if (opts.editBase) {
      row.appendChild(textButton(pending > 0 ? 'Assign level' : 'Add a class', runAssign));
    }
  }

  async function runASI() {
    const abilityOptions = ABILITY_SCORES.map((key) => ({ value: key, label: key }));
    const values = await promptModal(
      'Ability score improvement',
      [
        { name: 'first', label: '+1 to', type: 'select', options: abilityOptions },
        {
          name: 'second',
          label: 'and +1 to (the same ability for +2)',
          type: 'select',
          options: abilityOptions,
        },
      ],
      { submitLabel: 'Apply' },
    );
    if (!values) return;
    /** @type {Record<string, number>} */
    const increases = {};
    increases[values.first] = 1;
    increases[values.second] = (increases[values.second] ?? 0) + 1;
    const from = getCharacter();
    const next = applyASI(from, increases);
    if (next === from) {
      opts.notify('That improvement is not valid: ability scores cap at 20.');
      return;
    }
    opts.onCommit(next);
  }

  /**
   * Gather the picks a catalog feat needs through the shared pick engine,
   * and take it. A cancel anywhere abandons the take.
   * @param {import('../types/feat.js').Feat} feat
   */
  async function takeCatalogFeat(feat) {
    const picks = await gatherEffectPicks(feat.name, feat.effects, getCharacter());
    if (!picks) return;

    const from = getCharacter();
    // Two +1 effects can land on the same score, and a score one point under
    // the cap holds only one of them. The take would refuse as a whole, so
    // this names the score before the generic refusal below can hide it.
    /** @type {Record<string, number>} */
    const stacked = {};
    for (const key of picks.abilities) stacked[key] = (stacked[key] ?? 0) + 1;
    for (const [key, value] of Object.entries(stacked)) {
      if ((from.stats?.[key] ?? 10) + value > ABILITY_MAX) {
        opts.notify(`${feat.name} would raise ${key} above ${ABILITY_MAX}.`);
        return;
      }
    }
    const next = takeFeat(from, buildStamp(feat, picks));
    if (next === from) {
      opts.notify('That feat could not be taken.');
      return;
    }
    opts.notify(`${from.name} takes ${feat.name}.`);
    opts.onCommit(next);
  }

  async function runFeat() {
    const catalog = availableFeats(getCharacter(), activeFeats());
    const options = featOptions(getCharacter(), catalog);
    const values = await promptModal(
      'Take a feat',
      [
        {
          name: 'feat',
          label: 'Feat',
          type: 'select',
          options: [...options, { value: '', label: 'Custom (name only)' }],
          value: options.find((o) => !o.disabled)?.value ?? '',
        },
      ],
      { submitLabel: 'Take feat' },
    );
    if (!values) return;
    const feat = catalog.find((f) => f.id === values.feat);
    if (feat) {
      await takeCatalogFeat(feat);
      return;
    }
    const named = await promptModal(
      'Take a feat',
      [{ name: 'feat', label: 'Feat name', type: 'text', value: '' }],
      { submitLabel: 'Take feat' },
    );
    if (!named) return;
    const from = getCharacter();
    const next = takeFeat(from, named.feat);
    if (next !== from) opts.onCommit(next);
  }

  const slots = pendingASISlots(character);
  if (slots.length > 0) {
    const row = addRow();
    const [first] = slots;
    const where = `${className(first.classId)} ${first.classLevel}`;
    addText(row, `${slots.length} improvement${slots.length === 1 ? '' : 's'} pending (${where})`);
    if (opts.editBase) {
      row.append(textButton('+2 ability', runASI), textButton('Take feat', runFeat));
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
      row.appendChild(
        textButton('Choose', runFeatureGrants, {
          ariaLabel: 'Choose the pending class feature grants',
        }),
      );
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
        textButton('Undo', () => opts.onCommit(undoLastChoice(getCharacter())), {
          ariaLabel: 'Undo the last improvement choice',
        }),
      );
    }
  }

  // Expertise doubles a skill proficiency. The Bard and Rogue features grant
  // it through the pending-grant flow above. This row is the GM's hand grant
  // for subclasses and homebrew, with no maximum. Only proficient skills are
  // offered, which is the one rule the normalizer enforces anyway.
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
    addText(
      row,
      expertise.length > 0
        ? `Expertise: ${expertise.map(skillName).join(', ')}`
        : 'No expertise chosen',
    );
    row.appendChild(
      textButton('Set expertise', runExpertise, {
        ariaLabel: 'Choose which skills have expertise',
      }),
    );
  }

  async function rechooseFeature(/** @type {string} */ key) {
    const from = getCharacter();
    const undone = undoFeatureGrant(from, key);
    if (undone === from) return;
    const grant = pendingFeatureGrants(undone).find((g) => featureKey(g) === key);
    const stamp = grant ? await askFeatureStamp(undone, grant) : null;
    // Undo and claim again on the character read after the dialog closes.
    const live = getCharacter();
    const liveUndone = undoFeatureGrant(live, key);
    const next = stamp ? applyFeatureGrant(liveUndone, stamp) : liveUndone;
    if (next !== live) opts.onCommit(next);
  }

  const features = unlockedFeatures(character);
  if (features.length > 0) {
    const claimed = getFeatureChoices(character);
    section.appendChild(
      el(
        'details',
        'character-sheet__features u-muted',
        el('summary', '', `Class features (${features.length})`),
        el(
          'ul',
          'u-col u-g1',
          ...features.map((feature) => {
            const li = el(
              'li',
              '',
              `${feature.name} — ${className(feature.classId)} ${feature.level}`,
            );
            const key = featureKey({
              classId: feature.classId,
              classLevel: feature.level,
              name: feature.name,
            });
            const choice = claimed[key];
            const picked = grantPicksText(choice);
            if (picked) li.append(`: ${picked}`);
            if (choice && opts.editBase) {
              li.append(' ');
              li.appendChild(
                textButton('Change', () => rechooseFeature(key), {
                  ariaLabel: `Choose the ${feature.name} grants again`,
                }),
              );
            }
            return li;
          }),
        ),
      ),
    );
  }

  for (const pool of hitDice) {
    const row = addRow();
    addText(row, `${pool.name} ${pool.current}/${pool.max}`);
    if (opts.play && pool.current > 0) {
      row.appendChild(
        textButton(
          'Spend',
          () => {
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
