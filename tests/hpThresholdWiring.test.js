import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { applyToTarget } from '../src/app/combatantWrites.js';
import { slayCombatant } from '../src/app/slay.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { createCondition } from '../src/entities/Conditions.js';
import { isDead } from '../src/entities/DeathSaves.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of a spell that reads the hit points of its targets: the HP pool
 * of Sleep and Color Spray, which no save resists, the chip that damage ends,
 * and the kill of Power Word Kill.
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
      cantrips: [],
      known: [],
      prepared: ['sleep', 'color-spray', 'power-word-kill'],
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
const pc = (app, id) => app.state.characters.find((c) => c.id === id);

test('a pool spell asks for no DC or save roll, and lists its targets by name', () => {
  const app = stubApp([foe('goblin', 7)]);
  const p = plan(app, 'sleep', ['goblin']);
  assert.equal(p.saveAbility, null);
  assert.equal(
    p.fields.some((f) => f.name === 'dc' || f.name === 'mode'),
    false,
  );
  const targets = p.fields.find((f) => f.name === 'targets');
  assert.equal(targets.options[0].label, 'Goblin');
});

test('Sleep reaches the lowest HP first, and leaves out a target the pool cannot cover', () => {
  const app = stubApp([foe('ogre', 40), foe('goblin', 7), foe('kobold', 5)]);
  const p = plan(app, 'sleep', ['ogre', 'goblin', 'kobold']);
  resolve(app, p, { targets: 'ogre,goblin,kobold', slot: '1' }, five(3));
  assert.deepEqual(app.log.slice(-4), [
    'Sleep rolls a pool of 15 HP (5d8: 3, 3, 3, 3, 3).',
    'Kobold is affected (within the pool), Unconscious.',
    'Goblin is affected (within the pool), Unconscious.',
    'Ogre is unaffected (the pool runs out).',
  ]);
  const chip = creature(app, 'goblin').conditions[0];
  assert.equal(chip.name, 'Unconscious');
  assert.equal(chip.rounds, 10);
  assert.equal(chip.source.endsOnDamage, true);
  assert.equal(creature(app, 'ogre').conditions.length, 0);
});

test('a higher slot rolls two more dice for each level', () => {
  const app = stubApp([foe('goblin', 7)]);
  resolve(app, plan(app, 'sleep', ['goblin']), { targets: 'goblin', slot: '2' }, []);
  assert.ok(app.log.includes('Sleep rolls a pool of 7 HP (7d8: 1, 1, 1, 1, 1, 1, 1).'));
});

test('the pool reads HP at the cast, so a target downed while the dialog sat open is passed over', () => {
  const app = stubApp([foe('goblin', 7)]);
  const p = plan(app, 'sleep', ['goblin']);
  app.state.creatures = [{ ...creature(app, 'goblin'), currentHP: 0 }];
  resolve(app, p, { targets: 'goblin', slot: '1' }, five(3));
  assert.ok(app.log.includes('Goblin is unaffected (at 0 HP).'));
});

test('damage wakes a sleeping creature or character, and the log says so', () => {
  const app = stubApp([foe('goblin', 7)]);
  resolve(
    app,
    plan(app, 'sleep', ['goblin', 'fighter']),
    { targets: 'goblin,fighter', slot: '1' },
    [...five(8)],
  );
  assert.equal(pc(app, 'fighter').conditions[0].name, 'Unconscious');
  assert.equal(pc(app, 'fighter').conditions[1].name, 'Prone');
  applyToTarget(app, 'goblin', 2, false);
  applyToTarget(app, 'fighter', 2, false);
  // The sleeper wakes up still prone.
  const names = (/** @type {any[]} */ list) => list.map((c) => c.name);
  assert.deepEqual(names(creature(app, 'goblin').conditions), ['Prone']);
  assert.deepEqual(names(pc(app, 'fighter').conditions), ['Prone']);
  assert.ok(app.log.includes('Goblin is no longer Unconscious (Sleep).'));
  assert.ok(app.log.includes('Fighter is no longer Unconscious (Sleep).'));
});

test('a heal leaves the sleep in place', () => {
  const app = stubApp([foe('goblin', 7)]);
  resolve(app, plan(app, 'sleep', ['goblin']), { targets: 'goblin', slot: '1' }, five(8));
  applyToTarget(app, 'goblin', 2, true);
  assert.equal(creature(app, 'goblin').conditions.length, 2);
});

test('a sleeper immune to Prone falls unconscious without the Prone chip', () => {
  const app = stubApp([foe('goblin', 7, { conditionImmunities: ['prone'] })]);
  resolve(app, plan(app, 'sleep', ['goblin']), { targets: 'goblin', slot: '1' }, five(8));
  const chips = creature(app, 'goblin').conditions.map((/** @type {any} */ c) => c.name);
  assert.deepEqual(chips, ['Unconscious']);
});

test('Color Spray passes over a blinded target, and blinds until the end of the next turn', () => {
  const blind = { ...foe('bat', 3), conditions: [createCondition('Blinded')] };
  const app = stubApp([blind, foe('goblin', 7)]);
  app.state.combat = startCombat(
    [createParticipant('mage', 20), createParticipant('bat', 5), createParticipant('goblin', 5)],
    (x) => x.id,
  );
  const tens = Array.from({ length: 6 }, () => face(10, 2));
  resolve(
    app,
    plan(app, 'color-spray', ['bat', 'goblin']),
    { targets: 'bat,goblin', slot: '1' },
    tens,
  );
  assert.ok(app.log.includes('Bat is unaffected (already Blinded).'));
  const chip = creature(app, 'goblin').conditions.find((c) => c.name === 'Blinded');
  assert.deepEqual(chip.expires, { who: 'mage', at: 'end', count: 2 });
});

test('Power Word Kill kills a creature at or under 100 HP and leaves a bigger one alone', () => {
  const app = stubApp([foe('troll', 84), foe('giant', 150)]);
  resolve(app, plan(app, 'power-word-kill', ['troll']), { target: 'troll' }, []);
  assert.equal(creature(app, 'troll').currentHP, 0);
  assert.ok(app.log.includes('Troll is affected (100 HP or fewer).'));
  assert.ok(app.log.includes('Defeated Troll.'));
  resolve(app, plan(app, 'power-word-kill', ['giant']), { target: 'giant' }, []);
  assert.equal(creature(app, 'giant').currentHP, 150);
  assert.ok(app.log.includes('Giant is unaffected (over 100 HP).'));
});

test('Power Word Kill kills a character through the tracker and ends its spell', () => {
  const app = stubApp([]);
  app.state.characters = replaceById(app.state.characters, {
    ...pc(app, 'fighter'),
    concentration: { spellId: 'bless', spellName: 'Bless' },
  });
  resolve(app, plan(app, 'power-word-kill', ['fighter']), { target: 'fighter' }, []);
  const fighter = pc(app, 'fighter');
  assert.equal(isDead(fighter), true);
  assert.equal(fighter.resources.find((r) => r.id === 'hp').current, 30, 'HP is not touched');
  assert.equal(fighter.concentration ?? null, null);
  assert.ok(app.log.includes('Fighter dies.'));
  assert.ok(app.log.includes('Fighter loses concentration on Bless.'));
});

test('a kill of the dead, the defeated, or the missing writes nothing', () => {
  const app = stubApp([foe('rat', 1)]);
  assert.equal(slayCombatant(app, 'nobody'), false);
  assert.equal(slayCombatant(app, 'rat'), true);
  assert.equal(slayCombatant(app, 'rat'), false);
  assert.equal(slayCombatant(app, 'fighter'), true);
  assert.equal(slayCombatant(app, 'fighter'), false);
  assert.equal(app.log.filter((l) => l === 'Fighter dies.').length, 1);
});

test('a target the roster lost reads as HP unknown, and the pool lets it through', () => {
  const app = stubApp([foe('goblin', 7)]);
  const p = plan(app, 'sleep', ['goblin']);
  app.state.creatures = [];
  resolve(app, p, { targets: 'goblin', slot: '1' }, five(3));
  assert.ok(app.log.includes('Goblin is affected (HP unknown), Unconscious (untracked).'));
});

test('a character with no HP pool reads as HP unknown', () => {
  const app = stubApp([]);
  const fighter = pc(app, 'fighter');
  app.state.characters = replaceById(app.state.characters, {
    ...fighter,
    resources: fighter.resources.filter((r) => r.id !== 'hp'),
  });
  resolve(app, plan(app, 'sleep', ['fighter']), { targets: 'fighter', slot: '1' }, five(3));
  assert.ok(app.log.includes('Fighter is affected (HP unknown), Unconscious.'));
});

test('a Player tab reads the Sleep pool and its targets without an HP number or reason', () => {
  const app = stubApp([foe('ogre', 40), foe('goblin', 7), foe('kobold', 5)]);
  const p = plan(app, 'sleep', ['ogre', 'goblin', 'kobold']);
  resolve(app, p, { targets: 'ogre,goblin,kobold', slot: '1' }, five(3));
  assert.deepEqual(app.playerLog.slice(-4), [
    'Sleep rolls an HP pool (5d8).',
    'Kobold is affected, Unconscious.',
    'Goblin is affected, Unconscious.',
    'Ogre is unaffected.',
  ]);
});

test('a Player tab reads Power Word Kill without the HP limit', () => {
  const app = stubApp([foe('troll', 84), foe('giant', 150)]);
  resolve(app, plan(app, 'power-word-kill', ['troll']), { target: 'troll' }, []);
  resolve(app, plan(app, 'power-word-kill', ['giant']), { target: 'giant' }, []);
  assert.ok(app.playerLog.includes('Troll is affected.'));
  assert.ok(app.playerLog.includes('Giant is unaffected.'));
  assert.equal(
    app.playerLog.some((line) => line.includes('100 HP')),
    false,
  );
});
