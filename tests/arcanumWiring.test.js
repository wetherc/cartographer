import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { spellsOf } from '../src/app/combatants.js';
import { castRoutes } from '../src/entities/CastRoute.js';
import { longRest } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of the Mystic Arcanum: a warlock spell of 6th level or higher
 * cast once per long rest with no slot.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** An 11th-level warlock with Circle of Death as its 6th-level arcanum. */
function warlock(extra = {}) {
  return /** @type {any} */ ({
    id: 'wren',
    name: 'Wren',
    race: 'human',
    classes: [{ classId: 'warlock', level: 11 }],
    level: 11,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 16 },
    resources: [createResource('hp', 'Hit points', 60), createResource('pact-5', 'Pact slots', 3)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['eldritch-blast'], known: [], prepared: [] },
    mysticArcanum: { 6: 'circle-of-death' },
    ...extra,
  });
}

function stubApp(extra) {
  /** @type {string[]} */
  const toasted = [];
  const app = baseStubApp({
    state: {
      characters: [warlock(extra)],
      creatures: [
        createCreature('ogre', 'Ogre', {
          disposition: 'hostile',
          maxHP: 60,
          stats: { AC: 12 },
          location: HERE,
          level: 1,
        }),
      ],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => toasted.push(message) },
  });
  return Object.assign(app, { toasted });
}

const wren = (app) => app.state.characters[0];
const listed = (app, id) => spellsOf(app, 'wren').find((s) => s.id === id);

function plan(app, id, route = null) {
  const spell = listed(app, id);
  return /** @type {any} */ (
    castPlan(app, wren(app), spell, rosterTargets(app, spell, 'wren'), route)
  );
}

function cast(app, id, values, route = null) {
  const p = plan(app, id, route);
  assert.equal(p.ok, true, p.message);
  resolveCast(app, p, /** @type {any} */ (values), {
    rng: () => 0.5,
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
  });
  return p;
}

test('the combat spell list offers the arcanum spell', () => {
  assert.ok(listed(stubApp(), 'circle-of-death'));
});

test('an arcanum casts at its own level with no slot, once per long rest', () => {
  const app = stubApp();
  const p = cast(app, 'circle-of-death', { targets: 'ogre', 'ignore-components': '1' });
  assert.deepEqual(p.free, { slotLevel: 6 });
  assert.equal(p.sourceClass, 'warlock');
  assert.equal(p.slotLevels.length, 0);
  assert.equal(wren(app).resources.find((r) => r.id === 'pact-5').current, 3);
  assert.deepEqual(wren(app).invocationUses, ['arcanum-6']);
  assert.ok(app.state.creatures[0].currentHP < 60);
  assert.ok(app.log.includes('Wren casts Circle of Death (Mystic Arcanum).'), app.log.join('\n'));
  assert.deepEqual(plan(app, 'circle-of-death'), {
    ok: false,
    message: 'Mystic Arcanum is spent until a long rest.',
  });
  app.state.characters = app.state.characters.map(longRest);
  assert.equal(plan(app, 'circle-of-death').ok, true);
});

test('a use spent in another tab while the dialog is open refuses', () => {
  const app = stubApp();
  const p = plan(app, 'circle-of-death');
  app.state.characters = [{ ...wren(app), invocationUses: ['arcanum-6'] }];
  resolveCast(app, p, /** @type {any} */ ({ targets: 'ogre', 'ignore-components': '1' }), {
    rng: () => 0.5,
    writeBack: () => assert.fail('no write'),
  });
  assert.deepEqual(app.toasted, ['Mystic Arcanum is spent until a long rest.']);
});

/** The spell prepared as a wizard spell gives the arcanum spell a second way. */
const withSlot = {
  resources: [createResource('hp', 'Hit points', 60), createResource('slot-6', 'Level 6 slots', 1)],
  classes: [
    { classId: 'warlock', level: 11 },
    { classId: 'wizard', level: 9 },
  ],
  level: 20,
  spellbook: {
    cantrips: ['eldritch-blast'],
    known: ['circle-of-death'],
    prepared: ['circle-of-death'],
    sources: { 'circle-of-death': 'wizard' },
  },
};

test('castRoutes asks between the arcanum and a slot when the book also has the spell', () => {
  const app = stubApp(withSlot);
  const routes = castRoutes(wren(app), listed(app, 'circle-of-death'));
  assert.deepEqual(
    routes.map((r) => r.id),
    ['invocation', 'slot'],
  );
  assert.equal(routes[0].label, 'Mystic Arcanum (no slot, once per long rest)');
  // The slot route takes the book path, which needs a 6th-level slot that
  // a warlock 11 / wizard 9 does not have.
  assert.equal(
    plan(app, 'circle-of-death', 'slot').message,
    'No level 6+ slot left for Circle of Death.',
  );
  const free = plan(app, 'circle-of-death', 'invocation');
  assert.deepEqual(free.free, { slotLevel: 6 });
});

test('a spent arcanum of a book spell casts with a slot and asks nothing', () => {
  const app = stubApp({ ...withSlot, invocationUses: ['arcanum-6'] });
  assert.deepEqual(castRoutes(wren(app), listed(app, 'circle-of-death')), []);
  const p = plan(app, 'circle-of-death');
  assert.equal(p.message, 'No level 6+ slot left for Circle of Death.');
});
