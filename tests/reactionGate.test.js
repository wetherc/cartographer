import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reactionCaster, reactionPlan } from '../src/app/reactionGate.js';
import { spend } from '../src/combat/ActionBudget.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCharacter } from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const spellById = (/** @type {string} */ id) => DEFAULT_SPELLS.find((s) => s.id === id);
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A level 5 wizard who knows Shield, with `slots` level 1 slots. */
function mage(slots = 2, conditions = /** @type {any[]} */ ([])) {
  return /** @type {any} */ ({
    ...createCharacter('mage', 'Mage', { INT: 16 }),
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      createResource('slots-1', 'Level 1 slots', 'mana', slots),
    ],
    conditions,
    spellbook: { cantrips: [], known: ['shield'], prepared: ['shield'] },
  });
}

/**
 * @param {{ role?: string, bound?: string | null, fight?: boolean,
 *   mageReacted?: boolean, slots?: number, conditions?: any[] }} [opts]
 */
function stubApp(opts = {}) {
  const app = baseStubApp({
    state: {
      characters: [mage(opts.slots, opts.conditions), createCharacter('hero', 'Hero', {})],
      creatures: [],
      role: /** @type {any} */ (opts.role ?? 'gm'),
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    actions: { getBoundCharacterId: () => opts.bound ?? null },
  });
  if (opts.fight) {
    const self = createParticipant('mage', 5);
    app.state.combat = startCombat(
      [createParticipant('hero', 20), opts.mageReacted ? spend(self, 'reaction') : self],
      (/** @type {any} */ x) => x.id,
    );
  }
  return app;
}

test('reactionCaster lets a GM react for a defender that can act', () => {
  const caster = reactionCaster(stubApp(), 'mage', 'hero');
  assert.equal(caster?.id, 'mage');
  assert.equal(caster?.found.entity.name, 'Mage');
  assert.equal(caster?.combat, null);
  assert.equal(caster?.participant, null);
});

test('reactionCaster refuses the attacker, an unknown id, and a downed or stunned defender', () => {
  assert.equal(reactionCaster(stubApp(), 'mage', 'mage'), null);
  assert.equal(reactionCaster(stubApp(), 'nobody', 'hero'), null);
  const stunned = stubApp({ conditions: [{ name: 'Stunned', rounds: null }] });
  assert.equal(reactionCaster(stunned, 'mage', 'hero'), null);
  const app = stubApp();
  app.state.characters[0].resources[0] = { ...app.state.characters[0].resources[0], current: 0 };
  app.state.characters[0] = {
    ...app.state.characters[0],
    deathSaves: { successes: 0, failures: 0 },
  };
  assert.equal(reactionCaster(app, 'mage', 'hero'), null);
});

test('reactionCaster asks for a viewer who may act for the defender', () => {
  assert.equal(reactionCaster(stubApp({ role: 'player', bound: 'hero' }), 'mage', 'hero'), null);
  assert.ok(reactionCaster(stubApp({ role: 'player', bound: 'mage' }), 'mage', 'hero'));
});

test('reactionCaster needs an unspent reaction in a fight', () => {
  const caster = reactionCaster(stubApp({ fight: true }), 'mage', 'hero');
  assert.equal(caster?.participant?.id, 'mage');
  assert.ok(caster?.combat);
  assert.equal(reactionCaster(stubApp({ fight: true, mageReacted: true }), 'mage', 'hero'), null);
});

test('reactionCaster with fight: true refuses outside a fight', () => {
  assert.equal(reactionCaster(stubApp(), 'mage', 'hero', { fight: true }), null);
  assert.ok(reactionCaster(stubApp({ fight: true }), 'mage', 'hero', { fight: true }));
});

test('reactionPlan builds the self-cast plan, or null with no slot to spend', () => {
  const shield = /** @type {any} */ (spellById('shield'));
  for (const fight of [false, true]) {
    const app = stubApp({ fight });
    const caster = /** @type {any} */ (reactionCaster(app, 'mage', 'hero'));
    assert.ok(reactionPlan(app, caster, shield)?.ok, `fight: ${fight}`);
  }
  const broke = stubApp({ slots: 0 });
  assert.equal(
    reactionPlan(broke, /** @type {any} */ (reactionCaster(broke, 'mage', 'hero')), shield),
    null,
  );
});

test('reactionPlan refuses a spell that cannot target the defender', () => {
  const app = stubApp();
  const caster = /** @type {any} */ (reactionCaster(app, 'mage', 'hero'));
  const bolt = /** @type {any} */ (spellById('fire-bolt'));
  assert.equal(reactionPlan(app, caster, bolt), null);
});
