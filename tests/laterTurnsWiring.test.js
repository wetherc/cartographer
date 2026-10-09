import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import {
  dropTurnChips,
  endFightEffects,
  endTurnEffects,
  startTurnEffects,
} from '../src/app/turnEffects.js';
import { applyConditionToTarget, endSpellEffects } from '../src/app/combatantWrites.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { createCondition } from '../src/entities/Conditions.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

/**
 * The wiring of the spells that reach past the turn they are cast on: the
 * chip a cast leaves on its target, the chip a caster keeps for a repeat, and
 * what the start and the end of a turn do to both.
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

/** A caster who knows every later-turn spell, with slots from 1st to 6th. */
function mage() {
  return /** @type {any} */ ({
    id: 'mage',
    name: 'Mage',
    race: 'human',
    classes: [{ classId: 'wizard', level: 11 }],
    level: 11,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 10 },
    resources: [1, 2, 4, 6].map((n) => createResource(`slots-${n}`, `Level ${n} slots`, 'mana', 2)),
    // A pouch covers the material of every spell here.
    inventory: [item('pouch', 'Component Pouch', { spellFocus: true })],
    conditions: [],
    spellbook: {
      cantrips: [],
      known: [],
      prepared: ['witch-bolt', 'acid-arrow', 'spiritual-weapon', 'phantasmal-killer', 'sunbeam'],
    },
    proficiencies: undefined,
  });
}

/** A hostile creature on the party's tile. */
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

/** A stub app with the mage and the given foes, and a recorder for toasts. */
function stubApp(creatures = [foe('ogre')]) {
  /** @type {string[]} */
  const toasted = [];
  const app = baseStubApp({
    state: { characters: [mage()], creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => toasted.push(message) },
  });
  app.toasted = toasted;
  return app;
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
  resolveCast(app, plan, /** @type {any} */ ({ mode: 'normal', ...values }), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng: seq(rng),
  });
  return plan;
}

const liveMage = (app) => app.state.characters[0];
const creature = (app, id) => app.state.creatures.find((c) => c.id === id);

test('Spiritual Weapon opens a repeat, and the repeat spends no slot', () => {
  const app = stubApp();
  cast(app, 'spiritual-weapon', { slot: '2', target: 'ogre' }, [d20(15), face(8, 3)]);
  const chip = liveMage(app).conditions.find((c) => c.name === 'Spiritual Weapon');
  assert.deepEqual(chip.source.repeat, { slotLevel: 2 });
  assert.equal(chip.rounds, 10);
  const slots = () => liveMage(app).resources.find((r) => r.id === 'slots-2').current;
  assert.equal(slots(), 1);

  const plan = cast(app, 'spiritual-weapon', { target: 'ogre' }, [d20(15), face(8, 3)]);
  assert.deepEqual(plan.free, { slotLevel: 2, repeat: true });
  assert.equal(
    plan.fields.some((f) => f.name === 'slot'),
    false,
    'a repeat offers no slot',
  );
  assert.equal(slots(), 1, 'the repeat spent nothing');
  assert.ok(app.log.includes('Mage repeats Spiritual Weapon.'));
});

test('a repeat costs the bonus action that the spell costs on later turns', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'spiritual-weapon', { slot: '2', target: 'ogre' }, [d20(15)]);
  const s = spellById('spiritual-weapon');
  const plan = /** @type {any} */ (castPlan(app, liveMage(app), s, rosterTargets(app, s)));
  assert.equal(plan.actionCost, 'bonus');
});

test('Witch Bolt opens its repeat only on a hit, locked to the creature it hit', () => {
  const app = stubApp([foe('ogre'), foe('imp')]);
  cast(app, 'witch-bolt', { slot: '1', target: 'ogre' }, [d20(2)]);
  assert.equal(liveMage(app).conditions.length, 1, 'only the Concentrating chip');

  cast(app, 'witch-bolt', { slot: '1', target: 'ogre' }, [d20(15)]);
  const chip = liveMage(app).conditions.find((c) => c.name === 'Witch Bolt');
  assert.deepEqual(chip.source.repeat, { slotLevel: 1, targetIds: ['ogre'] });

  const s = spellById('witch-bolt');
  const plan = /** @type {any} */ (castPlan(app, liveMage(app), s, rosterTargets(app, s)));
  assert.deepEqual(
    plan.targets.map((t) => t.id),
    ['ogre'],
  );
  const hp = creature(app, 'ogre').currentHP;
  resolveCast(app, plan, /** @type {any} */ ({ target: 'ogre', mode: 'normal' }), {
    writeBack: () => {},
    rng: seq([face(12, 12)]),
  });
  assert.equal(creature(app, 'ogre').currentHP, hp - 12, 'the repeat hits for 1d12 with no roll');

  app.state.creatures = app.state.creatures.filter((c) => c.id !== 'ogre');
  const lost = castPlan(app, liveMage(app), s, rosterTargets(app, s));
  assert.deepEqual(lost, { ok: false, message: 'Witch Bolt has lost its target.' });
});

test('the end of the concentration names the repeat that ends', () => {
  const app = stubApp();
  cast(app, 'witch-bolt', { slot: '1', target: 'ogre' }, [d20(15)]);
  endSpellEffects(app, 'mage', 'witch-bolt');
  assert.ok(app.log.includes("Mage's Witch Bolt ends."));
});

test("Acid Arrow burns its target at the end of that target's next turn, once", () => {
  const app = stubApp();
  fight(app);
  cast(app, 'acid-arrow', { slot: '2', target: 'ogre' }, [d20(15)]);
  const chip = creature(app, 'ogre').conditions[0];
  assert.equal(chip.name, 'Acid Arrow');
  assert.equal(chip.rounds, null);
  assert.deepEqual(chip.expires, { who: 'ogre', at: 'end', count: 1 });
  const hp = creature(app, 'ogre').currentHP;

  endTurnEffects(app, 'mage', { rng: seq([]) });
  assert.equal(creature(app, 'ogre').conditions.length, 1, "the mage's turn is not the ogre's");

  endTurnEffects(app, 'ogre', { rng: seq([face(4, 4), face(4, 4)]) });
  assert.equal(creature(app, 'ogre').currentHP, hp - 8);
  assert.deepEqual(creature(app, 'ogre').conditions, []);
  assert.ok(app.log.some((l) => /^Acid Arrow deals .* to Ogre\.$/.test(l)));
  assert.ok(app.log.includes('Ogre is no longer affected by Acid Arrow.'));
});

test('an Acid Arrow miss splashes for half and leaves no chip', () => {
  const app = stubApp();
  cast(app, 'acid-arrow', { slot: '2', target: 'ogre' }, [
    d20(2),
    face(4, 4),
    face(4, 4),
    face(4, 4),
    face(4, 4),
  ]);
  assert.equal(creature(app, 'ogre').currentHP, 40 - 8);
  assert.deepEqual(creature(app, 'ogre').conditions, []);
  assert.ok(app.log.some((l) => /misses Ogre, splashing for 8\.$/.test(l)));
});

test('outside a fight, a chip that ends at a turn boundary lasts one round', () => {
  const app = stubApp();
  cast(app, 'sunbeam', { slot: '6', targets: 'ogre', dc: '30' }, [d20(2)]);
  const blinded = creature(app, 'ogre').conditions.find((c) => c.name === 'Blinded');
  assert.equal(blinded.rounds, 1);
  assert.equal(blinded.expires, undefined);
});

test("Sunbeam blinds until the start of the caster's next turn", () => {
  const app = stubApp();
  fight(app);
  cast(app, 'sunbeam', { slot: '6', targets: 'ogre', dc: '30' }, [d20(2)]);
  const blinded = creature(app, 'ogre').conditions.find((c) => c.name === 'Blinded');
  assert.deepEqual(blinded.expires, { who: 'mage', at: 'start', count: 1 });
  startTurnEffects(app, 'ogre');
  assert.ok(creature(app, 'ogre').conditions.some((c) => c.name === 'Blinded'));
  startTurnEffects(app, 'mage');
  assert.equal(
    creature(app, 'ogre').conditions.some((c) => c.name === 'Blinded'),
    false,
  );
  assert.ok(
    liveMage(app).conditions.some((c) => c.name === 'Sunbeam'),
    'the repeat stays',
  );
});

test('Phantasmal Killer deals its damage on a failed retry and none on a success', () => {
  const app = stubApp();
  cast(app, 'phantasmal-killer', { slot: '4', target: 'ogre', dc: '30' }, [d20(2)]);
  const frightened = creature(app, 'ogre').conditions[0];
  assert.equal(frightened.name, 'Frightened');
  assert.equal(frightened.source.saveEnds, true);
  assert.equal(frightened.ongoing.damage[0].count, 4);

  endTurnEffects(app, 'ogre', {
    rng: seq([d20(2), face(10, 1), face(10, 1), face(10, 1), face(10, 1)]),
  });
  assert.equal(creature(app, 'ogre').currentHP, 36, 'one failed retry: 4d10 at their lowest');
  assert.equal(creature(app, 'ogre').conditions.length, 1);

  // A save at DC 30 needs a chip that fails no roll. Lower the DC on the chip.
  const eased = { ...frightened, source: { ...frightened.source, saveDC: 1 } };
  app.state.creatures = [{ ...creature(app, 'ogre'), conditions: [eased] }];
  endTurnEffects(app, 'ogre', { rng: seq([d20(15)]) });
  assert.equal(creature(app, 'ogre').currentHP, 36, 'a success deals nothing');
  assert.deepEqual(creature(app, 'ogre').conditions, []);
});

test('a downed combatant takes no damage at its turn end, and its boundary still counts', () => {
  const app = stubApp();
  const acid = createCondition('Acid Arrow', null, {
    expires: { who: 'ogre', at: 'end', count: 1 },
    ongoing: { damage: [{ count: 2, sides: 4, damageType: 'acid' }] },
  });
  app.state.creatures = [{ ...creature(app, 'ogre'), currentHP: 0, conditions: [acid] }];
  endTurnEffects(app, 'ogre', { rng: seq([]) });
  assert.deepEqual(creature(app, 'ogre').conditions, []);
  assert.equal(
    app.log.some((l) => l.startsWith('Acid Arrow deals')),
    false,
  );
});

test('the end of a fight drops every chip that waits on a turn boundary', () => {
  const app = stubApp();
  const before = app.state.creatures;
  dropTurnChips(app);
  assert.equal(app.state.creatures, before, 'nothing to drop keeps the roster');
  const shield = createCondition('Shield', null, {
    expires: { who: 'mage', at: 'start', count: 1 },
  });
  app.state.characters = [{ ...liveMage(app), conditions: [shield] }];
  dropTurnChips(app);
  assert.deepEqual(liveMage(app).conditions, []);
  assert.ok(app.log.includes('Mage is no longer affected by Shield.'));
});

test('a shorter chip of the same name from another cast leaves the longer one in place', () => {
  const app = stubApp();
  const long = createCondition('Blinded', 10, {
    source: { spellId: 'blindness-deafness', spellName: 'Blindness/Deafness', casterId: 'x' },
  });
  app.state.creatures = [{ ...creature(app, 'ogre'), conditions: [long] }];
  const landed = applyConditionToTarget(app, 'ogre', 'Blinded', 1, {
    spellId: 'sunbeam',
    spellName: 'Sunbeam',
    casterId: 'mage',
  });
  assert.equal(landed, true);
  assert.equal(creature(app, 'ogre').conditions[0], long);
});

test('later damage lands on a projectile hit and on a failed save with no condition', () => {
  const app = stubApp();
  fight(app);
  const acid = { damage: [{ count: 1, sides: 4, damageType: 'acid' }] };
  const rays = {
    ...spellById('scorching-ray'),
    id: 'acid-rays',
    name: 'Acid Rays',
    effect: { ...spellById('scorching-ray').effect, ongoing: acid },
  };
  const spray = {
    ...spellById('burning-hands'),
    id: 'acid-spray',
    name: 'Acid Spray',
    effect: { ...spellById('burning-hands').effect, ongoing: { ...acid, until: 'caster-end' } },
  };
  const book = liveMage(app).spellbook;
  app.state.characters = [
    {
      ...liveMage(app),
      spellbook: { ...book, prepared: [...book.prepared, 'acid-rays', 'acid-spray'] },
    },
  ];
  for (const [s, values, rng] of [
    [rays, { slot: '2', allocation: 'ogre:3' }, [d20(15), 0, 0, d20(15), 0, 0, d20(15)]],
    [spray, { slot: '1', targets: 'ogre', dc: '30' }, [0, 0, 0, d20(2)]],
  ]) {
    const plan = /** @type {any} */ (castPlan(app, liveMage(app), s, rosterTargets(app, s)));
    assert.equal(plan.ok, true, plan.message);
    resolveCast(app, plan, /** @type {any} */ ({ mode: 'normal', ...values }), {
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
      rng: seq(/** @type {number[]} */ (rng)),
    });
  }
  const names = creature(app, 'ogre').conditions.map((c) => c.name);
  assert.deepEqual(names, ['Acid Rays', 'Acid Spray']);
  const spray2 = creature(app, 'ogre').conditions[1];
  assert.deepEqual(spray2.expires, { who: 'mage', at: 'end', count: 2 });
  endTurnEffects(app, 'mage', { rng: seq([]) });
  const counted = creature(app, 'ogre').conditions.find((c) => c.name === 'Acid Spray');
  assert.equal(counted?.expires?.count, 1, 'the first caster turn end counts the chip down');
  endTurnEffects(app, 'mage', { rng: seq([]) });
  assert.deepEqual(
    creature(app, 'ogre').conditions.map((c) => c.name),
    ['Acid Rays'],
    'the second caster turn end removes it',
  );
});

test('a turn end that counts no chip down keeps every entity and both rosters', () => {
  const app = stubApp();
  const { characters, creatures } = app.state;
  endTurnEffects(app, 'ogre', { rng: seq([]) });
  assert.equal(app.state.characters, characters);
  assert.equal(app.state.creatures, creatures);
});

test('a dying character takes later-turn damage as a failed death save', () => {
  const app = stubApp();
  const acid = createCondition('Acid Arrow', null, {
    expires: { who: 'mage', at: 'end', count: 1 },
    ongoing: { damage: [{ count: 2, sides: 4, damageType: 'acid' }] },
  });
  const dying = {
    ...liveMage(app),
    resources: [{ ...createResource('hp', 'HP', 'custom', 30), current: 0 }],
    deathSaves: { successes: 0, failures: 0, stable: false },
    conditions: [acid],
  };
  app.state.characters = [dying];
  endTurnEffects(app, 'mage', { rng: seq([]) });
  assert.equal(liveMage(app).deathSaves.failures, 1);
  assert.ok(app.log.some((l) => l.startsWith('Acid Arrow deals')));
});

test('a dead character takes no later-turn damage', () => {
  const app = stubApp();
  const acid = createCondition('Acid Arrow', null, {
    expires: { who: 'mage', at: 'end', count: 1 },
    ongoing: { damage: [{ count: 2, sides: 4, damageType: 'acid' }] },
  });
  app.state.characters = [
    {
      ...liveMage(app),
      resources: [{ ...createResource('hp', 'HP', 'custom', 30), current: 0 }],
      deathSaves: { successes: 0, failures: 3, stable: false },
      conditions: [acid],
    },
  ];
  endTurnEffects(app, 'mage', { rng: seq([]) });
  assert.equal(
    app.log.some((l) => l.startsWith('Acid Arrow deals')),
    false,
  );
});

test('the end of a fight deals the later-turn damage a boundary chip still owes', () => {
  const app = stubApp([foe('ogre'), foe('imp')]);
  const acid = (/** @type {string} */ who) =>
    createCondition('Acid Arrow', null, {
      expires: { who, at: 'end', count: 1 },
      ongoing: { damage: [{ count: 2, sides: 4, damageType: 'acid' }] },
    });
  const ogre = { ...creature(app, 'ogre'), conditions: [acid('ogre')] };
  const imp = { ...creature(app, 'imp'), currentHP: 0, conditions: [acid('imp')] };
  app.state.creatures = [ogre, imp];
  endFightEffects(app, { rng: seq([face(4, 2), face(4, 3)]) });
  assert.equal(creature(app, 'ogre').currentHP, 35);
  assert.deepEqual(creature(app, 'ogre').conditions, []);
  assert.deepEqual(creature(app, 'imp').conditions, []);
  assert.equal(app.log.filter((l) => l.startsWith('Acid Arrow deals')).length, 1);
});

test('a turn-end chip names the numbered foe it burns and frees', () => {
  const app = stubApp([
    { ...foe('o1'), name: 'Ogre' },
    { ...foe('o2'), name: 'Ogre' },
  ]);
  fight(app);
  cast(app, 'acid-arrow', { slot: '2', target: 'o2' }, [d20(15)]);
  endTurnEffects(app, 'o2', { rng: seq([face(4, 4), face(4, 4)]) });
  assert.ok(app.log.some((l) => /^Acid Arrow deals .* to Ogre 2\.$/.test(l)));
  assert.ok(app.log.includes('Ogre 2 is no longer affected by Acid Arrow.'));
});

test('the start of an unknown combatant turn grants and logs nothing', () => {
  const app = stubApp();
  startTurnEffects(app, 'nobody', { rng: seq([]) });
  assert.deepEqual(app.log, []);
});

test('Heroism chips of one name grant the largest temporary HP once', () => {
  const hero = (/** @type {number} */ n, /** @type {string} */ casterId) =>
    createCondition('Heroism', 10, { mods: { tempHPEachTurn: n }, source: { casterId } });
  const app = stubApp([
    { ...foe('ogre'), conditions: [createCondition('Heroism', 10), hero(3, 'a'), hero(5, 'b')] },
  ]);
  startTurnEffects(app, 'ogre', { rng: seq([]) });
  assert.equal(creature(app, 'ogre').bonusHP, 5);
});

test('a Haste chip that ends at a turn boundary leaves lethargy, logged after the end line', () => {
  const haste = createCondition('Haste', null, {
    mods: { extraAction: true },
    expires: { who: 'ogre', at: 'end', count: 1 },
  });
  const app = stubApp([{ ...foe('ogre'), conditions: [haste] }]);
  endTurnEffects(app, 'ogre', { rng: seq([]) });
  const ended = app.log.indexOf('Ogre is no longer affected by Haste.');
  const lethargic = app.log.findIndex((l) => l.startsWith('Ogre is lethargic'));
  assert.ok(ended >= 0 && lethargic > ended, app.log.join('\n'));
});

test('a combatant that leaves during its turn-end damage takes no more of it', () => {
  const app = stubApp();
  cast(app, 'phantasmal-killer', { slot: '4', target: 'ogre', dc: '30' }, [d20(2)]);
  const frightened = creature(app, 'ogre').conditions[0];
  // A second chip that burns on every turn end, beside the retry chip.
  const burn = createCondition('Burning', 3, {
    ongoing: { damage: [{ count: 1, sides: 4, damageType: 'fire' }] },
  });
  app.state.creatures = [{ ...creature(app, 'ogre'), conditions: [frightened, burn] }];
  const log = app.actions.logEvent;
  app.actions.logEvent = (/** @type {any} */ kind, /** @type {string} */ line) => {
    log(kind, line);
    if (line.includes(' deals ')) app.state.creatures = [];
  };
  endTurnEffects(app, 'ogre', { rng: seq([d20(2)]) });
  assert.equal(app.log.filter((l) => l.includes(' deals ')).length, 1);
});
