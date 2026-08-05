import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCondition } from '../src/entities/Conditions.js';
import {
  CONDITION_EFFECTS,
  autoCrits,
  canAct,
  combineModes,
  conditionEffect,
  effectsOf,
  modeReasons,
  rollMode,
  saveOutcome,
} from '../src/entities/ConditionEffects.js';

/** @param {...string} names */
const chips = (...names) => names.map((name) => createCondition(name));

test('conditionEffect matches the pick-list spelling and a hand-typed one', () => {
  assert.equal(conditionEffect('Poisoned'), CONDITION_EFFECTS.poisoned);
  assert.equal(conditionEffect('  poisoned '), CONDITION_EFFECTS.poisoned);
  assert.equal(conditionEffect('Blessed by the sea'), null);
  assert.equal(conditionEffect(undefined), null);
});

test('conditions with no mechanical effect carry no row', () => {
  for (const name of ['Charmed', 'Grappled', 'Deafened', 'Concentrating']) {
    assert.equal(conditionEffect(name), null, `${name} should have no row`);
  }
});

test('effectsOf keeps only the chips the table knows', () => {
  const found = effectsOf(chips('Prone', 'Hungry', 'Stunned'));
  assert.deepEqual(
    found.map((entry) => entry.condition.name),
    ['Prone', 'Stunned'],
  );
  assert.deepEqual(effectsOf(undefined), []);
  assert.deepEqual(effectsOf(null), []);
});

test('combineModes cancels advantage against disadvantage whatever the order', () => {
  assert.equal(combineModes(['advantage', 'disadvantage']), 'normal');
  assert.equal(combineModes(['disadvantage', 'advantage']), 'normal');
  // Three advantages and one disadvantage still cancel. 5e counts kinds, not
  // sources, so stacking never outweighs a single opposing chip.
  assert.equal(combineModes(['advantage', 'advantage', 'advantage', 'disadvantage']), 'normal');
  assert.equal(combineModes(['advantage', 'advantage']), 'advantage');
  assert.equal(combineModes(['disadvantage', 'disadvantage']), 'disadvantage');
});

test('combineModes reports null, not normal, when nothing applies', () => {
  // The dice tray injects its standing toggle whenever the caller names no
  // mode. Answering 'normal' here would cancel that toggle on every roll.
  assert.equal(combineModes([]), null);
  assert.equal(combineModes([null, undefined, 'normal']), null);
});

test('an attack reads the chips on both sides', () => {
  // Poisoned attacker into a restrained target: one of each, so they cancel.
  assert.equal(
    rollMode({ roller: chips('Poisoned'), target: chips('Restrained'), kind: 'attack' }),
    'normal',
  );
  assert.equal(rollMode({ roller: chips('Poisoned'), kind: 'attack' }), 'disadvantage');
  assert.equal(rollMode({ target: chips('Restrained'), kind: 'attack' }), 'advantage');
  assert.equal(rollMode({ kind: 'attack' }), null);
});

test('prone splits by reach: a melee attacker gains, a ranged one loses', () => {
  const target = chips('Prone');
  assert.equal(rollMode({ target, kind: 'attack', melee: true }), 'advantage');
  assert.equal(rollMode({ target, kind: 'attack', melee: false }), 'disadvantage');
  // A caller that names no reach is asking about a melee swing.
  assert.equal(rollMode({ target, kind: 'attack' }), 'advantage');
});

test('a prone attacker takes disadvantage whatever it swings', () => {
  const roller = chips('Prone');
  assert.equal(rollMode({ roller, kind: 'attack', melee: true }), 'disadvantage');
  assert.equal(rollMode({ roller, kind: 'attack', melee: false }), 'disadvantage');
});

test('invisible helps its holder and hinders whoever swings at it', () => {
  assert.equal(rollMode({ roller: chips('Invisible'), kind: 'attack' }), 'advantage');
  assert.equal(rollMode({ target: chips('Invisible'), kind: 'attack' }), 'disadvantage');
  // An invisible attacker against an invisible target cancels out.
  assert.equal(
    rollMode({ roller: chips('Invisible'), target: chips('Invisible'), kind: 'attack' }),
    'normal',
  );
});

test('a check reads the roller only', () => {
  assert.equal(rollMode({ roller: chips('Frightened'), kind: 'check' }), 'disadvantage');
  assert.equal(rollMode({ roller: chips('Blinded'), kind: 'check' }), null);
  // A restrained target does not make the roller's own check easier.
  assert.equal(rollMode({ target: chips('Restrained'), kind: 'check' }), null);
});

test('restrained slants Dexterity saves only, in either spelling', () => {
  const roller = chips('Restrained');
  assert.equal(rollMode({ roller, kind: 'save', ability: 'DEX' }), 'disadvantage');
  assert.equal(rollMode({ roller, kind: 'save', ability: 'dex' }), 'disadvantage');
  assert.equal(rollMode({ roller, kind: 'save', ability: 'WIS' }), null);
  assert.equal(rollMode({ roller, kind: 'save' }), null);
});

test('modeReasons names each chip and its slant, including a cancelled pair', () => {
  assert.equal(
    modeReasons({ roller: chips('Poisoned'), target: chips('Prone'), kind: 'attack' }),
    'Poisoned disadvantage, Prone advantage',
  );
  assert.equal(modeReasons({ kind: 'attack' }), '');
});

test('canAct is false for a chip that removes actions', () => {
  assert.equal(canAct(chips('Stunned')), false);
  assert.equal(canAct(chips('Poisoned', 'Unconscious')), false);
  assert.equal(canAct(chips('Poisoned', 'Prone')), true);
  assert.equal(canAct([]), true);
  assert.equal(canAct(undefined), true);
});

test('a melee hit on a helpless target crits, and a ranged one does not', () => {
  assert.equal(autoCrits(chips('Unconscious')), true);
  assert.equal(autoCrits(chips('Paralyzed'), { melee: true }), true);
  assert.equal(autoCrits(chips('Unconscious'), { melee: false }), false);
  // Petrified is helpless but carries no auto-crit in the SRD.
  assert.equal(autoCrits(chips('Petrified')), false);
  assert.equal(autoCrits(chips('Prone')), false);
});

test('saveOutcome fails a body save outright and names the chip', () => {
  assert.deepEqual(saveOutcome(chips('Paralyzed'), 'STR'), {
    autoFail: true,
    failedBy: 'Paralyzed',
    mode: null,
  });
  assert.deepEqual(saveOutcome(chips('Stunned'), 'dex'), {
    autoFail: true,
    failedBy: 'Stunned',
    mode: null,
  });
});

test('saveOutcome leaves the other abilities to a roll', () => {
  assert.deepEqual(saveOutcome(chips('Paralyzed'), 'WIS'), {
    autoFail: false,
    failedBy: null,
    mode: null,
  });
  assert.deepEqual(saveOutcome(chips('Restrained'), 'DEX'), {
    autoFail: false,
    failedBy: null,
    mode: 'disadvantage',
  });
  assert.deepEqual(saveOutcome([], 'CON'), { autoFail: false, failedBy: null, mode: null });
});
