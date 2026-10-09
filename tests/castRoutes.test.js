import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { spellsOf } from '../src/app/combatants.js';
import { castRoutes } from '../src/entities/CastRoute.js';
import { markInvocationUsed } from '../src/entities/Invocations.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

/**
 * The casts that have more than one way to pay: an invocation's spell that
 * the caster also knows, a repeat still open, and a once-per-rest invocation
 * that pays with a pact slot.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };
const face = (sides, value) => (value - 1) / sides + 1e-9;
const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A warlock 15 / wizard 5 with pact slots at 5th and leveled slots to 3rd. */
function caster({ invocations = [], prepared = [], pact = 2 } = {}) {
  return /** @type {any} */ ({
    id: 'wren',
    name: 'Wren',
    race: 'human',
    classes: [
      { classId: 'warlock', level: 15 },
      { classId: 'wizard', level: 5 },
    ],
    level: 20,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 16, WIS: 10, CHA: 16 },
    resources: [
      createResource('hp', 'Hit points', 'health', 90),
      ...[1, 2, 3].map((n) => createResource(`slots-${n}`, `Level ${n} slots`, 'mana', 2)),
      { ...createResource('pact-5', 'Pact slots', 'mana', 3), current: pact },
    ],
    inventory: [item('pouch', 'Component Pouch', { spellFocus: true })],
    conditions: [],
    spellbook: { cantrips: ['eldritch-blast'], known: prepared, prepared },
    proficiencies: undefined,
    pactBoon: 'chain',
    invocations,
  });
}

function stubApp(wren) {
  /** @type {string[]} */
  const toasted = [];
  const app = baseStubApp({
    state: {
      characters: [wren],
      creatures: ['ogre', 'troll'].map((id) =>
        createCreature(id, id, {
          disposition: 'hostile',
          maxHP: 60,
          stats: { AC: 12 },
          location: HERE,
          level: 1,
        }),
      ),
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => toasted.push(message) },
  });
  return Object.assign(app, { toasted });
}

const live = (app) => app.state.characters[0];
const pool = (app, id) => live(app).resources.find((r) => r.id === id).current;
const listed = (app, id) => spellsOf(app, 'wren').find((s) => s.id === id);

function plan(app, id, route = null) {
  const spell = listed(app, id) ?? spellById(id);
  return /** @type {any} */ (
    castPlan(app, live(app), spell, rosterTargets(app, spell, 'wren'), route)
  );
}

function resolve(app, p, values, rng = () => 0.5) {
  assert.equal(p.ok, true, p.message);
  resolveCast(app, p, /** @type {any} */ ({ mode: 'normal', ...values }), {
    rng,
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
  });
}

test('a once-per-rest invocation offers and spends only the pact slot', () => {
  const app = stubApp(caster({ invocations: ['sign-of-ill-omen'] }));
  const p = plan(app, 'bestow-curse');
  assert.deepEqual(p.slotLevels, [5]);
  resolve(app, p, { slot: '5', target: 'ogre' });
  assert.equal(pool(app, 'slots-3'), 2);
  assert.equal(pool(app, 'pact-5'), 1);
  assert.deepEqual(live(app).invocationUses, ['sign-of-ill-omen']);
});

test('a once-per-rest invocation refuses with the pact pool empty', () => {
  const app = stubApp(caster({ invocations: ['sign-of-ill-omen'], pact: 0 }));
  assert.deepEqual(plan(app, 'bestow-curse'), {
    ok: false,
    message: 'No pact slot left for Bestow Curse.',
  });
});

test('a once-per-rest use spent in another tab refuses at resolve time', () => {
  const app = stubApp(caster({ invocations: ['sign-of-ill-omen'] }));
  const p = plan(app, 'bestow-curse');
  app.state.characters = [markInvocationUsed(live(app), 'sign-of-ill-omen')];
  resolve(app, p, { slot: '5', target: 'ogre' });
  assert.deepEqual(app.toasted, ['Sign of Ill Omen is spent until a long rest.']);
  assert.equal(pool(app, 'pact-5'), 2);
});

test('an at-will spell the caster also knows offers both routes', () => {
  const app = stubApp(caster({ invocations: ['armor-of-shadows'], prepared: ['mage-armor'] }));
  assert.equal(listed(app, 'mage-armor').range, 'Touch');
  assert.deepEqual(
    castRoutes(live(app), spellById('mage-armor')).map((r) => r.id),
    ['invocation', 'slot'],
  );
  const slot = plan(app, 'mage-armor', 'slot');
  assert.equal(slot.free, null);
  assert.equal(slot.invocation, null);
  assert.deepEqual(slot.slotLevels, [1, 2, 3, 5]);
  assert.equal(slot.spell.range, 'Touch');
  assert.ok(slot.spell.components.includes('M'));
  const atWill = plan(app, 'mage-armor', 'invocation');
  assert.deepEqual(atWill.free, { slotLevel: 1 });
  assert.equal(atWill.spell.range, 'Self');
  assert.equal(atWill.spell.components.includes('M'), false);
});

test('Hold Monster through Chains of Carceri upcasts on the slot route', () => {
  const app = stubApp(caster({ invocations: ['chains-of-carceri'], prepared: ['hold-monster'] }));
  assert.deepEqual(plan(app, 'hold-monster', 'slot').slotLevels, [5]);
  assert.deepEqual(plan(app, 'hold-monster').free, { slotLevel: 5 });
});

test('a spell with one way to cast offers no routes', () => {
  const app = stubApp(caster({ invocations: ['armor-of-shadows', 'sign-of-ill-omen'] }));
  assert.deepEqual(castRoutes(live(app), spellById('mage-armor')), []);
  assert.deepEqual(castRoutes(live(app), spellById('bestow-curse')), []);
  assert.deepEqual(castRoutes(live(app), spellById('fireball')), []);
});

test('an open repeat offers a fresh cast, which closes the old repeat', () => {
  const app = stubApp(caster({ prepared: ['spiritual-weapon'] }));
  resolve(app, plan(app, 'spiritual-weapon'), { slot: '2', target: 'ogre' }, () => face(20, 15));
  assert.deepEqual(
    castRoutes(live(app), spellById('spiritual-weapon')).map((r) => r.id),
    ['repeat', 'anew'],
  );
  assert.equal(plan(app, 'spiritual-weapon', 'repeat').free?.repeat, true);
  const anew = plan(app, 'spiritual-weapon', 'anew');
  assert.equal(anew.free, null);
  resolve(app, anew, { slot: '3', target: 'troll' }, () => face(20, 15));
  const chips = live(app).conditions.filter((c) => c.name === 'Spiritual Weapon');
  assert.equal(chips.length, 1);
  assert.deepEqual(chips[0].source.repeat, { slotLevel: 3 });
  assert.equal(pool(app, 'slots-3'), 1);
});

test('a fresh Witch Bolt picks a new target past the locked one', () => {
  const app = stubApp(caster({ prepared: ['witch-bolt'] }));
  resolve(app, plan(app, 'witch-bolt'), { slot: '1', target: 'ogre' }, () => face(20, 15));
  assert.deepEqual(
    plan(app, 'witch-bolt', 'repeat').targets.map((t) => t.id),
    ['ogre'],
  );
  const anew = plan(app, 'witch-bolt', 'anew');
  assert.ok(anew.targets.some((t) => t.id === 'troll'));
  resolve(app, anew, { slot: '2', target: 'troll' }, () => face(20, 15));
  const chips = live(app).conditions.filter((c) => c.name === 'Witch Bolt');
  assert.equal(chips.length, 1);
  assert.deepEqual(chips[0].source.repeat, { slotLevel: 2, targetIds: ['troll'] });
});
