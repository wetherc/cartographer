import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, applyDamage, heal, isDefeated } from '../src/entities/Encounter.js';

test('createEncounter starts at full health', () => {
  const goblin = createEncounter('e1', 'Goblin', 7, { AC: 15 });
  assert.equal(goblin.currentHP, 7);
  assert.equal(goblin.maxHP, 7);
  assert.equal(goblin.statBlock.AC, 15);
});

test('applyDamage reduces currentHP', () => {
  const goblin = createEncounter('e1', 'Goblin', 7);
  const hurt = applyDamage(goblin, 3);
  assert.equal(hurt.currentHP, 4);
  assert.equal(goblin.currentHP, 7); // original untouched
});

test('applyDamage clamps at 0, never goes negative', () => {
  const goblin = createEncounter('e1', 'Goblin', 7);
  const dead = applyDamage(goblin, 100);
  assert.equal(dead.currentHP, 0);
});

test('heal clamps at maxHP', () => {
  const goblin = applyDamage(createEncounter('e1', 'Goblin', 7), 3);
  const healed = heal(goblin, 100);
  assert.equal(healed.currentHP, 7);
});

test('isDefeated reflects currentHP <= 0', () => {
  const goblin = createEncounter('e1', 'Goblin', 7);
  assert.equal(isDefeated(goblin), false);
  assert.equal(isDefeated(applyDamage(goblin, 7)), true);
});
