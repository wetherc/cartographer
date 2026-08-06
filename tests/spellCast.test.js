import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOutcomes,
  castChangeHandler,
  castPlan,
  castSpellAction,
  castSpellOutOfCombat,
  chosenTargets,
  combatTargets,
  resolveCast,
  rosterTargets,
  targetSummary,
} from '../src/app/spellCast.js';
import { createResource } from '../src/entities/Resource.js';
import { createCreature } from '../src/entities/Creature.js';
import { damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { emptyProficiencies } from '../src/entities/Proficiencies.js';
import { stubApp as baseStubApp } from './helpers/app.js';
import { item } from './helpers/fixtures.js';

/**
 * The cast pipeline without its dialog. `castPlan` decides what the dialog may
 * offer, `castChangeHandler` decides what a changed slot level does to the
 * open dialog, and `resolveCast` rolls the cast and applies it. All three take
 * plain values, so the whole cast is asserted here and only the modal itself
 * is left to a browser check.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/**
 * A deterministic RNG that replays a queue of unit values, one per call. A
 * die of `sides` comes up `floor(rng() * sides) + 1`, so 0 is the minimum face
 * and a value just under 1 is the maximum. Past the queue it returns 0.
 * @param {number[]} values
 * @returns {() => number}
 */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** A d20 roll of `value`, for an attack roll or a save. */
const d20 = (value) => face(20, value);

/**
 * A stub app holding the rosters, the party position, and a recorder for the
 * toasts. The cast path reports every refusal through a toast, so the messages
 * are what a test asserts on.
 * @param {{ characters?: any[], creatures?: any[] }} [rosters]
 */
function stubApp(rosters = {}) {
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

/** @param {Partial<import('../src/types/entities.js').Character>} over */
function mage(over = {}) {
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
    spellbook: {
      cantrips: ['firebolt'],
      known: [
        'burning-hands',
        'cure-wounds',
        'hold-person',
        'detect-magic',
        'revivify',
        'mage-armor',
      ],
      prepared: [
        'burning-hands',
        'cure-wounds',
        'hold-person',
        'detect-magic',
        'revivify',
        'mage-armor',
      ],
    },
    ...over,
  });
}

/** @param {Partial<import('../src/types/spell.js').Spell>} over */
function spell(over) {
  return /** @type {any} */ ({
    school: 'evocation',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '120 ft',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: '',
    ...over,
  });
}

const firebolt = spell({
  id: 'firebolt',
  name: 'Fire Bolt',
  level: 0,
  effect: { kind: 'attack', damage: [{ count: 1, sides: 10, damageType: 'fire' }] },
});

const burningHands = spell({
  id: 'burning-hands',
  name: 'Burning Hands',
  level: 1,
  effect: {
    kind: 'save',
    saveAbility: 'DEX',
    damage: [{ count: 3, sides: 6, damageType: 'fire' }],
    halfOnSave: true,
  },
});

const cureWounds = spell({
  id: 'cure-wounds',
  name: 'Cure Wounds',
  level: 1,
  effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
});

const holdPerson = spell({
  id: 'hold-person',
  name: 'Hold Person',
  level: 1,
  concentration: true,
  duration: { kind: 'minutes', amount: 1 },
  effect: {
    kind: 'save',
    saveAbility: 'WIS',
    damage: [],
    halfOnSave: false,
    condition: 'Paralyzed',
    saveEnds: true,
  },
});

const detectMagic = spell({
  id: 'detect-magic',
  name: 'Detect Magic',
  level: 1,
  ritual: true,
  effect: { kind: 'utility' },
});

const revivify = spell({
  id: 'revivify',
  name: 'Revivify',
  level: 1,
  materials: { text: 'diamonds worth 300 gp', itemId: 'diamond', consumed: true, costGP: 300 },
  effect: { kind: 'heal', healing: [{ count: 1, sides: 4, damageType: 'healing' }] },
});

// A cost-free material that no cast destroys. A pouch or a focus covers it.
const mageArmor = spell({
  id: 'mage-armor',
  name: 'Mage Armor',
  level: 1,
  materials: { text: 'a piece of cured leather', consumed: false },
  effect: { kind: 'utility' },
});

/** An inventory stack that reads as a spellcasting focus. */
const pouch = () => item('pouch', 'Component Pouch', { spellFocus: true });

const scorchingRay = spell({
  id: 'scorching-ray',
  name: 'Scorching Ray',
  level: 2,
  effect: {
    kind: 'attack',
    damage: [{ count: 2, sides: 6, damageType: 'fire' }],
    projectiles: { count: 3, perStep: 1 },
  },
});

/** A cast plan for `spell`, with the mage casting at the given targets. */
function planFor(app, caster, s) {
  const plan = castPlan(app, caster, s, rosterTargets(app, s));
  assert.equal(plan.ok, true, `the plan was refused: ${plan.message}`);
  return /** @type {any} */ (plan);
}

/** The dialog answers a plain Enter submits, with any overrides. */
function submit(over = {}) {
  return /** @type {any} */ ({ slot: '1', mode: 'normal', ...over });
}

// -- target assembly ------------------------------------------------------

test('combatTargets follows the effect kind through the running order', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const combat = /** @type {any} */ ({
    order: [
      { id: 'mage', initiative: 15, modifier: 0 },
      { id: 'goblin', initiative: 10, modifier: 0 },
    ],
    round: 1,
    turn: 0,
  });
  const participant = /** @type {any} */ ({ id: 'mage' });
  assert.deepEqual(
    combatTargets(app, combat, participant, firebolt).map((t) => t.id),
    ['goblin'],
    'an attack reaches the other side',
  );
  assert.deepEqual(
    combatTargets(app, combat, participant, cureWounds).map((t) => t.id),
    ['mage'],
    'a heal reaches its own side, caster included',
  );
  assert.deepEqual(
    combatTargets(app, combat, participant, detectMagic),
    [],
    'utility targets none',
  );
});

test('rosterTargets reaches the whole party to heal and only the tile to harm', () => {
  const caster = mage();
  const away = mage({ id: 'monk', name: 'Monk' });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const elsewhere = createCreature('ogre', 'Ogre', {
    disposition: 'hostile',
    maxHP: 30,
    stats: { AC: 11 },
    location: { nodeId: 'n1', tileId: '9,9' },
    level: 1,
  });
  const sage = createCreature('sage', 'Sage', { location: HERE, stats: { AC: 12 } });
  const app = stubApp({
    characters: [caster, away],
    creatures: [goblin, elsewhere, sage],
  });
  assert.deepEqual(
    rosterTargets(app, cureWounds).map((t) => t.id),
    ['mage', 'monk'],
    'a heal is not limited by where the party stands',
  );
  assert.deepEqual(
    rosterTargets(app, firebolt).map((t) => t.id),
    ['goblin'],
    'a harmful cast reaches the hostile creatures on the party tile only',
  );
  assert.deepEqual(rosterTargets(app, detectMagic), []);
});

// -- reading the dialog back ----------------------------------------------

test('chosenTargets reads whichever picker the dialog built', () => {
  const targets = /** @type {any[]} */ ([
    { id: 'a', name: 'Goblin', ac: 13 },
    { id: 'b', name: 'Wolf', ac: 12 },
    { id: 'c', name: 'Rook', ac: 14 },
  ]);
  assert.deepEqual(
    chosenTargets(targets, /** @type {any} */ ({ target: 'b' })).map((t) => t.id),
    ['b'],
  );
  assert.deepEqual(
    chosenTargets(targets, /** @type {any} */ ({ targets: 'c, a' })).map((t) => t.id),
    ['a', 'c'],
    'the offered order wins over the picked order',
  );
  assert.deepEqual(chosenTargets(targets, /** @type {any} */ ({ target: 'nobody' })), []);
  assert.deepEqual(chosenTargets(targets, /** @type {any} */ ({})), [], 'nothing picked is nobody');
});

test('an allocation of zero projectiles is not a target', () => {
  const targets = /** @type {any[]} */ ([
    { id: 'a', name: 'Goblin', ac: 13 },
    { id: 'b', name: 'Wolf', ac: 12 },
  ]);
  const chosen = chosenTargets(targets, /** @type {any} */ ({ allocation: 'a:2,b:0' }));
  assert.deepEqual(
    chosen.map((t) => [t.id, t.projectiles]),
    [['a', 2]],
  );
});

test('targetSummary names one target and counts several', () => {
  assert.equal(targetSummary([{ name: 'Goblin' }]), 'Goblin');
  assert.equal(targetSummary([{ name: 'Goblin' }, { name: 'Wolf' }]), '2 targets');
  assert.equal(targetSummary([{}]), '', 'a nameless target reads as nothing, not "undefined"');
});

// -- the pre-dialog plan --------------------------------------------------

test('castPlan refuses a harmful cast with nothing on the tile', () => {
  const app = stubApp({ characters: [mage()] });
  const plan = castPlan(app, mage(), firebolt, rosterTargets(app, firebolt));
  assert.deepEqual(plan, { ok: false, message: 'No target available.' });
});

test('castPlan refuses a leveled spell with no slot left', () => {
  const caster = mage({ resources: [createResource('slots-1', 'Level 1 slots', 'mana', 0)] });
  const app = stubApp({ characters: [caster] });
  const plan = castPlan(app, caster, cureWounds, rosterTargets(app, cureWounds));
  assert.deepEqual(plan, { ok: false, message: 'No level 1+ slot left for Cure Wounds.' });
});

test('castPlan lets a utility spell through with no target at all', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, detectMagic);
  assert.deepEqual(plan.targets, []);
  assert.equal(plan.saveAbility, null);
  assert.equal(
    plan.fields.some((f) => f.name === 'ritual'),
    true,
    'a wizard is offered the ritual',
  );
});

test('castPlan fills in each target’s own save bonus and the class save DC', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  assert.equal(plan.saveAbility, 'WIS');
  assert.equal(plan.dc, 14, '8 + proficiency 3 + INT 3');
  // A foe with no stat the app can read keeps no bonus, so the dialog asks.
  assert.equal(plan.targets[0].saveBonus, undefined);
  assert.equal(
    plan.fields.some((f) => f.name === 'save-bonus'),
    true,
  );
});

test('castPlan reads a party target’s save bonus off the character', () => {
  const caster = mage();
  const monk = mage({ id: 'monk', name: 'Monk', stats: { ...mage().stats, WIS: 16 } });
  const app = stubApp({ characters: [caster, monk] });
  // A heal reaches the party, which is the one path where a target's own save
  // is readable. The spell asks for a WIS save from whoever it touches.
  const healSave = spell({
    ...holdPerson,
    id: 'mass-hold',
    name: 'Mass Hold',
    effect: { kind: 'save', saveAbility: 'WIS', damage: [], halfOnSave: false },
  });
  const plan = castPlan(app, caster, healSave, [
    /** @type {any} */ ({ id: 'monk', name: 'Monk', ac: 10 }),
  ]);
  assert.equal(plan.ok, true);
  assert.equal(plan.targets[0].saveBonus, 3, 'WIS 16 with no proficiency');
});

test('castPlan adds the component opt-out only when a cast will consume one', () => {
  const holder = mage({ inventory: [item('diamond', 'Diamond', { quantity: 1 })] });
  const app = stubApp({ characters: [holder] });
  const plan = planFor(app, holder, revivify);
  assert.equal(plan.material.required, true);
  assert.equal(plan.material.satisfied, true);
  assert.equal(
    plan.fields.some((f) => f.name === 'ignore-components'),
    true,
  );
  const plain = planFor(app, holder, cureWounds);
  assert.equal(
    plain.fields.some((f) => f.name === 'ignore-components'),
    false,
  );
});

// -- the open dialog's response to a changed level ------------------------

/** A form stand-in that records what the change handler did to the dialog. */
function formStub(values = {}) {
  const form = {
    values: { ...values },
    /** @type {Record<string, number>} */ totals: {},
    /** @type {Record<string, string>} */ labels: {},
    /** @type {Record<string, boolean>} */ hidden: {},
    get: (/** @type {string} */ name) => form.values[name] ?? '',
    setTotal: (/** @type {string} */ name, /** @type {number} */ total) => {
      form.totals[name] = total;
    },
    setLabel: (/** @type {string} */ name, /** @type {string} */ text) => {
      form.labels[name] = text;
    },
    setHidden: (/** @type {string} */ name, /** @type {boolean} */ value) => {
      form.hidden[name] = value;
    },
  };
  return form;
}

test('upcasting a projectile spell restates the grid total and its caption', () => {
  const caster = mage({
    resources: [createResource('slots-2', 'Level 2 slots', 'mana', 3)],
    spellbook: { cantrips: [], known: ['scorching-ray'], prepared: ['scorching-ray'] },
  });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, scorchingRay);
  const onChange = castChangeHandler(plan);
  const form = formStub({ slot: '3' });
  onChange('slot', /** @type {any} */ (form));
  assert.equal(form.totals.allocation, 4, 'the third-level slot fires a fourth ray');
  assert.equal(form.labels.allocation, 'Targets (4 to allocate)');
});

test('ticking the ritual box hides the slot picker it overrides', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, detectMagic);
  const onChange = castChangeHandler(plan);
  const form = formStub({ slot: '2', ritual: '1' });
  onChange('ritual', /** @type {any} */ (form));
  assert.equal(form.hidden.slot, true);
  onChange('ritual', /** @type {any} */ (formStub({ slot: '2' })));
  const shown = formStub({ slot: '2' });
  onChange('ritual', /** @type {any} */ (shown));
  assert.equal(shown.hidden.slot, false, 'unticking it brings the picker back');
  // A spell with no grid has no total to restate.
  assert.deepEqual(shown.totals, {});
});

test('a change to any other field leaves the dialog alone', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  const form = formStub({ slot: '1' });
  castChangeHandler(plan)('dc', /** @type {any} */ (form));
  assert.deepEqual(form.totals, {});
  assert.deepEqual(form.hidden, {});
});

// -- resolving the cast ---------------------------------------------------

test('a cantrip attack rolls, logs, and damages without spending anything', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'goblin', slot: undefined }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
    rng: seq([d20(18), face(10, 7)]),
  });
  assert.deepEqual(written, [], 'a cantrip changes nothing about the caster');
  assert.equal(app.dirty, 1, 'only the damage write marks the campaign dirty');
  assert.match(app.log[0], /^Mage casts Fire Bolt\.$/, 'a cantrip names no level');
  assert.match(app.log[1], /Fire Bolt hits Goblin for/);
  assert.equal(app.state.creatures[0].currentHP, 3, '10 HP less the 7 rolled');
  assert.deepEqual(app.toasted, ['Fire Bolt on Goblin.']);
});

test('a missed attack logs the roll against AC and leaves HP alone', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin' }), {
    writeBack: () => {},
    concentrates: true,
    rng: seq([d20(2)]),
  });
  assert.match(app.log[1], /to hit vs AC 14 — misses Goblin\.$/);
  assert.equal(app.state.creatures[0].currentHP, 10);
});

test('a leveled cast spends the slot and stores the caster once', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const hurt = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 16);
  app.state.characters = [caster, hurt];
  const plan = planFor(app, caster, cureWounds);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'monk' }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
    rng: seq([face(8, 5)]),
  });
  assert.equal(written.length, 1, 'the slot, the component, and the hold store together');
  assert.equal(written[0].resources[0].current, 3);
  assert.equal(app.dirty, 2, 'the spent slot and the healed target each mark it dirty');
  assert.match(app.log[0], /Mage casts Cure Wounds at level 1\./);
  assert.match(app.log[1], /Cure Wounds heals Monk for 5 HP\./);
  assert.equal(getHP(app.state.characters[1]).current, 9, 'a heal adds no ability modifier');
  assert.deepEqual(app.toasted, ['Cure Wounds heals Monk.']);
});

test('a failed save takes full damage and lands a tracked condition', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '2' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([d20(3)]),
  });
  assert.match(app.log[1], /Goblin fails DC 14 \(WIS \+2: 5\) — takes 0 damage, Paralyzed\.$/);
  const chip = app.state.creatures[0].conditions[0];
  assert.equal(chip.name, 'Paralyzed');
  assert.equal(chip.source.spellId, 'hold-person');
  assert.equal(chip.source.saveEnds, true);
  assert.equal(chip.source.casterId, 'mage');
});

test('a made save logs the roll and no condition', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '20' }), {
    writeBack: () => {},
    concentrates: false,
    // A save spell rolls its damage first, then each target's save against it.
    rng: seq([face(6, 6), face(6, 6), face(6, 6), d20(10)]),
  });
  assert.match(app.log[1], /Goblin saves DC 14 .* takes 9 damage\.$/, 'half of 18 on a save');
  assert.equal(app.state.creatures[0].currentHP, 1);
});

/** An encounter holding the named condition chips. */
function chipped(encounter, ...names) {
  return { ...encounter, conditions: names.map((name) => ({ name })) };
}

test('the chips on both sides slant a spell attack', () => {
  const caster = mage({ conditions: [{ name: 'Blinded' }] });
  const goblin = chipped(
    createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    'Prone',
  );
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin' }), {
    writeBack: () => {},
    concentrates: true,
    // Blinded on the caster and Prone on a ranged target both point the same
    // way, so the roll takes two d20s and keeps the low one.
    rng: seq([d20(18), d20(2), face(10, 7)]),
  });
  assert.match(app.log[1], /misses Goblin\.$/);
  assert.equal(app.state.creatures[0].currentHP, 10);
});

test("the dialog's mode and the chips cancel instead of overriding", () => {
  const caster = mage();
  const goblin = chipped(
    createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    'Prone',
  );
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin', mode: 'advantage' }), {
    writeBack: () => {},
    concentrates: true,
    // The GM's advantage and the prone target's ranged disadvantage cancel, so
    // one d20 is thrown and the 18 behind it is never reached.
    rng: seq([d20(2), d20(18), face(10, 7)]),
  });
  assert.match(app.log[1], /misses Goblin\.$/);
});

test('a paralyzed target fails a body save with no roll', () => {
  const caster = mage();
  const goblin = chipped(
    createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    'Paralyzed',
  );
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '20' }), {
    writeBack: () => {},
    concentrates: false,
    // Only the damage dice are drawn. A bonus that would clear the DC twice
    // over never reaches a d20.
    rng: seq([face(6, 6), face(6, 6), face(6, 6)]),
  });
  assert.match(app.log[1], /Goblin fails DC 14 \(Paralyzed\) — takes 18 damage\.$/);
  assert.equal(app.state.creatures[0].currentHP, 0);
});

test('a restrained target rolls its Dexterity save at disadvantage', () => {
  const caster = mage();
  const goblin = chipped(
    createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    'Restrained',
  );
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '25', 'save-bonus': '20' }), {
    writeBack: () => {},
    concentrates: false,
    // The kept 2 leaves the save short of the DC that the dropped 18 would
    // have cleared.
    rng: seq([face(6, 6), face(6, 6), face(6, 6), d20(18), d20(2)]),
  });
  assert.match(app.log[1], /Goblin fails DC 25 \(DEX \+20: 22\) — takes 18 damage\.$/);
});

test('a utility cast logs the spell and says only that it was cast', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, detectMagic);
  resolveCast(app, plan, submit(), { writeBack: () => {}, concentrates: true });
  assert.deepEqual(app.toasted, ['Detect Magic cast.']);
});

test('a ritual cast spends no slot and states the extra ten minutes', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, detectMagic);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ ritual: '1' }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
  });
  assert.deepEqual(written, []);
  assert.match(app.log[0], /Mage casts Detect Magic as a ritual \(10 minutes longer\)\.$/);
});

test('unticking the ritual box with no slot left refuses the cast', () => {
  const caster = mage({ resources: [createResource('slots-1', 'Level 1 slots', 'mana', 0)] });
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, detectMagic);
  resolveCast(app, plan, submit({ slot: undefined }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.deepEqual(app.toasted, ['No level 1+ slot left for Detect Magic.']);
  assert.deepEqual(app.log, [], 'a refused cast logs nothing');
});

test('a cast the caster cannot make at all is refused plainly', () => {
  const caster = mage({
    spellbook: { cantrips: [], known: ['detect-magic'], prepared: ['detect-magic'] },
  });
  const app = stubApp({ characters: [caster] });
  // Alarm is neither known nor prepared, so the resolver refuses it. Only a
  // spellbook that changed while the dialog stood open reaches this.
  const alarm = spell({ id: 'alarm', name: 'Alarm', level: 1, effect: { kind: 'utility' } });
  const plan = planFor(app, caster, detectMagic);
  resolveCast(app, { ...plan, spell: alarm }, submit(), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.deepEqual(app.toasted, ["Can't cast Alarm."]);
});

test('submitting no target refuses before the slot is spent', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ targets: '' }), { writeBack: () => {}, concentrates: false });
  assert.deepEqual(app.toasted, ['Pick at least one target for Burning Hands.']);
  assert.equal(caster.resources[0].current, 4);
});

test('a missing component blocks the cast, and the opt-out lets it through', () => {
  const caster = mage();
  const monk = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 19);
  const app = stubApp({ characters: [caster, monk] });
  const plan = planFor(app, caster, revivify);
  resolveCast(app, plan, submit({ target: 'monk' }), {
    writeBack: () => {},
    concentrates: false,
  });
  assert.deepEqual(app.toasted, ['Revivify needs diamonds worth 300 gp.']);

  const ignored = stubApp({ characters: [caster, monk] });
  const plan2 = planFor(ignored, caster, revivify);
  resolveCast(ignored, plan2, submit({ target: 'monk', 'ignore-components': '1' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([face(4, 2)]),
  });
  assert.match(ignored.log[0], /Mage casts Revivify at level 1\./);
});

test('a consumed component comes off the inventory and is logged as used', () => {
  const caster = mage({ inventory: [item('diamond', 'Diamond', { quantity: 2 })] });
  const monk = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 19);
  const app = stubApp({ characters: [caster, monk] });
  const plan = planFor(app, caster, revivify);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'monk' }), {
    writeBack: (next) => written.push(next),
    concentrates: false,
    rng: seq([face(4, 2)]),
  });
  assert.equal(written[0].inventory[0].quantity, 1);
  assert.equal(written[0].resources[0].current, 3, 'the slot and the diamond store together');
  assert.match(app.log[0], /Diamond/, 'the inventory line comes before the cast line');
});

test('a pouch or a focus covers a cost-free material, and its absence blocks the cast', () => {
  const bare = mage();
  const app = stubApp({ characters: [bare] });
  const plan = planFor(app, bare, mageArmor);
  assert.equal(plan.material.required, true, 'no focus, so the caster holds the leather itself');
  resolveCast(app, plan, submit(), { writeBack: () => {}, concentrates: false });
  assert.deepEqual(app.toasted, [
    'Mage Armor needs a component pouch or a focus, or a piece of cured leather.',
  ]);
  assert.equal(app.log.length, 0, 'a refused cast spends nothing');

  const equipped = mage({ inventory: [pouch()] });
  const covered = stubApp({ characters: [equipped] });
  const plan2 = planFor(covered, equipped, mageArmor);
  assert.equal(plan2.material.required, false);
  assert.equal(
    plan2.fields.some((/** @type {any} */ f) => f.name === 'ignore-components'),
    false,
    'a covered component asks the GM nothing',
  );
  /** @type {any[]} */
  const written = [];
  resolveCast(covered, plan2, submit(), {
    writeBack: (next) => written.push(next),
    concentrates: false,
  });
  assert.match(covered.log[0], /Mage casts Mage Armor at level 1\./);
  assert.equal(written[0].inventory.length, 1, 'the pouch is not spent');
});

test('a costed material must be held whatever focus the caster carries, and stays held', () => {
  // A priced component that the cast does not destroy. The SRD says a focus
  // never covers the price.
  const orb = spell({
    ...revivify,
    id: 'chromatic-orb',
    name: 'Chromatic Orb',
    materials: { text: 'a diamond worth 50 gp', costGP: 50, consumed: false },
  });
  const caster = mage({ inventory: [pouch()], spellbook: mage().spellbook });
  caster.spellbook.known.push('chromatic-orb');
  caster.spellbook.prepared.push('chromatic-orb');
  const monk = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 19);
  const app = stubApp({ characters: [caster, monk] });

  const plan = planFor(app, caster, orb);
  assert.equal(plan.material.required, true);
  assert.equal(plan.material.consumes, false);
  resolveCast(app, plan, submit({ target: 'monk' }), { writeBack: () => {}, concentrates: false });
  assert.deepEqual(app.toasted, ['Chromatic Orb needs a diamond worth 50 gp.']);

  const holder = mage({ inventory: [pouch(), item('diamond', 'Diamond')] });
  holder.spellbook.known.push('chromatic-orb');
  holder.spellbook.prepared.push('chromatic-orb');
  const rich = stubApp({ characters: [holder, monk] });
  /** @type {any[]} */
  const written = [];
  resolveCast(rich, planFor(rich, holder, orb), submit({ target: 'monk' }), {
    writeBack: (next) => written.push(next),
    concentrates: false,
    rng: seq([face(4, 2)]),
  });
  assert.equal(written[0].inventory.length, 2, 'a priced component is held, not spent');
  assert.equal(written[0].inventory[1].quantity, 1);
});

test('a concentration cast holds the spell and drops what it held before', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '0' }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
    rng: seq([d20(1)]),
  });
  assert.equal(written[0].concentration.spellId, 'hold-person');
  assert.equal(written[0].concentration.slotLevel, 1);

  // Casting it again on a new victim drops the first hold, which frees the
  // creature the first cast paralyzed.
  const held = written[0];
  const second = stubApp({ characters: [held], creatures: [app.state.creatures[0]] });
  const plan2 = planFor(second, held, holdPerson);
  resolveCast(second, plan2, submit({ target: 'goblin', dc: '14', 'save-bonus': '0' }), {
    writeBack: () => {},
    concentrates: true,
    rng: seq([d20(1)]),
  });
  assert.ok(
    second.log.some((m) => /stops concentrating on Hold Person to hold Hold Person\./.test(m)),
    'the table is told the previous effect ended',
  );
});

test('a cast above its target cap reports the targets it dropped', () => {
  const caster = mage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const wolf = createCreature('wolf', 'Wolf', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 12 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin, wolf] });
  const plan = planFor(app, caster, holdPerson);
  resolveCast(app, plan, submit({ targets: 'goblin, wolf', dc: '14', 'save-bonus': '0' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([d20(1)]),
  });
  assert.equal(
    app.toasted[0],
    'Hold Person reaches 1 at level 1; 1 dropped.',
    'the single-target hold takes the first of the two',
  );
});

test('a multi-projectile cast logs one tally per creature', () => {
  const caster = mage({
    resources: [createResource('slots-2', 'Level 2 slots', 'mana', 3)],
    spellbook: { cantrips: [], known: ['scorching-ray'], prepared: ['scorching-ray'] },
  });
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 30,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const wolf = createCreature('wolf', 'Wolf', {
    disposition: 'hostile',
    maxHP: 30,
    stats: { AC: 30 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin, wolf] });
  const plan = planFor(app, caster, scorchingRay);
  resolveCast(app, plan, submit({ slot: '2', allocation: 'goblin:2,wolf:1' }), {
    writeBack: () => {},
    concentrates: false,
    // Both rays at the goblin land, the one at the AC 30 wolf cannot. Each ray
    // rolls its own d20 and then its own dice. A natural 20 would double the
    // dice and shift the queue, so these hit without critting.
    rng: seq([d20(15), face(6, 3), face(6, 3), d20(15), face(6, 3), face(6, 3), d20(2)]),
  });
  assert.ok(
    app.log.some((m) => /Scorching Ray: 2 of 2 hit Goblin for/.test(m)),
    'the hits are tallied, not logged ray by ray',
  );
  assert.ok(app.log.some((m) => /Scorching Ray: 0 of 1 hit Wolf \(AC 31\)\./.test(m)));
  assert.equal(app.state.creatures[1].currentHP, 30, 'the missed ray did nothing');
});

test('a condition on a target the app cannot track is logged as untracked', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  // An outcome naming a creature in no roster: the chip has nowhere to live,
  // so the log says so rather than dropping the fact.
  applyOutcomes(
    app,
    holdPerson,
    /** @type {any} */ ({
      targets: [{ id: 'ghost', name: 'Ghost' }],
      outcomes: [
        {
          target: { id: 'ghost', name: 'Ghost', saveBonus: 1 },
          saved: false,
          dc: 14,
          save: { total: 5 },
          taken: 0,
          condition: 'Paralyzed',
        },
      ],
    }),
    'mage',
  );
  assert.match(app.log[0], /Paralyzed \(untracked\)\.$/);
});

test('the combat entry point stops when the participant is in no roster', async () => {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ creatures: [goblin] });
  const combat = /** @type {any} */ ({
    order: [
      { id: 'ghost', initiative: 15, modifier: 0 },
      { id: 'goblin', initiative: 10, modifier: 0 },
    ],
    round: 1,
    turn: 0,
  });
  await castSpellAction(app, combat, /** @type {any} */ ({ id: 'ghost' }), firebolt);
  assert.deepEqual(app.toasted, [], 'a caster that no longer exists says nothing');
  assert.deepEqual(app.log, []);
});

test('the out-of-combat entry point refuses a cast with nothing to target', async () => {
  const caster = mage();
  const app = stubApp({ characters: [caster] });
  await castSpellOutOfCombat(app, caster, firebolt);
  assert.deepEqual(app.toasted, ['No target available.']);
});

// -- riders ----------------------------------------------------------------

const BLESS_RIDER = { rolls: ['attack', 'save'], dice: 1, die: 'd4' };
const BANE_RIDER = { rolls: ['attack', 'save'], dice: -1, die: 'd4' };

const bless = spell({
  id: 'bless',
  name: 'Bless',
  level: 1,
  concentration: true,
  duration: { kind: 'rounds', amount: 10 },
  targetCount: 3,
  effect: { kind: 'buff', condition: 'Bless', rider: BLESS_RIDER },
});

const bane = spell({
  id: 'bane',
  name: 'Bane',
  level: 1,
  concentration: true,
  duration: { kind: 'rounds', amount: 10 },
  targetCount: 3,
  effect: {
    kind: 'save',
    saveAbility: 'CHA',
    damage: [],
    halfOnSave: false,
    condition: 'Bane',
    rider: BANE_RIDER,
  },
});

/** A caster who knows the two rider spells. */
function riderMage(over = {}) {
  const base = mage(over);
  return {
    ...base,
    spellbook: {
      ...base.spellbook,
      known: [...base.spellbook.known, 'bless', 'bane'],
      prepared: [...base.spellbook.prepared, 'bless', 'bane'],
    },
  };
}

test('a buff reaches the party, not the foes', () => {
  const caster = riderMage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  assert.deepEqual(
    rosterTargets(app, bless).map((t) => t.id),
    ['mage'],
  );
  const fields = planFor(app, caster, bless).fields;
  const picker = fields.find((/** @type {any} */ f) => f.name === 'targets' || f.name === 'target');
  assert.match(picker.label, /Recipient/, 'a buff hands the chip to an ally');
});

test('a buff puts its chip and rider on every recipient', () => {
  const caster = riderMage();
  const ally = { ...mage(), id: 'rogue', name: 'Rogue' };
  const app = stubApp({ characters: [caster, ally] });
  const plan = planFor(app, caster, bless);
  resolveCast(app, plan, submit({ targets: 'mage,rogue' }), {
    writeBack: (next) => {
      app.state.characters = app.state.characters.map((c) => (c.id === next.id ? next : c));
    },
    concentrates: true,
    rng: () => assert.fail('a buff rolls no dice'),
  });
  const chips = app.state.characters.map((c) => c.conditions.find((x) => x.name === 'Bless'));
  for (const chip of chips) {
    assert.equal(chip.rounds, 10, 'the spell duration times the chip');
    assert.deepEqual(chip.rider, BLESS_RIDER);
    assert.equal(chip.source.spellId, 'bless');
    assert.equal(chip.source.casterId, 'mage');
  }
  assert.ok(
    app.log.some((line) =>
      /Rogue gains Bless: \+1d4 to attack rolls and saving throws\.$/.test(line),
    ),
  );
});

test('dropping the concentration on a buff sweeps its chips off every recipient', () => {
  const caster = riderMage();
  const ally = { ...mage(), id: 'rogue', name: 'Rogue' };
  const app = stubApp({ characters: [caster, ally] });
  const write = (next) => {
    app.state.characters = app.state.characters.map((c) => (c.id === next.id ? next : c));
  };
  resolveCast(app, planFor(app, caster, bless), submit({ targets: 'mage,rogue' }), {
    writeBack: write,
    concentrates: true,
  });
  for (const c of app.state.characters) {
    assert.ok(
      c.conditions.some((x) => x.name === 'Bless'),
      `${c.name} took the chip before anything swept it`,
    );
  }
  // Casting a second concentration spell displaces the first, which is the
  // path that has to sweep the chips.
  const holder = app.state.characters.find((c) => c.id === 'mage');
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  app.state.creatures = [goblin];
  resolveCast(
    app,
    planFor(app, holder, holdPerson),
    submit({ target: 'goblin', dc: '14', 'save-bonus': '20' }),
    { writeBack: write, concentrates: true, rng: seq([d20(20)]) },
  );
  for (const c of app.state.characters) {
    assert.equal(
      c.conditions.some((x) => x.name === 'Bless'),
      false,
      `${c.name} walks free of the dropped Bless`,
    );
  }
});

test('an unnamed buff chip carries the spell’s own name', () => {
  const caster = riderMage();
  const app = stubApp({ characters: [caster] });
  const plain = { ...bless, id: 'bless', name: 'Bless', effect: { kind: 'buff' } };
  resolveCast(app, planFor(app, caster, plain), submit({ target: 'mage' }), {
    writeBack: (next) => {
      app.state.characters = [next];
    },
    concentrates: true,
  });
  const chip = app.state.characters[0].conditions.find((c) => c.name === 'Bless');
  assert.equal(chip.rider, undefined, 'a chip with no rider stores no key');
  assert.ok(app.log.some((line) => /Mage gains Bless\.$/.test(line)));
});

test('a buff on a creature lands as a chip, and an unknown id reads untracked', () => {
  const caster = riderMage();
  const sage = createCreature('sage', 'Sage', { location: HERE });
  const app = stubApp({ characters: [caster], creatures: [sage] });
  const target = { id: 'sage', name: 'Sage' };
  // The roster path offers only the party for a buff, so the creature comes
  // in as an already-picked target the way the combat board would hand one
  // over.
  applyOutcomes(
    app,
    bless,
    { outcomes: [{ target, condition: 'Bless', rider: BLESS_RIDER }], targets: [target] },
    'mage',
  );
  assert.ok(
    app.log.some((line) => line.startsWith('Sage gains Bless') && !line.includes('(untracked)')),
  );
  assert.equal(app.state.creatures[0].conditions[0].name, 'Bless');

  const gone = { id: 'stranger', name: 'Stranger' };
  applyOutcomes(
    app,
    bless,
    { outcomes: [{ target: gone, condition: 'Bless', rider: BLESS_RIDER }], targets: [gone] },
    'mage',
  );
  assert.ok(app.log.some((line) => /Stranger gains Bless.*\(untracked\)\.$/.test(line)));
});

test('a rider the caster holds joins the spell attack roll and the log', () => {
  const caster = { ...mage(), conditions: [{ name: 'Bless', rounds: 10, rider: BLESS_RIDER }] };
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 30 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([face(4, 3), d20(5)]),
  });
  assert.ok(
    app.log.some((line) => /Bless \+1d4 \[3\]/.test(line)),
    'the miss line names the rider',
  );
});

test('a hit names the rider that got it there', () => {
  const caster = { ...mage(), conditions: [{ name: 'Bless', rounds: 10, rider: BLESS_RIDER }] };
  // AC 13 against a d20 of 9 plus a +2 spell attack bonus: the d4 is what
  // carries the roll over the top, so the line has to say so.
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([face(4, 3), d20(9), face(10, 5)]),
  });
  assert.match(app.log.join('\n'), /Fire Bolt hits Goblin \(Bless \+1d4 \[3\]\) for/);
});

test('each ray of a projectile cast reports its own rider dice', () => {
  const caster = {
    ...mage({
      resources: [createResource('slots-2', 'Level 2 slots', 'mana', 3)],
      spellbook: { cantrips: [], known: ['scorching-ray'], prepared: ['scorching-ray'] },
    }),
    conditions: [{ name: 'Bless', rounds: 10, rider: BLESS_RIDER }],
  };
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 30,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, scorchingRay);
  resolveCast(app, plan, submit({ slot: '2', allocation: 'goblin:2' }), {
    writeBack: () => {},
    concentrates: false,
    // Each ray rolls its own d4 before its own d20, so the two rays roll
    // different faces and both belong in the line.
    rng: seq([
      face(4, 2),
      d20(15),
      face(6, 3),
      face(6, 3),
      face(4, 4),
      d20(15),
      face(6, 3),
      face(6, 3),
    ]),
  });
  assert.match(
    app.log.join('\n'),
    /2 of 2 hit Goblin \(Bless \+1d4 \[2\]; Bless \+1d4 \[4\]\) for/,
  );
});

test('a rider the target holds rides its save against the next spell', () => {
  const caster = mage();
  const goblin = {
    ...createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    conditions: [{ name: 'Bane', rounds: 10, rider: BANE_RIDER }],
  };
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '10' }), {
    writeBack: () => {},
    concentrates: false,
    // Three d6 of damage, then the Bane d4, then the target's d20.
    rng: seq([face(6, 1), face(6, 1), face(6, 1), face(4, 4), d20(5)]),
  });
  assert.match(app.log[1], /Goblin fails DC 14 \(DEX \+10, Bane -1d4 \[4\]: 11\)/);
});

test('a failed save against a rider spell lands the rider on the chip', () => {
  const caster = riderMage();
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  const plan = planFor(app, caster, bane);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '0' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([d20(3)]),
  });
  const chip = app.state.creatures[0].conditions.find((c) => c.name === 'Bane');
  assert.deepEqual(chip.rider, BANE_RIDER);
  assert.equal(chip.rounds, 10);
});

// -- the armor proficiency gate -------------------------------------------

/** The mage in heavy armor its empty proficiency lists do not cover. */
function armoredMage(over = {}) {
  return mage({
    proficiencies: emptyProficiencies(),
    inventory: [item('plate', 'Plate', { type: 'armor', armorWeight: 'heavy', baseAC: 18 })],
    equipment: { chest: 'plate' },
    ...over,
  });
}

test('castPlan adds the armor opt-out only for an untrained wearer', () => {
  const caster = armoredMage();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, cureWounds);
  assert.deepEqual(plan.armor, ['heavy armor']);
  assert.equal(
    plan.fields.some((f) => f.name === 'ignore-armor'),
    true,
  );

  const bare = mage();
  const plain = planFor(stubApp({ characters: [bare] }), bare, cureWounds);
  assert.deepEqual(plain.armor, []);
  assert.equal(
    plain.fields.some((f) => f.name === 'ignore-armor'),
    false,
  );
});

test('untrained armor refuses the cast before a slot is spent', () => {
  const caster = armoredMage();
  const hurt = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 10);
  const app = stubApp({ characters: [caster, hurt] });
  const plan = planFor(app, caster, cureWounds);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'monk' }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
    rng: seq([face(8, 5)]),
  });
  assert.deepEqual(app.toasted, ['Mage cannot cast in heavy armor without armor proficiency.']);
  assert.deepEqual(written, [], 'no slot is spent');
  assert.equal(getHP(app.state.characters[1]).current, 10, 'no heal lands');
});

test('the Ignore armor box casts anyway', () => {
  const caster = armoredMage();
  const hurt = damageCharacter(withHP(mage({ id: 'monk', name: 'Monk' }), 20), 10);
  const app = stubApp({ characters: [caster, hurt] });
  const plan = planFor(app, caster, cureWounds);
  /** @type {any[]} */
  const written = [];
  resolveCast(app, plan, submit({ target: 'monk', 'ignore-armor': '1' }), {
    writeBack: (next) => written.push(next),
    concentrates: true,
    rng: seq([face(8, 5)]),
  });
  assert.equal(written.length, 1, 'the slot is spent');
  assert.match(app.log[0], /Mage casts Cure Wounds/);
  assert.equal(getHP(app.state.characters[1]).current, 15);
});

test('a target in untrained armor rolls a body save at disadvantage', () => {
  const caster = mage();
  const wearer = armoredMage({ id: 'monk', name: 'Monk' });
  const app = stubApp({ characters: [caster, wearer] });
  const dexSave = spell({
    id: 'quake',
    name: 'Quake',
    level: 1,
    classes: ['wizard'],
    effect: { kind: 'save', saveAbility: 'DEX', damage: [], halfOnSave: false },
  });
  const withSpell = mage({
    spellbook: { cantrips: [], known: ['quake'], prepared: ['quake'] },
  });
  app.state.characters = [withSpell, wearer];
  const plan = castPlan(app, withSpell, dexSave, [
    /** @type {any} */ ({ id: 'monk', name: 'Monk', ac: 10 }),
  ]);
  assert.equal(plan.ok, true);
  assert.equal(/** @type {any} */ (plan).targets[0].armorPenalty, true);
  resolveCast(app, /** @type {any} */ (plan), submit({ target: 'monk', dc: '14' }), {
    writeBack: () => {},
    concentrates: false,
    // Disadvantage keeps the 2 and drops the 18 that would have saved.
    rng: seq([d20(18), d20(2)]),
  });
  assert.match(app.log[1], /Monk fails DC 14/);
});

test('untrained armor does not slant a mental save', () => {
  const wearer = armoredMage({ id: 'monk', name: 'Monk' });
  const caster = mage({
    spellbook: { cantrips: [], known: ['hold-person'], prepared: ['hold-person'] },
  });
  const app = stubApp({ characters: [caster, wearer] });
  const plan = castPlan(app, caster, holdPerson, [
    /** @type {any} */ ({ id: 'monk', name: 'Monk', ac: 10 }),
  ]);
  assert.equal(plan.ok, true);
  assert.equal(/** @type {any} */ (plan).targets[0].armorPenalty, undefined, 'WIS is untouched');
});

// -- summoning ------------------------------------------------------------

const conjureAnimals = spell({
  id: 'conjure-animals',
  name: 'Conjure Animals',
  level: 1,
  concentration: true,
  duration: { kind: 'hours', amount: 1, upTo: true },
  effect: { kind: 'summons', creature: 'Wolf', count: 2, countPerStep: 1 },
});

/** A caster that knows the summoning spell above.
 * @param {Partial<import('../src/types/entities.js').Character>} [over] */
function druid(over = {}) {
  return mage({
    id: 'druid',
    name: 'Druid',
    spellbook: {
      cantrips: [],
      known: ['conjure-animals'],
      prepared: ['conjure-animals'],
    },
    ...over,
  });
}

test('a summons offers no target and is not refused for having none', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  // Nothing stands on the party's tile, which refuses every other kind.
  const offered = rosterTargets(app, conjureAnimals);
  assert.deepEqual(offered, []);
  const plan = castPlan(app, caster, conjureAnimals, offered);
  assert.equal(plan.ok, true);
  assert.deepEqual(
    /** @type {any} */ (plan).fields.map((f) => f.name),
    ['slot'],
  );
});

test('a summons refuses before the dialog when the library has no such template', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  const unknown = spell({
    ...conjureAnimals,
    effect: { kind: 'summons', creature: 'Owlbear', count: 1 },
  });
  const plan = castPlan(app, caster, unknown, []);
  assert.equal(plan.ok, false);
  assert.match(
    /** @type {any} */ (plan).message,
    /No creature template named "Owlbear" in the library\./,
  );
});

test('a summons puts stamped creatures on the party tile and spends the slot', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, conjureAnimals);
  resolveCast(app, plan, submit(), {
    writeBack: (/** @type {any} */ next) => {
      app.state.characters = [next];
    },
    concentrates: true,
  });
  assert.equal(
    app.state.characters[0].resources.find((/** @type {any} */ r) => r.id === 'slots-1').current,
    3,
    'the summons spends its slot like any other cast',
  );
  assert.equal(app.state.creatures.length, 2);
  for (const wolf of app.state.creatures) {
    assert.equal(wolf.name, 'Wolf');
    assert.equal(wolf.disposition, 'hostile', 'the side comes from the template');
    assert.deepEqual(wolf.location, HERE);
    assert.equal(wolf.currentHP, wolf.maxHP, 'a summon arrives at full health');
    assert.deepEqual(wolf.summonedBy, {
      spellId: 'conjure-animals',
      spellName: 'Conjure Animals',
      casterId: 'druid',
    });
  }
  assert.notEqual(
    app.state.creatures[0].id,
    app.state.creatures[1].id,
    'each creature of one cast gets its own id',
  );
  assert.ok(app.log.includes('Conjure Animals summons 2 x Wolf.'));
});

test('a summons upcast at a higher slot brings more creatures', () => {
  const caster = druid({
    resources: [
      createResource('slots-1', 'Level 1 slots', 'mana', 4),
      createResource('slots-3', 'Level 3 slots', 'mana', 2),
    ],
  });
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, conjureAnimals);
  resolveCast(app, plan, submit({ slot: '3' }), { writeBack: () => {}, concentrates: true });
  assert.equal(app.state.creatures.length, 4, 'one more creature per slot level above the first');
});

test('a summons nothing concentrates on says so in the log', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, conjureAnimals);
  // A creature caster holds no concentration, so nothing will sweep its summons.
  resolveCast(app, plan, submit(), { writeBack: () => {}, concentrates: false });
  assert.ok(app.log.includes('Conjure Animals summons 2 x Wolf (untracked).'));
});

test('a summons cast mid-fight joins the running order', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  app.state.combat = {
    round: 1,
    index: 0,
    order: [{ id: 'druid', initiative: 12, modifier: 1 }],
    startedAt: 0,
  };
  /** @type {any[]} */
  const joined = [];
  app.actions.addCombatant = (/** @type {any} */ participant) => joined.push(participant);
  const plan = planFor(app, caster, conjureAnimals);
  resolveCast(app, plan, submit(), { writeBack: () => {}, concentrates: true });
  assert.equal(joined.length, 2, 'each summon rolls its own place in the order');
  assert.deepEqual(
    joined.map((p) => p.id),
    app.state.creatures.map((/** @type {any} */ c) => c.id),
  );
  for (const p of joined) {
    assert.ok(p.initiative >= 1 + p.modifier && p.initiative <= 20 + p.modifier);
  }
});

test('a summons out of combat joins no order', () => {
  const caster = druid();
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, conjureAnimals);
  resolveCast(app, plan, submit(), { writeBack: () => {}, concentrates: true });
  assert.equal(app.calls.includes('addCombatant'), false);
  assert.equal(app.state.creatures.length, 2, 'the wolves still stand on the tile');
});

test('changing the slot of a spell with no ritual reads no ritual box', () => {
  // The real dialog throws when asked for a field it never built, so this stub
  // does too. A leveled spell with no ritual has a slot picker and no box.
  const strict = {
    ...formStub({ slot: '2' }),
    get: (/** @type {string} */ name) => {
      if (name !== 'slot') throw new TypeError(`no field named ${name}`);
      return '2';
    },
  };
  const caster = mage({
    resources: [createResource('slots-1', 'Level 1 slots', 'mana', 4)],
    spellbook: { cantrips: [], known: ['conjure-animals'], prepared: ['conjure-animals'] },
  });
  const app = stubApp({ characters: [{ ...caster, id: 'druid', name: 'Druid' }] });
  const plan = planFor(app, { ...caster, id: 'druid', name: 'Druid' }, conjureAnimals);
  assert.equal(
    plan.fields.some((/** @type {any} */ f) => f.name === 'ritual'),
    false,
  );
  castChangeHandler(plan)('slot', /** @type {any} */ (strict));
});

test('a summons marks the campaign dirty even when the cast spends nothing', () => {
  const cantrip = spell({
    ...conjureAnimals,
    id: 'conjure-animals',
    level: 0,
    concentration: false,
    effect: { kind: 'summons', creature: 'Wolf', count: 1 },
  });
  const caster = druid({
    spellbook: { cantrips: ['conjure-animals'], known: [], prepared: [] },
  });
  const app = stubApp({ characters: [caster] });
  const plan = planFor(app, caster, cantrip);
  resolveCast(app, plan, submit({ slot: '0' }), { writeBack: () => {}, concentrates: false });
  assert.equal(app.state.creatures.length, 1);
  assert.ok(app.dirty > 0, 'the new creature has to reach the save');
});

// -- the action a cast costs ---------------------------------------------

/**
 * A stub app with the caster in a running order, and a budget action that
 * records what a cast spends.
 * @param {any} caster
 * @param {any} [used] what the caster's turn has already spent
 */
function inFight(caster, used) {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  const app = stubApp({ characters: [caster], creatures: [goblin] });
  app.state.combat = {
    round: 1,
    index: 0,
    order: [
      { id: caster.id, initiative: 15, modifier: 0, ...(used ? { used } : {}) },
      { id: 'goblin', initiative: 9, modifier: 0 },
    ],
    startedAt: 0,
  };
  /** @type {any[]} */
  const spends = [];
  app.actions.spendBudget = (/** @type {any} */ id, /** @type {any} */ cost) => {
    spends.push({ id, cost });
    return true;
  };
  return { app, spends };
}

/** The one-target dialog answers for a cast at the goblin. */
const atGoblin = (over = {}) => submit({ target: 'goblin', ...over });

test('a cast in a fight spends the action its casting time names', () => {
  const caster = mage();
  const { app, spends } = inFight(caster);
  const plan = planFor(app, caster, firebolt);
  assert.equal(plan.actionCost, 'action');
  assert.equal(plan.actionBlocked, false);
  assert.ok(
    !plan.fields.some((/** @type {any} */ f) => f.name === 'ignore-action'),
    'an affordable cast needs no opt-out',
  );
  resolveCast(app, plan, atGoblin(), { writeBack: () => {}, concentrates: true });
  assert.deepEqual(spends, [{ id: 'mage', cost: 'action' }]);
});

test('a cast out of combat spends nothing', () => {
  const caster = mage();
  const app = stubApp({ characters: [caster], creatures: [] });
  /** @type {any[]} */
  const spends = [];
  app.actions.spendBudget = (/** @type {any} */ id) => spends.push(id);
  const plan = planFor(app, caster, cureWounds);
  assert.equal(plan.actionBlocked, false);
  resolveCast(app, plan, submit({ target: 'mage' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.deepEqual(spends, [], 'no turn is running to pay for it');
});

test('a turn that already acted blocks a cast and offers the opt-out', () => {
  const caster = mage();
  const { app, spends } = inFight(caster, { action: true });
  const plan = planFor(app, caster, firebolt);
  assert.equal(plan.actionBlocked, true);
  const optOut = plan.fields.find((/** @type {any} */ f) => f.name === 'ignore-action');
  assert.equal(optOut.label, 'Ignore action cost (action already used)');
  resolveCast(app, plan, atGoblin(), { writeBack: () => {}, concentrates: true });
  assert.equal(app.toasted[0], 'Mage already used their action this turn.');
  assert.deepEqual(app.log, [], 'the refused cast rolled nothing');
  assert.deepEqual(spends, [], 'and spent nothing');
});

test('the opt-out casts anyway and still spends nothing', () => {
  const caster = mage();
  const { app, spends } = inFight(caster, { action: true });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, atGoblin({ 'ignore-action': '1' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.ok(app.log.some((/** @type {string} */ line) => line.startsWith('Mage casts Fire Bolt')));
  assert.deepEqual(spends, [], 'the budget has nothing left to take');
});

test('a casting time longer than a turn blocks a cast in a fight', () => {
  const caster = mage();
  const slow = spell({
    id: 'long-ritual',
    name: 'Slow Working',
    level: 1,
    castingTime: { kind: 'minutes', amount: 10 },
    effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  });
  const { app } = inFight(caster, undefined);
  const plan = planFor(app, caster, slow);
  assert.equal(plan.actionCost, null);
  assert.equal(plan.actionBlocked, true);
  const optOut = plan.fields.find((/** @type {any} */ f) => f.name === 'ignore-action');
  assert.equal(optOut.label, 'Ignore casting time (10 minutes)');
  resolveCast(app, plan, submit({ target: 'mage' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.equal(app.toasted[0], 'Slow Working takes 10 minutes, longer than one turn.');
});

test('a bonus-action cast spends the bonus action', () => {
  const caster = mage();
  const quick = spell({
    id: 'quick-word',
    name: 'Quick Word',
    level: 1,
    castingTime: { kind: 'bonus' },
    effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  });
  const { app, spends } = inFight(caster, { action: true });
  const plan = planFor(app, caster, quick);
  assert.equal(plan.actionBlocked, false, 'the spent action does not block a bonus action');
  resolveCast(app, plan, submit({ target: 'mage' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.deepEqual(spends, [{ id: 'mage', cost: 'bonus' }]);
});

test('a reaction cast spends the reaction on somebody else another turn', () => {
  const caster = mage();
  const shield = spell({
    id: 'shielding',
    name: 'Shielding',
    level: 1,
    castingTime: { kind: 'reaction', trigger: 'which you take when an attack hits you' },
    effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  });
  const { app, spends } = inFight(caster, { action: true, bonus: true });
  // The goblin is taking the turn. A reaction comes between the turns of its
  // owner, so the caster pays with a part of a turn that is not running.
  app.state.combat = { ...app.state.combat, index: 1 };
  const plan = planFor(app, caster, shield);
  assert.equal(plan.actionCost, 'reaction');
  assert.equal(plan.actionBlocked, false, 'the spent action and bonus action leave it free');
  resolveCast(app, plan, submit({ target: 'mage' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.deepEqual(spends, [{ id: 'mage', cost: 'reaction' }]);
});

test('a reaction cast with the reaction gone is blocked and offers the opt-out', () => {
  const caster = mage();
  const shield = spell({
    id: 'shielding',
    name: 'Shielding',
    level: 1,
    castingTime: { kind: 'reaction' },
    effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  });
  const { app, spends } = inFight(caster, { reaction: true });
  const plan = planFor(app, caster, shield);
  assert.equal(plan.actionBlocked, true);
  const optOut = plan.fields.find((/** @type {any} */ f) => f.name === 'ignore-action');
  assert.equal(optOut.label, 'Ignore action cost (reaction already used)');
  resolveCast(app, plan, submit({ target: 'mage' }), {
    writeBack: () => {},
    concentrates: true,
  });
  assert.equal(app.toasted[0], 'Mage already used their reaction this turn.');
  assert.deepEqual(spends, []);
});
