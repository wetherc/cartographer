import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { castSpellAction, castSpellOutOfCombat } from '../src/app/spellCast.js';
import { createResource } from '../src/entities/Resource.js';
import { createCreature } from '../src/entities/Creature.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

/**
 * The two cast entry points with the dialogs answered by the test: a closed
 * dialog, a target picked on the board, the question of how to pay, and a
 * cast that resolves.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };
const spellById = (/** @type {string} */ id) =>
  /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A warlock 15 / wizard 5, so an invocation's spell has two ways to pay. */
function caster({
  invocations = /** @type {string[]} */ ([]),
  prepared = /** @type {string[]} */ ([]),
} = {}) {
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
      createResource('hp', 'Hit points', 90),
      ...[1, 2, 3].map((n) => createResource(`slots-${n}`, `Level ${n} slots`, 2)),
      createResource('pact-5', 'Pact slots', 3),
    ],
    inventory: [item('pouch', 'Component Pouch', { spellFocus: true })],
    conditions: [],
    spellbook: { cantrips: ['eldritch-blast'], known: prepared, prepared },
    pactBoon: 'chain',
    invocations,
  });
}

/** Wren and an ogre on one tile, with Wren's turn in a running fight. */
function fight(wren = caster()) {
  const ogre = createCreature('ogre', 'Ogre', {
    disposition: 'hostile',
    maxHP: 60,
    stats: { AC: 1 },
    location: HERE,
    level: 1,
  });
  /** @type {string[]} */
  const toasted = [];
  const combat = { order: [{ id: 'wren' }, { id: 'ogre' }], index: 0, round: 1 };
  const app = stubApp({
    state: /** @type {any} */ ({ characters: [wren], creatures: [ogre], combat }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ m) => toasted.push(m) },
    actions: /** @type {any} */ ({ spendBudget: () => true }),
  });
  return Object.assign(app, { toasted, combat: /** @type {any} */ (combat) });
}

/**
 * A prompt that records each dialog and answers from the queue.
 * @param {(Record<string, string> | null)[]} answers
 */
function answering(answers) {
  /** @type {{ title: string, fields: any[] }[]} */
  const asked = [];
  /** @type {{ title: string, fields: any[], options: any }[]} */
  const seen = [];
  const prompt = async (
    /** @type {string} */ title,
    /** @type {any[]} */ fields,
    /** @type {any} */ options,
  ) => {
    asked.push({ title, fields });
    seen.push({ title, fields, options });
    return answers.shift() ?? null;
  };
  return { asked, seen, prompt: /** @type {any} */ (prompt) };
}

test('a closed cast dialog casts nothing, and a board pick opens pre-selected', async () => {
  const app = fight();
  const { asked, prompt } = answering([null]);
  const blast = spellById('eldritch-blast');
  await castSpellAction(app, app.combat, app.combat.order[0], blast, { targetId: 'ogre', prompt });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].title, 'Cast Eldritch Blast');
  assert.deepEqual(app.log, []);
  assert.deepEqual(app.toasted, []);
});

test('an answered cast dialog resolves the cast', async () => {
  const app = fight();
  const blast = spellById('eldritch-blast');
  const { prompt } = answering([{ slot: '0', target: 'ogre', mode: 'normal' }]);
  await castSpellAction(app, app.combat, app.combat.order[0], blast, { prompt });
  assert.ok(
    app.log.some((line) => line.startsWith('Wren casts Eldritch Blast')),
    app.log.join('\n'),
  );
});

test('a spell with two ways to pay asks how first, and a cancel there casts nothing', async () => {
  const wren = caster({ invocations: ['armor-of-shadows'], prepared: ['mage-armor'] });
  const app = fight(wren);
  const armor = spellById('mage-armor');
  const cancelled = answering([null]);
  await castSpellOutOfCombat(app, wren, armor, { prompt: cancelled.prompt });
  assert.deepEqual(
    cancelled.asked.map((a) => a.title),
    ['Cast Mage Armor'],
  );
  assert.deepEqual(
    cancelled.asked[0].fields[0].options.map((/** @type {any} */ o) => o.value),
    ['invocation', 'slot'],
  );
  const picked = answering([{ route: 'slot' }, null]);
  await castSpellOutOfCombat(app, wren, armor, { prompt: picked.prompt });
  assert.equal(picked.asked.length, 2, 'the route answer opens the cast dialog');
  assert.deepEqual(app.log, []);
});

test('castPlan keeps a save target that nothing resolves without a bonus', () => {
  const app = fight();
  const ghost = { id: 'ghost', name: 'Ghost', ac: 10, conditions: [] };
  const plan = /** @type {any} */ (
    castPlan(app, app.state.characters[0], spellById('hold-person'), [ghost])
  );
  assert.equal(plan.ok, true, plan.message);
  assert.equal(plan.targets[0], ghost);
});

test('an answered cast from the sheet writes the caster back to the roster', async () => {
  const app = fight(caster({ prepared: ['ray-of-sickness'] }));
  const wren = app.state.characters[0];
  const { prompt } = answering([{ slot: '1', target: 'ogre', mode: 'normal' }]);
  await castSpellOutOfCombat(app, wren, spellById('ray-of-sickness'), { prompt });
  assert.ok(
    app.log.some((line) => line.startsWith('Wren casts Ray of Sickness')),
    app.log.join('; '),
  );
  const slots = app.state.characters[0].resources.find(
    (/** @type {any} */ r) => r.id === 'slots-1',
  );
  assert.equal(slots.current, 1, 'the spent slot is written back');
  assert.ok(app.calls.includes('refreshSelectedCharacter'));
});

test('the cast dialog refuses Cast with no target ticked, and passes one that is', async () => {
  const app = fight();
  const { seen, prompt } = answering([null]);
  await castSpellAction(app, app.combat, app.combat.order[0], spellById('eldritch-blast'), {
    prompt,
  });
  const { validate } = seen[0].options;
  /** @type {Record<string, string>} */
  const values = { allocation: 'ogre:0' };
  const get = (/** @type {string} */ name) => values[name] ?? '';
  assert.equal(validate(get), 'Pick at least one target.');
  values.allocation = 'ogre:1';
  assert.equal(validate(get), '');
});
