/**
 * The dice tray, its random table row, and the roll log. Rolls live in the log (the tray itself
 * shows only the latest roll), tagged by which side of the screen rolled them.
 */

import { mustGetElement } from '../ui/dom.js';
import { mountDiceTray } from '../ui/DiceTray.js';
import { isGM } from '../view/ViewRole.js';
import { trayRollLine, tableRollLine } from '../log/TrayRollLine.js';
import { activeTableEntries, nameKey } from '../library/Library.js';
import { rollTable } from '../dice/RandomTable.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Mount the tray and register the roll action.
 * @param {AppContext} app
 */
export function wireDiceTray(app) {
  /** This function returns who a roll is attributed to: the GM, the
   * character this tab is bound to, or an anonymous player for a spectator tab. */
  function rollerName() {
    if (isGM(app.state.role)) return 'The GM';
    const boundId = app.actions.getBoundCharacterId();
    return app.state.characters.find((c) => c.id === boundId)?.name ?? 'A player';
  }

  const diceTray = mountDiceTray(mustGetElement('dice-tray-container'), {
    onRoll: (text, { hidden }) => {
      const line = trayRollLine(rollerName(), text, { hidden, gm: isGM(app.state.role) });
      app.actions.logEvent('roll', line.message, line.options);
    },
    // The table row rolls the merged library tables, built-in and custom.
    // Only a GM tab rolls on a table, and the stylesheet hides the row in a
    // Player tab.
    tables: {
      list: () =>
        activeTableEntries().map(({ entry }) => ({ value: nameKey(entry), label: entry.name })),
      onRoll: (key, { hidden }) => {
        const table = activeTableEntries().find(({ entry }) => nameKey(entry) === key)?.entry;
        const result = table && isGM(app.state.role) ? rollTable(table, Math.random) : null;
        if (!table || !result) return null;
        const line = tableRollLine(rollerName(), table.name, result.text, { hidden, gm: true });
        app.actions.logEvent('roll', line.message, line.options);
        return result.text;
      },
    },
  });

  // This lets a weapon attack load and roll the tray (d20 plus modifier
  // against the defender's AC). The roll then shows where every other roll shows.
  app.actions.rollDice = (selection, target, options) =>
    diceTray.rollSelection(selection, target, options);
  // A spell cast rolls outside the tray, so it clears the tray's last result.
  app.actions.clearDiceResult = () => diceTray.clearResult();
}
