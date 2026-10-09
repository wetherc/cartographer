import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { applyConditionToTarget, applyToTarget } from '../src/app/combatantWrites.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { sourceSlant } from '../src/entities/SourceSlant.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of the creature-type rules: Sleep on a mixed group, a heal on an
 * undead target, and a condition that a creature is immune to.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
const face = (sides, value) => (value - 1) / sides + 1e-9;

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A party character with an HP pool and the given slots. */
function character(id, over = {}) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId: 'wizard', level: 17 }],
    level: 17,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      createResource('slots-1', 'Level 1 slots', 'mana', 2),
      createResource('slots-2', 'Level 2 slots', 'mana', 2),
      createResource('slots-9', 'Level 9 slots', 'mana', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: {
      cantrips: ['chill-touch'],
      known: [],
      prepared: ['sleep', 'cure-wounds'],
    },
    proficiencies: undefined,
    ...over,
  });
}

/** A hostile creature on the party's tile. */
function foe(id, maxHP, over = {}) {
  return createCreature(id, id[0].toUpperCase() + id.slice(1), {
    disposition: 'hostile',
    maxHP,
    stats: { AC: 12 },
    location: HERE,
    level: 1,
    ...over,
  });
}

/** A stub app with the mage, a fighter, and the given foes. */
function stubApp(creatures) {
  return baseStubApp({
    state: { characters: [character('mage'), character('fighter')], creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

/** The cast targets for these ids, the way the dialog lists them. */
const targetsOf = (app, ids) =>
  ids.map((id) => {
    const entity = [...app.state.characters, ...app.state.creatures].find((e) => e.id === id);
    return /** @type {any} */ ({ id, name: entity.name, ac: 12, conditions: entity.conditions });
  });

/** Plan a cast of `id` from the live mage against the ids given. */
function plan(app, id, ids) {
  const p = /** @type {any} */ (
    castPlan(app, app.state.characters[0], spellById(id), targetsOf(app, ids))
  );
  assert.equal(p.ok, true, p.message);
  return p;
}

/** Resolve a plan with the dialog answers given. */
function resolve(app, p, values, rng) {
  resolveCast(
    app,
    p,
    /** @type {any} */ ({ mode: 'normal', 'ignore-components': '1', ...values }),
    {
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
      rng: seq(rng),
    },
  );
}

const five = (value) => Array.from({ length: 5 }, () => face(8, value));
const creature = (app, id) => app.state.creatures.find((c) => c.id === id);
test('Sleep on a mixed group passes over the undead and the Charmed-immune', () => {
  const app = stubApp([
    foe('skeleton', 3, { creatureType: 'undead' }),
    foe('sprite', 2, { creatureType: 'fey', conditionImmunities: ['Charmed'] }),
    foe('goblin', 7, { creatureType: 'humanoid' }),
  ]);
  const p = plan(app, 'sleep', ['skeleton', 'sprite', 'goblin']);
  resolve(app, p, { targets: 'skeleton,sprite,goblin', slot: '1' }, five(2));
  assert.deepEqual(app.log.slice(-4), [
    'Sleep rolls a pool of 10 HP (5d8: 2, 2, 2, 2, 2).',
    'Goblin is affected (within the pool), Unconscious.',
    'Skeleton is unaffected (undead).',
    'Sprite is unaffected (immune to Charmed).',
  ]);
  assert.equal(creature(app, 'skeleton').conditions.length, 0);
  assert.equal(creature(app, 'goblin').conditions[0].name, 'Unconscious');
});

test('Cure Wounds has no effect on an undead creature', () => {
  const app = stubApp([foe('zombie', 20, { creatureType: 'undead' })]);
  app.state.creatures = [{ ...creature(app, 'zombie'), currentHP: 5 }];
  resolve(app, plan(app, 'cure-wounds', ['zombie']), { target: 'zombie', slot: '1' }, []);
  assert.ok(app.log.includes('Cure Wounds has no effect on Zombie (undead).'));
  assert.equal(creature(app, 'zombie').currentHP, 5);
});

test('a creature immune to a condition does not take its chip, and the log says so', () => {
  const app = stubApp([foe('golem', 20, { conditionImmunities: ['Poisoned'] })]);
  applyConditionToTarget(app, 'golem', 'Poisoned', 10);
  assert.ok(app.log.includes('Golem is immune to Poisoned.'));
  assert.equal(creature(app, 'golem').conditions.length, 0);
});

test('a Chill Touch hit stops healing until the start of the caster turn', () => {
  const app = stubApp([foe('goblin', 20)]);
  resolve(app, plan(app, 'chill-touch', ['goblin']), { target: 'goblin' }, [0.99]);
  const chip = creature(app, 'goblin').conditions.find((c) => c.name === 'Chill Touch');
  assert.deepEqual(chip?.mods, { noHealing: true });
  const hp = creature(app, 'goblin').currentHP;
  applyToTarget(app, 'goblin', 5, true);
  assert.equal(creature(app, 'goblin').currentHP, hp);
  assert.ok(app.log.includes('Goblin cannot regain hit points (Chill Touch).'));
  resolve(app, plan(app, 'cure-wounds', ['goblin']), { target: 'goblin', slot: '1' }, []);
  assert.ok(app.log.includes('Cure Wounds has no effect on Goblin, who cannot regain hit points.'));
  assert.equal(creature(app, 'goblin').currentHP, hp);
});

test('a Chill Touch hit on an undead target slants its attacks on the caster', () => {
  const app = stubApp([foe('skeleton', 20, { creatureType: 'undead' })]);
  resolve(app, plan(app, 'chill-touch', ['skeleton']), { target: 'skeleton' }, [0.99]);
  const chips = creature(app, 'skeleton').conditions;
  const undead = chips.find((c) => c.name === 'Chill Touch (undead)');
  assert.deepEqual(undead?.mods, { disadvantageVsSource: true });
  assert.equal(undead?.source?.casterId, 'mage');
  assert.ok(app.log.includes('Skeleton gains Chill Touch (undead).'));
  assert.equal(sourceSlant(chips, 'mage'), 'disadvantage');
  assert.equal(sourceSlant(chips, 'fighter'), null);
});

test('a Chill Touch hit on a living target leaves no undead chip', () => {
  const app = stubApp([foe('goblin', 20, { creatureType: 'humanoid' })]);
  resolve(app, plan(app, 'chill-touch', ['goblin']), { target: 'goblin' }, [0.99]);
  const names = creature(app, 'goblin').conditions.map((c) => c.name);
  assert.deepEqual(names, ['Chill Touch']);
  assert.equal(sourceSlant([], undefined), null);
});
