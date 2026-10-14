/**
 * The save status line under the header title. Autosave writes a dirty campaign
 * within about fifteen seconds, and this line tells the GM whether the work
 * on screen is already in storage.
 * @param {boolean} dirty true while changes wait for a write
 * @param {number | null} savedAt epoch ms of the last write from this tab, or null
 *   before one, when the campaign on screen is the one that the page loaded
 * @param {number} now epoch ms
 * @returns {string}
 */
export function saveStatusText(dirty, savedAt, now) {
  if (dirty) return 'Unsaved changes';
  if (savedAt === null) return 'No unsaved changes';
  const minutes = Math.floor(Math.max(0, now - savedAt) / 60_000);
  if (minutes < 1) return 'Saved just now';
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Saved ${hours} h ago`;
}
