import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/spellCast.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { createResource } from '../src/entities/Resource.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The cast dialog can sit open while the caster changes under it: a heal
 * lands, a condition is added, or another tab adopts a save. `resolveCast`
 * must read the caster again by id when the dialog submits, and write the
 * spent slot onto that current entity, never onto the copy the plan holds.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** @param {{ characters?: any[] }} rosters */
function stubApp(rosters) {
  /** @type {string[]} */
  const toasted = [];
  const app = baseStubApp({
    state: rosters,
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => toasted.push(message) },
  });
  app.toasted = toasted;
  return app;
}

function mage() {
  return /** @type {any} */ ({
    id: 'mage',
    name: 'Mage',
    race: 'human',
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [createResource('slots-1', 'Level 1 slots', 'mana', 4)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: ['detect-magic'], prepared: ['detect-magic'] },
  });
}

const detectMagic = /** @type {any} */ ({
  id: 'detect-magic',
  name: 'Detect Magic',
  level: 1,
  school: 'divination',
  classes: ['wizard'],
  castingTime: { kind: 'action' },
  range: 'Self',
  components: ['V', 'S'],
  duration: { kind: 'minutes', amount: 10 },
  concentration: false,
  ritual: true,
  description: '',
  effect: { kind: 'utility' },
});

/** @param {any} app @param {any} caster */
function planFor(app, caster) {
  const plan = castPlan(app, caster, detectMagic, rosterTargets(app, detectMagic));
  assert.equal(plan.ok, true);
  return /** @type {any} */ (plan);
}

const submit = () => /** @type {any} */ ({ slot: '1', mode: 'normal' });

test('the spent slot lands on the caster as it is at submit time', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster);
  // A condition arrives while the dialog is open.
  app.state.characters = [{ ...caster, conditions: ['Blessed'] }];
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit(), {
    writeBack: (next) => written.push(next),
    concentrates: true,
  });
  assert.equal(written.length, 1);
  assert.deepEqual(written[0].conditions, ['Blessed'], 'the newer entity is kept');
  assert.equal(written[0].resources[0].current, 3, 'and the slot is spent on it');
  assert.deepEqual(app.toasted, ['Detect Magic cast.']);
});

test('a slot spent elsewhere while the dialog was open is not spent twice', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster);
  // Another tab spends the last three slots while the dialog is open.
  app.state.characters = [{ ...caster, resources: [{ ...caster.resources[0], current: 1 }] }];
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit(), {
    writeBack: (next) => written.push(next),
    concentrates: true,
  });
  assert.equal(written[0].resources[0].current, 0, 'one slot comes off the live count');
});

test('a caster that left the campaign casts nothing and spends nothing', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster);
  app.state.characters = [];
  let written = 0;
  resolveCast(app, plan, submit(), {
    writeBack: () => {
      written += 1;
    },
    concentrates: true,
  });
  assert.equal(written, 0);
  assert.deepEqual(app.log, []);
  assert.equal(app.dirty, 0);
  assert.deepEqual(app.toasted, ['Mage is no longer in the campaign.']);
});
