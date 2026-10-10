import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { spellsOf, asTarget } from '../src/app/combatants.js';
import { endFightEffects, startTurnEffects } from '../src/app/turnEffectsWiring.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { replaceById } from '../src/entities/Roster.js';
import { getHP } from '../src/entities/Character.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** An rng that returns the given values in order, then 0.5. */
function seq(values) {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}
const face = (sides, value) => (value - 1) / sides + 1e-9;

const breath = {
  id: 'cold-breath',
  name: 'Cold Breath',
  saveAbility: 'DEX',
  dc: 13,
  damage: [{ count: 2, sides: 8, damageType: 'cold' }],
  halfOnSave: true,
  recharge: 5,
};

function hero() {
  return /** @type {any} */ ({
    id: 'hero',
    name: 'Hero',
    race: 'human',
    classes: [{ classId: 'fighter', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    resources: [{ id: 'hp', name: 'HP', type: 'health', current: 40, max: 40 }],
    inventory: [],
    conditions: [],
  });
}

function stubApp() {
  const wolf = createCreature('wolf', 'Winter Wolf', {
    disposition: 'hostile',
    maxHP: 30,
    location: HERE,
    actions: [breath],
  });
  const app = baseStubApp({
    state: { characters: [hero()], creatures: [wolf] },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
  app.state.combat = startCombat(
    [createParticipant('wolf', 20), createParticipant('hero', 10)],
    (p) => p.id,
  );
  return app;
}

const wolfOf = (app) => app.state.creatures.find((c) => c.id === 'wolf');

function breathe(app, rng) {
  const listed = spellsOf(app, 'wolf').find((s) => s.id === 'action:cold-breath');
  assert.ok(listed, 'the action lists with the spells');
  const offered = [asTarget(app.state.characters[0], 'character')];
  const plan = /** @type {any} */ (castPlan(app, wolfOf(app), listed, offered));
  assert.equal(plan.ok, true, plan.message);
  resolveCast(app, plan, /** @type {any} */ ({ mode: 'normal', targets: 'hero' }), {
    writeBack: (next) => {
      app.state.creatures = replaceById(app.state.creatures, next);
    },
    rng: seq(rng),
  });
  return plan;
}

test('a creature action casts as a save spell with its own DC and is spent', () => {
  const app = stubApp();
  // The damage rolls 5 and 7, and the save rolls 2 and fails.
  const plan = breathe(app, [face(8, 5), face(8, 7), face(20, 2)]);
  assert.equal(plan.dc, 13);
  assert.equal(plan.free?.slotLevel, 0);
  assert.equal(getHP(app.state.characters[0]).current, 40 - 12);
  assert.equal(wolfOf(app).actions[0].spent, true);
  assert.equal(
    spellsOf(app, 'wolf').some((s) => s.id === 'action:cold-breath'),
    false,
    'a spent action leaves the list',
  );
});

test("a recharge roll at the start of the creature's turn readies the action", () => {
  const app = stubApp();
  breathe(app, [face(8, 5), face(8, 7), face(20, 2)]);
  startTurnEffects(app, 'hero', { rng: () => 0.99 });
  assert.equal(wolfOf(app).actions[0].spent, true, 'another turn rolls nothing');
  startTurnEffects(app, 'wolf', { rng: () => face(6, 3) });
  assert.equal(wolfOf(app).actions[0].spent, true);
  assert.ok(app.log.some((l) => /Cold Breath does not recharge \(d6: 3\)/.test(l)));
  startTurnEffects(app, 'wolf', { rng: () => face(6, 6) });
  assert.equal(wolfOf(app).actions[0].spent, undefined);
  assert.ok(app.log.some((l) => /Cold Breath recharges \(d6: 6\)/.test(l)));
});

test('the end of a fight readies every spent action', () => {
  const app = stubApp();
  const before = app.state.creatures;
  endFightEffects(app);
  assert.equal(app.state.creatures, before, 'nothing spent keeps the roster');
  breathe(app, [face(8, 5), face(8, 7), face(20, 2)]);
  endFightEffects(app);
  assert.equal(wolfOf(app).actions[0].spent, undefined);
});
