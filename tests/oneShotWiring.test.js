import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/spellCast.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of the one-shot chips: Guiding Bolt leaves advantage on the next
 * attack against its target, and Vicious Mockery leaves disadvantage on the
 * next attack of its target. Each chip ends on the roll it slants.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
const face = (sides, value) => (value - 1) / sides + 1e-9;
const d20 = (value) => face(20, value);

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A level-11 wizard at 20 of 40 HP, with 1st- and 3rd-level slots. Save DC 15. */
function mage() {
  return /** @type {any} */ ({
    id: 'mage',
    name: 'Mage',
    race: 'human',
    classes: [{ classId: 'wizard', level: 11 }],
    level: 11,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      { ...createResource('hp', 'Hit points', 'health', 40), current: 20 },
      createResource('slots-1', 'Level 1 slots', 'mana', 2),
      createResource('slots-3', 'Level 3 slots', 'mana', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: {
      cantrips: ['vicious-mockery'],
      known: [],
      prepared: ['guiding-bolt', 'faerie-fire'],
    },
    proficiencies: undefined,
  });
}

/** A hostile creature on the party's tile, with a +0 CON save. */
function foe(id, over = {}) {
  return createCreature(id, id[0].toUpperCase() + id.slice(1), {
    disposition: 'hostile',
    maxHP: 40,
    stats: { AC: 12 },
    location: HERE,
    level: 1,
    ...over,
  });
}

/** A stub app with the mage and the given foes. */
function stubApp(creatures = [foe('ogre')]) {
  return baseStubApp({
    state: { characters: [mage()], creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

/** Put the app in a fight with the mage acting first. */
function fight(app) {
  app.state.combat = startCombat(
    [createParticipant('mage', 20), ...app.state.creatures.map((c) => createParticipant(c.id, 10))],
    (p) => p.id,
  );
}

/** Cast `id` from the live mage, with the dialog answers given. */
function cast(app, id, values, rng) {
  const s = spellById(id);
  const caster = app.state.characters[0];
  const plan = /** @type {any} */ (castPlan(app, caster, s, rosterTargets(app, s)));
  assert.equal(plan.ok, true, plan.message);
  resolveCast(app, plan, /** @type {any} */ ({ mode: 'auto', ...values }), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng: seq(rng),
  });
  return plan;
}

const creature = (app, id) => app.state.creatures.find((c) => c.id === id);

test('a Guiding Bolt hit leaves a one-shot advantage chip until the end of the caster next turn', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'guiding-bolt', { target: 'ogre' }, [d20(15)]);
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Guiding Bolt');
  assert.deepEqual(chip.mods, { attacksAgainst: 'advantage', once: true });
  assert.deepEqual(chip.expires, { who: 'mage', at: 'end', count: 2 });
});

test('the next spell attack against the target rolls with advantage and ends the chip', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'guiding-bolt', { target: 'ogre' }, [d20(15)]);
  // The first d20 misses and the second hits, so only an advantage roll hits.
  cast(app, 'guiding-bolt', { target: 'ogre' }, [d20(1), d20(15)]);
  const ends = app.log.indexOf("Ogre's Guiding Bolt ends.");
  assert.ok(ends > 0);
  assert.match(app.log[ends + 1], /hits Ogre/);
  // The hit leaves a fresh chip, because the old one ended before it landed.
  assert.equal(creature(app, 'ogre').conditions.filter((c) => c.name === 'Guiding Bolt').length, 1);
});

test('a failed save against Vicious Mockery leaves a one-shot disadvantage chip', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'vicious-mockery', { target: 'ogre' }, [d20(2), face(4, 3)]);
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Vicious Mockery');
  assert.deepEqual(chip.mods, { attacks: 'disadvantage', once: true });
  assert.deepEqual(chip.expires, { who: 'ogre', at: 'end', count: 1 });
});

test('Faerie Fire gives a standing advantage chip that no attack ends', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'faerie-fire', { target: 'ogre' }, [d20(2)]);
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Faerie Fire');
  assert.deepEqual(chip.mods, { attacksAgainst: 'advantage' });
});
