/**
 * One AppContext stand-in for the suites that exercise the src/app wiring
 * modules. Every module reads the context late, inside a handler, so a suite
 * needs the whole surface present even when it asserts on one corner of it.
 * This builds that surface: empty campaign lists, an `update` on every
 * registered view, and a no-op for every action. Each call is recorded, so a
 * test asserts what a path did rather than installing its own spy.
 *
 * A suite overrides only what it asserts on. `state`, `views`, and `actions`
 * merge with the defaults key by key; every other key replaces its default, so
 * a map suite passes its real grid and navigator straight in.
 */

import { createClock } from '../../src/time/GameClock.js';

/** @typedef {import('../../src/types/app.js').AppContext} AppContext */

/**
 * The recording surface a stub app carries alongside the context.
 * @typedef {{
 *   calls: string[],
 *   log: string[],
 *   refreshes: string[],
 *   dirty: number,
 * }} StubRecords
 */

/** The actions whose default returns null rather than undefined. */
const NULL_GETTERS = ['getBoundCharacterId', 'getSelectedCharacterId', 'getSelectedTileId'];

/** Every action a wiring module can reach for, in AppActions order. */
const ACTION_NAMES = [
  'markDirty',
  'logEvent',
  'refreshSelectedCharacter',
  'getBoundCharacterId',
  'getSelectedCharacterId',
  'maybeTriggerEncounter',
  'openEncounterContextMenu',
  'removeCombatant',
  'addCombatant',
  'advanceCombatTurn',
  'endCombat',
  'syncCombatLocation',
  'syncPartyMarker',
  'syncCreatureMarkers',
  'meetCreatures',
  'refreshMapDescription',
  'resyncMap',
  'getSelectedTileId',
  'focusLocation',
  'centerOnLocation',
  'undoStroke',
  'onModeChanged',
  'onRoleChanged',
  'setMode',
  'rollDice',
];

/** Every panel a wiring module can refresh, in AppViews order. */
const VIEW_NAMES = [
  'mapCanvas',
  'regionTree',
  'encounterPanel',
  'buildFoes',
  'buildNPCs',
  'initiativePanel',
  'combatScreen',
  'npcPanel',
  'questPanel',
  'handoutPanel',
  'travelogPanel',
  'partyPanels',
];

/**
 * A blank campaign state. The clock is the real one, because a wiring module
 * that reads the time expects its shape rather than a number.
 * @returns {import('../../src/types/app.js').AppState}
 */
function blankState() {
  return {
    characters: [],
    creatures: [],
    travelog: [],
    quests: [],
    clock: createClock(),
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
    mode: 'play',
    role: 'gm',
  };
}

/**
 * A stand-in AppContext plus its recordings. The context is cast to
 * `AppContext` because the stub omits the engine objects a suite does not
 * override; the recordings sit on the same object, so a test reads
 * `app.calls` next to `app.state`.
 *
 * `calls` holds every action name in the order it was called, `log` the
 * messages passed to `logEvent`, `refreshes` the names of the views that were
 * updated, and `dirty` the number of `markDirty` calls.
 * @param {Partial<AppContext> & Record<string, unknown>} [overrides]
 * @returns {AppContext & StubRecords & Record<string, any>}
 */
export function stubApp(overrides = {}) {
  const { state, views, actions, ...rest } = overrides;

  const app = /** @type {any} */ ({
    toasts: { show: () => {} },
    ...rest,
    state: { ...blankState(), ...state },
    calls: [],
    log: [],
    refreshes: [],
    dirty: 0,
  });

  app.views = {};
  for (const name of VIEW_NAMES) {
    app.views[name] = { update: () => app.refreshes.push(name) };
  }
  Object.assign(app.views, views);

  app.actions = {};
  for (const name of ACTION_NAMES) {
    app.actions[name] = () => {
      app.calls.push(name);
      return NULL_GETTERS.includes(name) ? null : undefined;
    };
  }
  app.actions.markDirty = () => {
    app.calls.push('markDirty');
    app.dirty += 1;
  };
  app.actions.logEvent = (/** @type {string} */ _kind, /** @type {string} */ message) => {
    app.calls.push('logEvent');
    app.log.push(message);
  };
  Object.assign(app.actions, actions);

  return app;
}

/**
 * A TileGrid stand-in over a plain list of nodes: the lookups and the
 * breadcrumb walk, for a suite that only needs a map picker to name its maps.
 * @param {import('../../src/types/map.js').MapNode[]} nodes
 * @returns {any}
 */
export function stubGrid(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    nodes: byId,
    getNode: (/** @type {string} */ id) => byId.get(id),
    getBreadcrumb: (/** @type {string} */ id) => {
      const trail = [];
      for (
        let node = byId.get(id);
        node;
        node = node.parentId ? byId.get(node.parentId) : undefined
      ) {
        trail.unshift(node);
      }
      return trail;
    },
  };
}
