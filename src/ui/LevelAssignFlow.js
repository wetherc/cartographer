import { promptModal } from './Modal.js';
import { pickSubclass } from './SubclassPicker.js';
import { gatherEffectPicks } from './EffectPicks.js';
import { subclassNotice, withSubclass } from '../entities/Subclass.js';
import { getClass } from '../entities/Classes.js';
import { classLevelOf } from '../entities/Multiclass.js';
import {
  applyLevelChoices,
  assignLevel,
  assignOptions,
  className,
  asksForSubclass,
} from '../entities/LevelAssign.js';
import { featuresGained } from '../entities/LevelUp.js';
import { getProficiencies } from '../entities/Proficiencies.js';
import { applyFeatureGrant } from '../entities/Progression.js';
import { buildFeatureStamp } from '../entities/FeatureGrants.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { splitList } from '../util/text.js';
import { askWarlockPicks } from './InvocationLevelFlow.js';
import { applyWarlockPicks } from '../entities/InvocationLevelUp.js';

/**
 * The dialogs of assigning a level from the progression section of the
 * character sheet (see `CharacterProgress.js`): the class pick, the
 * multiclass skill pick, the subclass pick, and the picks of each class
 * feature the level unlocks. `LevelAssign` and `Progression` keep the rules.
 * This file is DOM wiring over them, verified visually.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../entities/FeatureGrants.js').FeatureStamp} FeatureStamp */

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
export async function askFeatureStamp(character, grant) {
  const title = `${grant.name} (${className(grant.classId)} ${grant.classLevel})`;
  const picks = await gatherEffectPicks(title, grant.effects, character);
  return picks ? buildFeatureStamp(grant, picks) : null;
}

/**
 * Ask which class takes the next level, gather the picks of that level, and
 * commit the level to the character read after the last dialog closes.
 * @param {() => Character} getCharacter
 * @param {{ onCommit: (character: Character) => void, notify: (message: string) => void }} opts
 */
export async function assignLevelFlow(getCharacter, opts) {
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
  // A warlock level asks for the pact boon and the new invocations it allows,
  // and offers one swap of a known invocation.
  const warlock = classId === 'warlock' ? await askWarlockPicks(preview, { swap: true }) : null;
  const live = getCharacter();
  const leveled = applyLevelChoices(live, { classId, skills, stamps, subclass });
  if (leveled === live) {
    opts.notify('That level can no longer be assigned.');
    return;
  }
  const next = warlock ? applyWarlockPicks(leveled, warlock) : leveled;
  const gainedText = gained.length > 0 ? ` New: ${gained.map((f) => f.name).join(', ')}.` : '';
  const subclassText = subclass ? ` ${subclassNotice(next, classId)}` : '';
  opts.notify(
    `${live.name} takes ${className(classId)} ${classLevelOf(next, classId)}.${gainedText}${subclassText}`,
  );
  opts.onCommit(next);
}
