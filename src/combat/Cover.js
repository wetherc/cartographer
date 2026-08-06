/**
 * Cover on one attack, as the GM calls it at the table.
 *
 * 5e gives a target behind cover a bonus to AC: +2 for half cover and +5 for
 * three-quarters cover. This module holds that table and nothing else. It does
 * not decide whether a target has cover. The app tracks no distance between
 * tokens and no line of sight, so no rule here could read a wall or a barrel
 * off the map. The GM picks the level in the pre-roll dialog for each swing.
 *
 * Total cover is absent on purpose. A target in total cover cannot be attacked
 * at all, so the answer is to not roll, not to raise an AC.
 */

/** @typedef {'none' | 'half' | 'three-quarters'} CoverLevel */

/** The levels the pre-roll dialog offers, in the order it shows them. */
export const COVER_LEVELS = [
  { value: /** @type {const} */ ('none'), label: 'None', bonus: 0 },
  { value: /** @type {const} */ ('half'), label: 'Half cover (+2 AC)', bonus: 2 },
  {
    value: /** @type {const} */ ('three-quarters'),
    label: 'Three-quarters cover (+5 AC)',
    bonus: 5,
  },
];

/**
 * What the given cover adds to the target's AC. An unknown or absent level adds
 * nothing, so a dialog answer this module has never heard of rolls against the
 * plain AC.
 * @param {unknown} level
 * @returns {number}
 */
export function coverBonus(level) {
  return COVER_LEVELS.find((entry) => entry.value === level)?.bonus ?? 0;
}

/**
 * How the log names the cover, such as `half cover +2`. Cover that adds nothing
 * gets no text, so the log line stays as short as the situation.
 * @param {unknown} level
 * @returns {string}
 */
export function coverNote(level) {
  const found = COVER_LEVELS.find((entry) => entry.value === level);
  if (!found || found.bonus === 0) return '';
  return `${found.label.replace(/ \(.*\)$/, '').toLowerCase()} +${found.bonus}`;
}
