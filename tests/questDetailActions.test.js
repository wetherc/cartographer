import test from 'node:test';
import assert from 'node:assert/strict';

import { questDetailCallbacks, readPlaceLink } from '../src/app/questDetailActions.js';
import { createQuest } from '../src/quest/Quests.js';
import { creatureLink, placeLink } from '../src/quest/QuestLinks.js';
import { stubApp, stubGrid } from './helpers/app.js';

/** @typedef {import('../src/types/quest.js').Quest} Quest */

const world = /** @type {any} */ ({
  id: 'world',
  name: 'World',
  parentId: null,
  width: 9,
  height: 7,
});
const town = /** @type {any} */ ({
  id: 'town',
  name: 'Briarwick',
  parentId: 'world',
  width: 4,
  height: 4,
});

/**
 * A stub app with two maps, one placed and one unplaced creature, and one
 * quest. `centered` collects every location the map was asked to show.
 * @param {Partial<import('../src/types/app.js').AppState>} [state]
 */
function fakeApp(state = {}) {
  /** @type {unknown[]} */
  const centered = [];
  const app = stubApp({
    grid: stubGrid([world, town]),
    navigator: { getCurrentNode: () => town },
    state: {
      quests: [createQuest('q1', 'Rumors')],
      creatures: /** @type {any} */ ([
        { id: 'bram', name: 'Bram', location: { nodeId: 'town', tileId: '1,2' } },
        { id: 'ghost', name: 'Ghost', location: null },
        { id: 'lost', name: 'Lost', location: { nodeId: 'gone', tileId: '0,0' } },
      ]),
      ...state,
    },
    actions: { centerOnLocation: (/** @type {unknown} */ at) => centered.push(at) },
  });
  /** @type {string[]} */
  const toasts = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  return { app, centered, toasts };
}

/**
 * The callbacks with a dialog that answers `values` and records each call.
 * @param {ReturnType<typeof fakeApp>['app']} app
 * @param {Record<string, string> | null} values
 */
function wire(app, values) {
  /** @type {{ title: string, fields: any[] }[]} */
  const prompts = [];
  const callbacks = questDetailCallbacks(app, {
    prompt: async (title, fields) => {
      prompts.push({ title, fields });
      return values;
    },
  });
  return { callbacks, prompts };
}

const quest = (/** @type {ReturnType<typeof fakeApp>['app']} */ app) =>
  /** @type {Quest} */ (app.state.quests[0]);

test('readPlaceLink links the whole map when column and row are blank', () => {
  assert.deepEqual(readPlaceLink(town, { tileX: '', tileY: ' ' }), placeLink('town'));
  assert.deepEqual(readPlaceLink(town, {}), placeLink('town'));
});

test('readPlaceLink clamps a typed position and fills a missing half with 1', () => {
  assert.deepEqual(readPlaceLink(town, { tileX: '2', tileY: '3' }), placeLink('town', '1,2'));
  assert.deepEqual(readPlaceLink(town, { tileX: '99', tileY: '' }), placeLink('town', '3,0'));
  assert.equal(readPlaceLink(undefined, { tileX: '1', tileY: '1' }), null);
});

test('onAddObjective appends the typed objective with its GM-only flag', async () => {
  const { app } = fakeApp();
  const { callbacks, prompts } = wire(app, { text: '  Find Bram ', hidden: '1' });
  assert.equal(await callbacks.onAddObjective(quest(app)), true);
  assert.deepEqual(quest(app).objectives, [
    { id: 'o1', text: 'Find Bram', done: false, hidden: true },
  ]);
  assert.equal(prompts[0].title, 'New objective for Rumors');
  assert.equal(app.dirty, 1);
});

test('onAddObjective does nothing for a blank text or a cancel', async () => {
  const { app } = fakeApp();
  assert.equal(
    await wire(app, { text: '  ', hidden: '' }).callbacks.onAddObjective(quest(app)),
    false,
  );
  assert.equal(await wire(app, null).callbacks.onAddObjective(quest(app)), false);
  assert.equal(app.dirty, 0);
});

test('onEditObjective rewrites the text and flag, and a blank text cancels', async () => {
  const { app } = fakeApp();
  await wire(app, { text: 'Find Bram', hidden: '' }).callbacks.onAddObjective(quest(app));
  const objective = quest(app).objectives[0];
  const { callbacks, prompts } = wire(app, { text: 'Ask Bram', hidden: '1' });
  assert.equal(await callbacks.onEditObjective(quest(app), objective), true);
  assert.deepEqual(quest(app).objectives[0], { ...objective, text: 'Ask Bram', hidden: true });
  assert.equal(prompts[0].fields[1].value, false);
  assert.equal(
    await wire(app, { text: '', hidden: '' }).callbacks.onEditObjective(quest(app), objective),
    false,
  );
});

test('onChange writes a change to the current quest and reports a no-op', () => {
  const { app, toasts } = fakeApp();
  const { callbacks } = wire(app, null);
  const stale = quest(app);
  assert.equal(
    callbacks.onChange(stale, (q) => ({ ...q, title: 'Renamed' })),
    true,
  );
  assert.equal(quest(app).title, 'Renamed');
  assert.equal(
    callbacks.onChange(stale, (q) => q),
    false,
  );
  app.state.quests = [];
  assert.equal(
    callbacks.onChange(stale, (q) => ({ ...q, title: 'X' })),
    false,
  );
  assert.deepEqual(toasts, ['That quest was deleted.']);
  assert.equal(app.dirty, 1);
});

test('onAddLink with a place offers every map, starting at the one in view', async () => {
  const { app } = fakeApp();
  const { callbacks, prompts } = wire(app, { nodeId: 'town', tileX: '', tileY: '' });
  assert.equal(await callbacks.onAddLink(quest(app), 'place'), true);
  assert.deepEqual(quest(app).links, [placeLink('town')]);
  const [map] = prompts[0].fields;
  assert.equal(map.value, 'town');
  assert.deepEqual(
    map.options.map((/** @type {any} */ o) => o.label),
    ['World', 'World / Briarwick'],
  );
  assert.equal(await wire(app, null).callbacks.onAddLink(quest(app), 'place'), false);
});

test('onAddLink with a creature lists the creatures by name', async () => {
  const { app } = fakeApp();
  const { callbacks, prompts } = wire(app, { creatureId: 'bram' });
  assert.equal(await callbacks.onAddLink(quest(app), 'creature'), true);
  assert.deepEqual(quest(app).links, [creatureLink('bram')]);
  assert.deepEqual(
    prompts[0].fields[0].options.map((/** @type {any} */ o) => o.value),
    ['bram', 'ghost', 'lost'],
  );
  // A creature deleted while the dialog was open links nothing.
  assert.equal(
    await wire(app, { creatureId: 'nobody' }).callbacks.onAddLink(quest(app), 'creature'),
    false,
  );
});

test('onAddLink with a creature and no creatures says so without a dialog', async () => {
  const { app, toasts } = fakeApp({ creatures: [] });
  const { callbacks, prompts } = wire(app, { creatureId: 'bram' });
  assert.equal(await callbacks.onAddLink(quest(app), 'creature'), false);
  assert.equal(prompts.length, 0);
  assert.deepEqual(toasts, ['There are no creatures to link yet.']);
});

test('describeLinks labels the live links and opens them on the map', () => {
  const { app, centered } = fakeApp();
  const links = [
    placeLink('town', '1,2'),
    placeLink('world'),
    placeLink('gone'),
    creatureLink('bram'),
    creatureLink('ghost'),
    creatureLink('lost'),
    creatureLink('deleted'),
  ];
  const chips = wire(app, null).callbacks.describeLinks({ ...quest(app), links });
  assert.deepEqual(
    chips.map((c) => c.label),
    ['Briarwick (column 2, row 3)', 'World', 'Bram', 'Ghost', 'Lost'],
  );
  chips[0].onOpen?.();
  chips[1].onOpen?.();
  chips[2].onOpen?.();
  assert.deepEqual(centered, [
    { nodeId: 'town', tileId: '1,2' },
    { nodeId: 'world', tileId: '4,3' },
    { nodeId: 'town', tileId: '1,2' },
  ]);
  // An unplaced creature, and one on a map that is gone, have nothing to show.
  assert.equal(chips[3].onOpen, null);
  assert.equal(chips[4].onOpen, null);
});

test('linkTargets reports the creature list, so a rename repaints the chips', () => {
  const { app } = fakeApp();
  assert.equal(wire(app, null).callbacks.linkTargets(), app.state.creatures);
});
