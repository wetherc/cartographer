import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  castCap,
  castFields,
  effectiveSlot,
  prefillTarget,
  startingSlotLevel,
} from '../src/app/spellCast.js';

/**
 * The cast dialog's field list is pure — plain field records, no DOM — so what
 * the GM is offered can be asserted directly. The projectile allocation is the
 * part worth pinning: it has to add up to exactly what the spell fires at the
 * level being cast, so a count read at the wrong level is a cast the GM cannot
 * submit or a projectile that silently vanishes.
 */

/** @type {any} */
const target = (id, name, ac) => ({ id, name, ac });

const targets = [target('a', 'Goblin', 14), target('b', 'Wolf', 13)];

/** A three-ray spell gaining one ray per slot level above 2nd. @type {any} */
const scorchingRay = {
  id: 'scorching-ray',
  name: 'Scorching Ray',
  level: 2,
  effect: {
    kind: 'attack',
    damage: [{ count: 2, sides: 6, damageType: 'fire' }],
    projectiles: { count: 3, perStep: 1 },
  },
};

/** @type {any} */
const fireBolt = {
  id: 'fire-bolt',
  name: 'Fire Bolt',
  level: 0,
  effect: { kind: 'attack', damage: [{ count: 1, sides: 10, damageType: 'fire' }] },
};

/** The cap the dialog is built with, at a given slot level. */
function capAt(spell, slot, casterLevel = 5) {
  return castCap(spell, slot, casterLevel);
}

test('a projectile spell offers an allocation grid summing to what it fires', () => {
  const cap = capAt(scorchingRay, 2);
  assert.equal(cap, 3);
  const fields = castFields(scorchingRay, targets, [2, 3], 13, cap);
  const allocation = fields.find((f) => f.name === 'allocation');
  assert.ok(allocation, 'a multi-projectile spell gets the grid, not the checkboxes');
  assert.equal(allocation.type, 'allocation');
  assert.equal(allocation.total, 3);
  assert.equal(allocation.label, 'Targets (3 to allocate)');
  assert.equal(allocation.value, 'a:3', 'the whole allocation starts on the first target');
  assert.deepEqual(
    allocation.rows.map((r) => r.value),
    ['a', 'b'],
  );
  assert.equal(
    fields.some((f) => f.name === 'targets' || f.name === 'target'),
    false,
    'the grid is the target picker',
  );
});

test('the cap is read at the level the picker starts on, not the best slot', () => {
  // A caster holding both a 2nd- and a 3rd-level slot starts on the 2nd, which
  // fires three rays. Reading the best slot instead offered four, one more than
  // the cast fires, and the fourth was lost on submit.
  assert.equal(startingSlotLevel(scorchingRay, [2, 3]), 2);
  assert.equal(capAt(scorchingRay, startingSlotLevel(scorchingRay, [2, 3])), 3);
  assert.equal(capAt(scorchingRay, 3), 4, 'the extra ray belongs to the level above');
  // Upcasting is still reachable: the dialog restates the total on that level.
  const fields = castFields(scorchingRay, targets, [2, 3], 13, capAt(scorchingRay, 3));
  assert.equal(fields.find((f) => f.name === 'allocation').total, 4);
});

test('startingSlotLevel falls back to the spell’s own level, and cantrips have none', () => {
  assert.equal(startingSlotLevel(scorchingRay, []), 2, 'no slot offered still reads as its level');
  assert.equal(startingSlotLevel(fireBolt, []), 0);
});

test('an attack spell with no projectiles keeps the single target select', () => {
  const fields = castFields(fireBolt, targets, [], 13, capAt(fireBolt, 0));
  assert.equal(
    fields.some((f) => f.name === 'allocation'),
    false,
  );
  const picker = fields.find((f) => f.name === 'target');
  assert.equal(picker.type, 'select');
  assert.deepEqual(
    picker.options.map((o) => o.label),
    ['Goblin (AC 14)', 'Wolf (AC 13)'],
  );
});

test('a single-projectile cast keeps the select rather than a one-row grid', () => {
  // Eldritch Blast at low level: one beam, so there is nothing to distribute.
  const eldritch = {
    ...fireBolt,
    effect: { ...fireBolt.effect, projectiles: { count: 1, perStep: 1 } },
  };
  const fields = castFields(eldritch, targets, [], 13, capAt(eldritch, 0, 1));
  assert.equal(
    fields.some((f) => f.name === 'allocation'),
    false,
  );
  assert.equal(fields.find((f) => f.name === 'target').type, 'select');
});

test('a leveled spell with no slot left builds no fields at all', () => {
  assert.equal(castFields(scorchingRay, targets, [], 13, 3), null);
});

/** A ritual utility spell, standing in for Detect Magic. @type {any} */
const detectMagic = {
  id: 'detect-magic',
  name: 'Detect Magic',
  level: 1,
  ritual: true,
  effect: { kind: 'utility' },
};

test('the ritual box is offered beside the slot picker, unticked', () => {
  const fields = castFields(detectMagic, [], [1, 2], 13, 1, { ritual: true });
  const box = fields.find((f) => f.name === 'ritual');
  assert.equal(box.type, 'checkbox');
  assert.equal(box.value, false, 'a caster holding slots casts from one by default');
  assert.equal(box.label, 'Cast as ritual (10 minutes longer)');
  assert.deepEqual(
    fields.map((f) => f.name),
    ['slot', 'ritual'],
    'the box sits beside the picker it governs',
  );
});

test('a ritual with no slot left keeps its dialog, pre-ticked and pickerless', () => {
  // Without this the drained caster was refused the one cast that needs no slot.
  const fields = castFields(detectMagic, [], [], 13, 1, { ritual: true });
  assert.notEqual(fields, null);
  assert.equal(
    fields.some((f) => f.name === 'slot'),
    false,
  );
  assert.equal(fields.find((f) => f.name === 'ritual').value, true);
});

test('no ritual on offer leaves the box out and still refuses a slotless cast', () => {
  const fields = castFields(detectMagic, [], [1], 13, 1);
  assert.equal(
    fields.some((f) => f.name === 'ritual'),
    false,
  );
  assert.equal(castFields(detectMagic, [], [], 13, 1), null);
});

test('effectiveSlot ignores the picked level for a ritual', () => {
  assert.equal(effectiveSlot(detectMagic, '3', true), 1);
  assert.equal(effectiveSlot(detectMagic, '3', false), 3);
  assert.equal(
    effectiveSlot(detectMagic, undefined, false),
    1,
    'nothing picked reads as its level',
  );
  assert.equal(effectiveSlot(fireBolt, '', false), 0);
});

/** A save spell, standing in for Hold Person. @type {any} */
const holdPerson = {
  id: 'hold-person',
  name: 'Hold Person',
  level: 2,
  effect: {
    kind: 'save',
    saveAbility: 'WIS',
    damage: [],
    halfOnSave: false,
    condition: 'Paralyzed',
  },
};

test('a save spell names each target’s own bonus where the app knows it', () => {
  // AC is what an attack rolls against and means nothing to a save, so the
  // picker shows the number this cast actually turns on.
  const mixed = [target('a', 'Goblin', 14), { ...target('b', 'Rook', 15), saveBonus: 6 }];
  const fields = castFields(holdPerson, mixed, [2], 13, 1);
  assert.deepEqual(
    fields.find((f) => f.name === 'target').options.map((o) => o.label),
    ['Goblin', 'Rook (WIS +6)'],
  );
});

test('the dialog asks for no save bonus, because every bonus is derived', () => {
  const known = [
    { ...target('a', 'Rook', 15), saveBonus: 6 },
    { ...target('b', 'Vex', 14), saveBonus: -1 },
  ];
  const fields = castFields(holdPerson, known, [2], 13, 2);
  assert.equal(
    fields.some((f) => f.name === 'save-bonus'),
    false,
    'the app reads a save off both kinds of combatant',
  );
  assert.deepEqual(
    fields.find((f) => f.name === 'targets').options.map((o) => o.label),
    ['Rook (WIS +6)', 'Vex (WIS -1)'],
  );
  assert.equal(fields.find((f) => f.name === 'dc').value, 13, 'the DC stays editable');
});

test('a board-picked target pre-fills whichever picker the dialog built', () => {
  const single = castFields(fireBolt, targets, [], 13, capAt(fireBolt, 0));
  prefillTarget(single, 'b');
  assert.equal(single.find((f) => f.name === 'target').value, 'b');

  const multi = castFields(holdPerson, targets, [2], 13, 2);
  prefillTarget(multi, 'b');
  assert.equal(multi.find((f) => f.name === 'targets').value, 'b');

  const grid = castFields(scorchingRay, targets, [2], 13, capAt(scorchingRay, 2));
  prefillTarget(grid, 'b');
  assert.equal(
    grid.find((f) => f.name === 'allocation').value,
    'b:3',
    'the whole allocation moves onto the picked target',
  );
});

test('an id the dialog does not offer leaves each picker on its default', () => {
  const single = castFields(fireBolt, targets, [], 13, capAt(fireBolt, 0));
  prefillTarget(single, 'nobody');
  assert.equal(single.find((f) => f.name === 'target').value, undefined);

  const grid = castFields(scorchingRay, targets, [2], 13, capAt(scorchingRay, 2));
  prefillTarget(grid, 'nobody');
  assert.equal(grid.find((f) => f.name === 'allocation').value, 'a:3');
});

/** A summoning spell, standing in for Conjure Animals. @type {any} */
const conjureAnimals = {
  id: 'conjure-animals',
  name: 'Conjure Animals',
  level: 3,
  effect: { kind: 'summons', creature: 'Wolf', count: 4, countPerStep: 2 },
};

test('a summons offers the slot picker and no target field', () => {
  const fields = castFields(conjureAnimals, targets, [3, 4], 13, 1);
  assert.deepEqual(
    fields.map((f) => f.name),
    ['slot'],
    'a summons picks no creature, so it gets no picker, mode, or DC',
  );
});
