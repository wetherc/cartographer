import { promptModal } from './Modal.js';
import { getClass } from '../entities/Classes.js';
import { getClasses } from '../entities/Multiclass.js';
import {
  OTHER_SUBCLASS,
  canChooseSubclass,
  subclassChoices,
  subclassName,
  subclassNotice,
  withSubclass,
} from '../entities/Subclass.js';
import { textButton } from './buttons.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The subclass dialog of the character sheet. It offers the class's catalog
 * subclasses and a typed name for any other. The rules live in
 * entities/Subclass.js. This file is DOM wiring over them, verified
 * visually.
 */

/**
 * Ask which subclass one of the character's classes takes. The result is
 * the name to pass to `withSubclass` (an empty string clears the subclass),
 * or null when the dialog is cancelled or "Other" is submitted blank.
 * @param {Character} character
 * @param {string} classId
 * @returns {Promise<string | null>}
 */
export async function pickSubclass(character, classId) {
  const def = getClass(classId);
  const current = getClasses(character).find((r) => r.classId === classId)?.subclass;
  const label = def?.subclassLabel ?? 'Subclass';
  const options = subclassChoices(classId, current);
  const values = await promptModal(
    `${def?.name ?? classId} ${label.toLowerCase()}`,
    [
      {
        name: 'choice',
        label,
        type: 'select',
        options,
        value: current ? subclassName(classId, current) : options[0].value,
      },
      { name: 'custom', label: 'Name', type: 'text', hidden: true, placeholder: 'Subclass name' },
    ],
    {
      submitLabel: 'Choose',
      onChange: (name, form) => {
        if (name === 'choice') form.setHidden('custom', form.get('choice') !== OTHER_SUBCLASS);
      },
    },
  );
  if (!values) return null;
  if (values.choice !== OTHER_SUBCLASS) return values.choice;
  const typed = values.custom.trim();
  return typed || null;
}

/**
 * The sheet's subclass buttons: one "Choose" or "Change" button per class
 * the character holds at or above its subclass level. Each opens the
 * subclass dialog and commits the change to the character read after the
 * dialog closes. The caller shows these only where the base character is
 * editable, so a player tab never changes a subclass.
 * @param {() => Character} getCharacter
 * @param {{ onCommit: (character: Character) => void, notify: (message: string) => void }} opts
 * @returns {HTMLElement[]}
 */
export function subclassButtons(getCharacter, opts) {
  const character = getCharacter();
  const classes = getClasses(character);
  /** @param {string} classId */
  async function run(classId) {
    const name = await pickSubclass(getCharacter(), classId);
    if (name === null) return;
    const live = getCharacter();
    const next = withSubclass(live, classId, name);
    if (next === live) return;
    opts.notify(subclassNotice(next, classId));
    opts.onCommit(next);
  }
  return classes
    .filter((ref) => canChooseSubclass(character, ref.classId))
    .map((ref) => {
      const def = getClass(ref.classId);
      const label = (def?.subclassLabel ?? 'Subclass').toLowerCase();
      const verb = ref.subclass ? 'Change' : 'Choose';
      const text =
        classes.length > 1 ? `${verb} ${def?.name ?? ref.classId} ${label}` : `${verb} ${label}`;
      return textButton(text, () => run(ref.classId));
    });
}
