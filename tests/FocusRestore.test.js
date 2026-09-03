import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusKey, refocusTarget } from '../src/combat/FocusRestore.js';

test('focusKey names a chip and a card of one combatant apart', () => {
  assert.equal(focusKey({ combatantId: 'goblin', chip: true }), 'chip:goblin');
  assert.equal(focusKey({ combatantId: 'goblin' }), 'card:goblin');
  assert.notEqual(
    focusKey({ combatantId: 'goblin', chip: true }),
    focusKey({ combatantId: 'goblin' }),
  );
});

test('focusKey prefers the accessible label, then the text', () => {
  assert.equal(focusKey({ label: 'Damage Goblin', text: 'Damage' }), 'control:Damage Goblin');
  assert.equal(focusKey({ text: '  Next turn ' }), 'control:Next turn');
});

test('focusKey is null for a control with no name', () => {
  assert.equal(focusKey({}), null);
  assert.equal(focusKey({ label: '   ', text: '' }), null);
});

test('refocusTarget picks the rebuilt control with the same key', () => {
  const damage = { element: 'damage', key: 'control:Damage Goblin' };
  const heal = { element: 'heal', key: 'control:Heal Goblin' };
  const chip = { element: 'chip', key: null };
  assert.equal(refocusTarget('control:Heal Goblin', [damage, heal], [chip]), heal);
});

test('refocusTarget skips a disabled match and falls back in order', () => {
  const swing = { element: 'swing', key: 'control:Attack with Sword', disabled: true };
  const chip = { element: 'chip', key: null };
  const heading = { element: 'heading', key: null };
  assert.equal(refocusTarget('control:Attack with Sword', [swing], [chip, heading]), chip);
  assert.equal(refocusTarget('control:Attack with Sword', [swing], [null, heading]), heading);
  assert.equal(
    refocusTarget('control:Attack with Sword', [swing], [{ ...chip, disabled: true }, undefined]),
    null,
  );
});

test('refocusTarget with no key goes straight to the fallbacks', () => {
  const damage = { element: 'damage', key: 'control:Damage Goblin' };
  const heading = { element: 'heading', key: null };
  assert.equal(refocusTarget(null, [damage], [heading]), heading);
});
