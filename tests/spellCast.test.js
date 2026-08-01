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
import { createEncounter } from '../src/entities/Encounter.js';
import { createNPC } from '../src/entities/NPC.js';
import { damageCharacter, getHP, withHP } from '../src/entities/Character.js';
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
 * @param {{ characters?: any[], encounters?: any[], npcs?: any[] }} [rosters]
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
      known: ['burning-hands', 'cure-wounds', 'hold-person', 'detect-magic', 'revivify'],
      prepared: ['burning-hands', 'cure-wounds', 'hold-person', 'detect-magic', 'revivify'],
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const elsewhere = createEncounter(
    'ogre',
    'Ogre',
    30,
    { AC: 11 },
    {
      nodeId: 'n1',
      tileId: '9,9',
    },
  );
  const sage = createNPC('sage', 'Sage', { location: HERE, stats: { AC: 12 } });
  const app = stubApp({
    characters: [caster, away],
    encounters: [goblin, elsewhere],
    npcs: [sage],
  });
  assert.deepEqual(
    rosterTargets(app, cureWounds).map((t) => t.id),
    ['mage', 'monk'],
    'a heal is not limited by where the party stands',
  );
  assert.deepEqual(
    rosterTargets(app, firebolt).map((t) => t.id),
    ['goblin', 'sage'],
    'a harmful cast reaches the party tile only',
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  const form = formStub({ slot: '1' });
  castChangeHandler(plan)('dc', /** @type {any} */ (form));
  assert.deepEqual(form.totals, {});
  assert.deepEqual(form.hidden, {});
});

// -- resolving the cast ---------------------------------------------------

test('a cantrip attack rolls, logs, and damages without spending anything', () => {
  const caster = mage();
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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
  assert.equal(app.state.encounters[0].currentHP, 3, '10 HP less the 7 rolled');
  assert.deepEqual(app.toasted, ['Fire Bolt on Goblin.']);
});

test('a missed attack logs the roll against AC and leaves HP alone', () => {
  const caster = mage();
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
  const plan = planFor(app, caster, firebolt);
  resolveCast(app, plan, submit({ target: 'goblin' }), {
    writeBack: () => {},
    concentrates: true,
    rng: seq([d20(2)]),
  });
  assert.match(app.log[1], /to hit vs AC 14 — misses Goblin\.$/);
  assert.equal(app.state.encounters[0].currentHP, 10);
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
  const plan = planFor(app, caster, holdPerson);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '2' }), {
    writeBack: () => {},
    concentrates: false,
    rng: seq([d20(3)]),
  });
  assert.match(app.log[1], /Goblin fails DC 14 \(WIS \+2: 5\) — takes 0 damage, Paralyzed\.$/);
  const chip = app.state.encounters[0].conditions[0];
  assert.equal(chip.name, 'Paralyzed');
  assert.equal(chip.source.spellId, 'hold-person');
  assert.equal(chip.source.saveEnds, true);
  assert.equal(chip.source.casterId, 'mage');
});

test('a made save logs the roll and no condition', () => {
  const caster = mage();
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
  const plan = planFor(app, caster, burningHands);
  resolveCast(app, plan, submit({ target: 'goblin', dc: '14', 'save-bonus': '20' }), {
    writeBack: () => {},
    concentrates: false,
    // A save spell rolls its damage first, then each target's save against it.
    rng: seq([face(6, 6), face(6, 6), face(6, 6), d20(10)]),
  });
  assert.match(app.log[1], /Goblin saves DC 14 .* takes 9 damage\.$/, 'half of 18 on a save');
  assert.equal(app.state.encounters[0].currentHP, 1);
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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

test('a concentration cast holds the spell and drops what it held before', () => {
  const caster = mage();
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin] });
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
  const second = stubApp({ characters: [held], encounters: [app.state.encounters[0]] });
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const wolf = createEncounter('wolf', 'Wolf', 10, { AC: 12 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin, wolf] });
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
  const goblin = createEncounter('goblin', 'Goblin', 30, { AC: 13 }, HERE);
  const wolf = createEncounter('wolf', 'Wolf', 30, { AC: 30 }, HERE);
  const app = stubApp({ characters: [caster], encounters: [goblin, wolf] });
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
  assert.equal(app.state.encounters[1].currentHP, 30, 'the missed ray did nothing');
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
  const goblin = createEncounter('goblin', 'Goblin', 10, { AC: 13 }, HERE);
  const app = stubApp({ encounters: [goblin] });
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
