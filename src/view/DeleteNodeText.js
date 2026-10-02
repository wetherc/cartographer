/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The question of the confirm that deletes a node from the World tree. It
 * names what goes with the node, so the GM sees the size of the delete
 * before they confirm it. The header Undo steps back to the last save, so
 * the question promises that Undo restores the node only when the last save
 * has it. A node made after the last save is not in it.
 * @param {{ name: string, maps: number, creatures: number, handouts: number, questLinks?: number, inLastSave: boolean }} counts
 *   `maps` counts the node and every node inside it, `creatures` the creatures
 *   placed in them, `handouts` the handouts bound to them, and `questLinks` the
 *   quest links to them. `inLastSave` tells whether the stored save has the node.
 * @returns {string}
 */
export function deleteNodeQuestion({
  name,
  maps,
  creatures,
  handouts,
  questLinks = 0,
  inLastSave,
}) {
  const parts = [`Delete "${name}" and everything inside it?`];
  parts.push(`This removes ${count(maps, 'map', 'maps')}.`);
  if (creatures) {
    parts.push(
      `${count(creatures, 'creature', 'creatures')} placed there ${creatures === 1 ? 'becomes' : 'become'} unplaced.`,
    );
  }
  if (handouts) {
    parts.push(
      `${count(handouts, 'handout', 'handouts')} bound there ${handouts === 1 ? 'becomes' : 'become'} campaign-wide.`,
    );
  }
  if (questLinks) {
    parts.push(
      `${count(questLinks, 'quest link', 'quest links')} to these maps ${questLinks === 1 ? 'goes' : 'go'} too.`,
    );
  }
  parts.push(
    inLastSave
      ? 'Undo in the header steps back to the last save, which still has it.'
      : 'The last save does not have it yet, so Undo in the header cannot bring it back.',
  );
  return parts.join(' ');
}
