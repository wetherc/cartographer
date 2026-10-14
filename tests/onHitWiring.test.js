import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { applyOutcomes } from '../src/app/spellOutcomes.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { getHP } from '../src/entities/Character.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of an attack spell whose hit does two things: the save and the
 * condition a hit brings (Ray of Sickness), and the hit points a draining
 * hit gives back to its caster (Vampiric Touch).
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
      { ...createResource('hp', 'Hit points', 40), current: 20 },
      createResource('slots-1', 'Level 1 slots', 2),
      createResource('slots-3', 'Level 3 slots', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: [], prepared: ['ray-of-sickness', 'vampiric-touch'] },
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
  resolveCast(app, plan, /** @type {any} */ ({ mode: 'normal', ...values }), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng: seq(rng),
  });
  return plan;
}

const mageHP = (app) => getHP(app.state.characters[0])?.current;
const creature = (app, id) => app.state.creatures.find((c) => c.id === id);

test('the Ray of Sickness dialog shows the save beside the AC, and asks for the DC', () => {
  const app = stubApp();
  const s = spellById('ray-of-sickness');
  const plan = /** @type {any} */ (
    castPlan(app, app.state.characters[0], s, rosterTargets(app, s))
  );
  assert.equal(plan.saveAbility, 'CON');
  assert.equal(plan.targets[0].saveBonus, 0);
  const target = plan.fields.find((f) => f.name === 'target');
  assert.equal(target.options[0].label, 'Ogre (AC 13, CON +0)');
  const dc = plan.fields.find((f) => f.name === 'dc');
  assert.equal(dc.value, 15);
});

test('a hit that fails the save poisons the target until the end of the caster next turn', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'ray-of-sickness', { target: 'ogre' }, [d20(15), face(8, 3), face(8, 4), d20(5)]);
  assert.equal(creature(app, 'ogre').currentHP, 33);
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Poisoned');
  assert.ok(chip);
  assert.equal(chip.rounds, null);
  assert.deepEqual(chip.expires, { who: 'mage', at: 'end', count: 2 });
  assert.equal(chip.source.spellId, 'ray-of-sickness');
  assert.ok(app.log.includes('Ogre fails DC 15 (CON +0: 5), Poisoned.'));
  assert.ok(app.playerLog.includes('Ogre fails DC 15 (CON: 5), Poisoned.'));
});

test('a made save leaves no chip, and the log says so', () => {
  const app = stubApp();
  cast(app, 'ray-of-sickness', { target: 'ogre' }, [d20(15), face(8, 3), face(8, 4), d20(18)]);
  assert.equal(creature(app, 'ogre').conditions.length, 0);
  assert.ok(app.log.includes('Ogre saves DC 15 (CON +0: 18).'));
});

test('outside a fight the poison lasts one round', () => {
  const app = stubApp();
  cast(app, 'ray-of-sickness', { target: 'ogre' }, [d20(15), face(8, 3), face(8, 4), d20(5)]);
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Poisoned');
  assert.equal(chip.rounds, 1);
  assert.equal(chip.expires, undefined);
});

test('a hit with no save imposes its condition and logs it', () => {
  const app = stubApp();
  const ray = spellById('ray-of-sickness');
  const spell = { ...ray, effect: { ...ray.effect, onHit: { condition: 'Blinded' } } };
  const plan = /** @type {any} */ (
    castPlan(app, app.state.characters[0], spell, rosterTargets(app, spell))
  );
  assert.equal(plan.saveAbility, null);
  assert.equal(
    plan.fields.some((f) => f.name === 'dc'),
    false,
  );
  resolveCast(app, plan, /** @type {any} */ ({ mode: 'normal', target: 'ogre' }), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng: seq([d20(15), face(8, 3), face(8, 4)]),
  });
  const chip = creature(app, 'ogre').conditions.find((c) => c.name === 'Blinded');
  assert.equal(
    chip.rounds,
    null,
    'an instantaneous spell with no boundary leaves the GM to clear it',
  );
  assert.ok(app.log.includes('Ogre gains Blinded.'));
});

test('Vampiric Touch gives the caster half the damage it deals', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'vampiric-touch', { target: 'ogre' }, [d20(15), face(6, 3), face(6, 4), face(6, 6)]);
  assert.equal(creature(app, 'ogre').currentHP, 27);
  assert.equal(mageHP(app), 26, 'half of 13, rounded down');
  assert.ok(app.log.includes('Mage regains 6 HP from Vampiric Touch.'));
});

test('the drain counts the damage after the target resists it', () => {
  const app = stubApp([foe('wight', { defenses: { resist: ['necrotic'] } })]);
  cast(app, 'vampiric-touch', { target: 'wight' }, [d20(15), face(6, 3), face(6, 4), face(6, 6)]);
  assert.equal(creature(app, 'wight').currentHP, 34);
  assert.equal(mageHP(app), 23, 'half of the 6 the wight took');
});

test('a Vampiric Touch miss drains nothing', () => {
  const app = stubApp();
  cast(app, 'vampiric-touch', { target: 'ogre' }, [d20(2)]);
  assert.equal(mageHP(app), 20);
  assert.equal(
    app.log.some((l) => l.includes('regains')),
    false,
  );
});

test('each repeat of Vampiric Touch attacks again and drains again, with no slot', () => {
  const app = stubApp();
  fight(app);
  cast(app, 'vampiric-touch', { target: 'ogre' }, [d20(15), face(6, 2), face(6, 2), face(6, 2)]);
  assert.equal(mageHP(app), 23);
  const slots = app.state.characters[0].resources.find((r) => r.id === 'slots-3').current;
  const plan = cast(app, 'vampiric-touch', { target: 'ogre' }, [
    d20(15),
    face(6, 4),
    face(6, 4),
    face(6, 4),
  ]);
  assert.ok(plan.free, 'the second use is a repeat');
  assert.equal(mageHP(app), 29);
  assert.equal(app.state.characters[0].resources.find((r) => r.id === 'slots-3').current, slots);
  assert.ok(app.log.includes('Mage repeats Vampiric Touch.'));
});

/** An attack outcome that hits `target` for 10 necrotic and brings `onHit`. */
function hitOn(target, onHit) {
  return {
    target,
    hit: true,
    crit: false,
    attack: { total: 20 },
    ac: 12,
    damage: {
      total: 10,
      detail: '10 necrotic',
      byType: [{ damageType: 'necrotic', subtotal: 10 }],
    },
    ...(onHit ? { onHit } : {}),
  };
}

test('a hit condition on a creature in no roster is logged as untracked', () => {
  const app = stubApp();
  const ray = spellById('ray-of-sickness');
  const ghost = { id: 'ghost', name: 'Ghost', saveBonus: 1 };
  applyOutcomes(
    app,
    ray,
    /** @type {any} */ ({
      targets: [ghost],
      outcomes: [
        hitOn(ghost, {
          save: null,
          dc: 15,
          saved: false,
          rider: null,
          autoFailedBy: 'Paralyzed',
          condition: 'Poisoned',
        }),
      ],
    }),
    'mage',
  );
  assert.ok(app.log.includes('Ghost fails DC 15 (Paralyzed), Poisoned (untracked).'));
});

test('a rider on the target joins the log of its on-hit save', () => {
  const app = stubApp();
  const ray = spellById('ray-of-sickness');
  const ogre = { id: 'ogre', name: 'Ogre', saveBonus: 0 };
  applyOutcomes(
    app,
    ray,
    /** @type {any} */ ({
      targets: [ogre],
      outcomes: [
        hitOn(ogre, {
          save: { total: 9 },
          dc: 15,
          saved: false,
          rider: { modifier: -2, note: 'Bane -2', spent: [] },
          autoFailedBy: null,
          condition: 'Poisoned',
        }),
      ],
    }),
    'mage',
  );
  assert.ok(app.log.includes('Ogre fails DC 15 (CON +0, Bane -2: 9), Poisoned.'));
});

test('a full drain gives back every point, and a caster in no roster regains nothing', () => {
  const touch = spellById('vampiric-touch');
  const full = { ...touch, effect: { ...touch.effect, drain: 'full' } };
  const ogre = { id: 'ogre', name: 'Ogre' };
  const result = /** @type {any} */ ({ targets: [ogre], outcomes: [hitOn(ogre)] });
  const app = stubApp();
  applyOutcomes(app, full, result, 'mage');
  assert.equal(mageHP(app), 30);
  assert.ok(app.log.includes('Mage regains 10 HP from Vampiric Touch.'));
  const lost = stubApp();
  applyOutcomes(lost, full, result, 'nobody');
  assert.equal(
    lost.log.some((l) => l.includes('regains')),
    false,
  );
});
