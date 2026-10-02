import { promptModal } from './Modal.js';
import { gatherEffectPicks } from './EffectPicks.js';
import { ABILITY_MAX } from '../entities/LevelUp.js';
import { applyASI, takeFeat } from '../entities/Progression.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { availableFeats, buildStamp } from '../entities/FeatChoices.js';
import { featOptions } from '../entities/FeatRequirement.js';
import { activeFeats } from '../library/Library.js';

/**
 * The dialogs of a pending ability score improvement on the progression
 * section of the character sheet (see `CharacterProgress.js`): a +2 split
 * over the ability scores, or a feat from the catalog or by name.
 * `Progression` keeps the rules. This file is DOM wiring over it, verified
 * visually.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {{ onCommit: (character: Character) => void, notify: (message: string) => void }} ProgressOpts */

/**
 * Ask for the two +1 increases of an improvement and apply them.
 * @param {() => Character} getCharacter
 * @param {ProgressOpts} opts
 */
export async function chooseASI(getCharacter, opts) {
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
 * @param {() => Character} getCharacter
 * @param {ProgressOpts} opts
 * @param {import('../types/feat.js').Feat} feat
 */
async function takeCatalogFeat(getCharacter, opts, feat) {
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

/**
 * Ask for a feat, from the catalog or by name alone, and take it.
 * @param {() => Character} getCharacter
 * @param {ProgressOpts} opts
 */
export async function chooseFeat(getCharacter, opts) {
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
    await takeCatalogFeat(getCharacter, opts, feat);
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
