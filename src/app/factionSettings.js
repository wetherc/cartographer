import { promptModal } from '../ui/Modal.js';
import { editFactions } from '../entities/Factions.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Open the faction list: one name field per faction and a field for a new
 * one. A renamed faction keeps its id, so its members stay in it. A cleared
 * name removes the faction, and its members then count as having none.
 * Resolves to true when the GM saves.
 * @param {AppContext} app
 * @returns {Promise<boolean>}
 */
export async function editFactionList(app) {
  const { state } = app;
  const factions = state.factions;
  const values = await promptModal(
    'Factions',
    [
      ...(factions.length > 0
        ? [
            {
              name: 'help',
              type: /** @type {const} */ ('note'),
              label: 'Clear a name to remove that faction.',
            },
          ]
        : []),
      ...factions.map((f, i) => ({
        name: `faction-${i}`,
        label: `Faction ${i + 1}`,
        value: f.name,
      })),
      { name: 'added', label: 'New faction', placeholder: 'The Silver Hand' },
    ],
    { submitLabel: 'Save' },
  );
  if (!values) return false;
  /** @type {Record<string, string>} */
  const names = Object.fromEntries(
    factions.map((f, i) => [f.id, values[`faction-${i}`] ?? f.name]),
  );
  state.factions = editFactions(factions, names, values.added ?? '');
  app.actions.markDirty();
  return true;
}
