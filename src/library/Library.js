/**
 * The one import site of the template library. The code lives in three
 * modules beside this file, and this file re-exports them:
 *
 * - `LibraryMerge.js` builds the built-in equipment list and merges custom
 *   entries over the defaults.
 * - `LibraryNormalize.js` turns parsed library JSON into a valid
 *   CustomLibrary.
 * - `ActiveLibrary.js` stores the library that the pickers read, and caches
 *   its merged lists.
 */

import { DEFAULT_FEATS } from '../data/feats.js';
import { DEFAULT_CREATURES } from '../data/creatures.js';
import { DEFAULT_TABLES } from '../data/tables.js';
import { renameConflict, storedEntryId } from './LibraryIdentity.js';

export {
  defaultEquipmentTemplates,
  emptyLibrary,
  isLibraryEmpty,
  equipmentKey,
  nameKey,
  mergedEntries,
  upsertEntry,
  removeEntry,
} from './LibraryMerge.js';
export { normalizeFeat, normalizeLibrary } from './LibraryNormalize.js';
export {
  setActiveLibrary,
  getActiveLibrary,
  activeEquipmentEntries,
  activeEquipment,
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
  activeCreatureEntries,
  activeCreatures,
  activeCreatureByName,
  activeSpellEntries,
  activeSpells,
  activeSpellIndex,
  activeFeatEntries,
  activeFeats,
  activeTableEntries,
  resolveSpellIds,
} from './ActiveLibrary.js';

// The built-in creature and feat templates and the built-in random tables live with the other authored
// corpora in src/data/. The re-exports keep this module the one import site
// for the built-in defaults of every library kind.
export { DEFAULT_CREATURES, DEFAULT_FEATS, DEFAULT_TABLES };

// The id rules for the name-keyed lists live in LibraryIdentity.js. The
// re-export keeps this module the one import site for the library wiring.
export { storedEntryId, renameConflict };
