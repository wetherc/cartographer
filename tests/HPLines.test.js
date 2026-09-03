import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageLine, healLine } from '../src/combat/HPLines.js';

test('damageLine names the combatant, the amount, and the HP left', () => {
  assert.equal(
    damageLine('Goblin Scout', 4, { current: 3, max: 7 }),
    'Goblin Scout takes 4 damage (HP 3/7).',
  );
});

test('healLine names the combatant, the amount, and the HP reached', () => {
  assert.equal(
    healLine('Ser Aldric', 6, { current: 12, max: 20 }),
    'Ser Aldric heals 6 (HP 12/20).',
  );
});

test('both lines drop the readout for a combatant without HP', () => {
  assert.equal(damageLine('Shade', 5, null), 'Shade takes 5 damage.');
  assert.equal(healLine('Shade', 5, undefined), 'Shade heals 5.');
});
