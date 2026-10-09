/**
 * The image field of a form dialog. The browser's own file input shows
 * "Choose File / No file chosen" in a system style that matches neither
 * theme, so this field hides that input and shows a themed "Choose image"
 * button with the picked file's name beside it. The hidden input still does
 * the picking, and `readImageFile` decodes, downscales, and re-encodes the
 * pick under a size cap before it becomes the field's value.
 */

import { textButton } from './buttons.js';
import { el, uniqueId } from './dom.js';
import { readImageFile } from './imageField.js';

/** The name line before any pick, with no image stored. */
export const NO_IMAGE_TEXT = 'No image chosen';
/** The name line before any pick, when the field opens with a stored image. */
export const KEPT_IMAGE_TEXT = 'Current image kept';

/**
 * The text beside the button: the picked file's name, or a line that says
 * whether the field still has the image that it opened with.
 * @param {string} initial the field's starting value, a data: URL or ''
 * @param {string} [fileName] the name of the last good pick
 * @returns {string}
 */
export function pickedName(initial, fileName) {
  if (fileName) return fileName;
  return initial ? KEPT_IMAGE_TEXT : NO_IMAGE_TEXT;
}

/**
 * Build the field. `track` receives the decode of each pick, so the dialog
 * can wait for it before it collects the submitted record. `error` is the
 * inline line that reports a rejected pick. The dialog appends it after the
 * field, so this dialog stays open and keeps focus. A second dialog on top
 * would take focus from the form that the GM is editing.
 * @param {{ value?: string | number, disabled?: boolean }} field
 * @param {(read: Promise<void>) => void} track
 * @returns {{ element: HTMLElement, error: HTMLElement, get: () => string }}
 */
export function buildImagePickField(field, track) {
  const initial = field.value !== undefined ? String(field.value) : '';
  let dataUrl = initial;
  /** The name of the last good pick. @type {string | undefined} */
  let fileName;

  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.tabIndex = -1;

  const name = el('span', 'image-pick__name u-muted', pickedName(initial));
  name.id = uniqueId('image-pick-name');
  const button = textButton('Choose image', () => input.click());
  button.setAttribute('aria-describedby', name.id);
  if (field.disabled) button.disabled = true;

  const error = el('p', 'modal__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    error.hidden = true;
    track(
      readImageFile(file).then(
        (url) => {
          dataUrl = url;
          fileName = file.name;
          name.textContent = pickedName(initial, fileName);
        },
        (/** @type {Error} */ failure) => {
          // Clear the selection so a re-pick of the same file fires `change`
          // again. A file input does not fire when a pick matches its current
          // value, so without this the retry does nothing.
          input.value = '';
          error.textContent = failure.message;
          error.hidden = false;
        },
      ),
    );
  });

  const element = el('div', 'image-pick', button, name, input);
  return { element, error, get: () => dataUrl };
}
