/**
 * The top-level campaign fields other than `nodes`, `party`, and `version`,
 * in save order. Each entry names the field, the value a save without the
 * field reads as, and the coercion that `deserialize` runs on the stored
 * value. `buildState`, `deserialize`, and `SYNCED_STATE_KEYS` all read this
 * table, so a field added here is written, read back, and synced across tabs.
 *
 * This is pure logic.
 */

import { withDefaults as withCharacterDefaults } from '../entities/Character.js';
import { withDefaults as withCreatureDefaults } from '../entities/Creature.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';
import { coerceCalendar } from '../time/Calendar.js';
import { coerceFactions } from '../entities/Factions.js';
import {
  combatState,
  creatureTemplates,
  entryTiles,
  gameClock,
  logEntries,
  quests,
  records,
  uniqueIds,
} from './RecordCoercion.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').CampaignFieldKey} CampaignFieldKey */
/**
 * @typedef {object} CampaignField
 * @property {CampaignFieldKey} key
 * @property {() => unknown} empty the value when a caller or a save omits the field
 * @property {(value: unknown) => unknown} coerce the load-time repair of a stored value
 * @property {string | null} label the name an Undo or Redo toast gives the field, or
 *   null when the toast leaves the field out
 */

/**
 * A record coercion followed by the entity defaults, with each repeated id
 * made unique (see `uniqueIds`). This is the unpack half
 * of the omission in `packState`, so it runs on every load. A stored
 * character can have no `spellbook` key, and `undoHistory` and
 * `readCampaignFromFile` pass their result to callers that apply no defaults.
 * @param {(entry: any) => { id?: unknown }} withDefaults
 * @returns {(value: unknown) => unknown[]}
 */
const entityList = (withDefaults) => (value) =>
  uniqueIds(records(value).map((entry) => withDefaults(entry)));

/**
 * A list coercion whose result has no repeated id (see `uniqueIds`).
 * @param {(value: unknown) => { id?: unknown }[]} coerce
 * @returns {(value: unknown) => unknown[]}
 */
const keyedList = (coerce) => (value) => uniqueIds(coerce(value));

/**
 * One entry per key, typed against `CampaignState`. Typecheck fails when a
 * key is missing here or names no field of `CampaignState`.
 * @type {Record<CampaignFieldKey, Omit<CampaignField, 'key'>>}
 */
const BY_KEY = {
  // The toast folds the entry memory into the party position.
  entryTiles: { empty: () => ({}), coerce: entryTiles, label: null },
  characters: { empty: () => [], coerce: entityList(withCharacterDefaults), label: 'characters' },
  creatures: { empty: () => [], coerce: entityList(withCreatureDefaults), label: 'creatures' },
  travelog: { empty: () => [], coerce: keyedList(logEntries), label: 'the travelogue' },
  quests: { empty: () => [], coerce: keyedList(quests), label: 'quests' },
  clock: { empty: () => null, coerce: gameClock, label: 'the clock' },
  handouts: { empty: () => [], coerce: entityList(withHandoutDefaults), label: 'handouts' },
  bestiary: { empty: () => [], coerce: keyedList(creatureTemplates), label: 'the bestiary' },
  splitParty: { empty: () => false, coerce: (value) => value === true, label: 'party splitting' },
  combat: { empty: () => null, coerce: combatState, label: 'the fight' },
  calendar: { empty: () => null, coerce: coerceCalendar, label: 'the calendar' },
  factions: { empty: () => [], coerce: coerceFactions, label: 'factions' },
};

/** @type {readonly CampaignField[]} */
export const CAMPAIGN_FIELDS = Object.freeze(
  /** @type {CampaignFieldKey[]} */ (Object.keys(BY_KEY)).map((key) =>
    Object.freeze({ key, ...BY_KEY[key] }),
  ),
);

/** The keys of `CAMPAIGN_FIELDS`, in save order. */
export const CAMPAIGN_FIELD_KEYS = Object.freeze(CAMPAIGN_FIELDS.map((field) => field.key));

/**
 * The campaign fields of `source`, each in table order, with the empty value
 * in place of a field that `source` leaves undefined. Extra keys of
 * `source`, such as `grid`, `mode`, or `role`, are not copied.
 * @param {object} source
 * @returns {Pick<CampaignState, CampaignFieldKey>}
 */
export function campaignFields(source) {
  const from = /** @type {Record<string, unknown>} */ (source);
  return /** @type {Pick<CampaignState, CampaignFieldKey>} */ (
    Object.fromEntries(
      CAMPAIGN_FIELDS.map(({ key, empty }) => [key, from[key] === undefined ? empty() : from[key]]),
    )
  );
}
