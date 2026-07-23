import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, applyDamage, heal, isDefeated, withDefaults, encountersAt, encountersOnTile, toTemplate, fromTemplate } from '../src/entities/Encounter.js';

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

test('withDefaults leaves a bound location alone and defaults a missing one to null', () => {
  const bound = createEncounter('e1', 'Goblin', 7, {}, { nodeId: 'region', tileId: '1,1' });
  assert.deepEqual(withDefaults(bound).location, { nodeId: 'region', tileId: '1,1' });

  const legacy = { id: 'e2', name: 'Wolf', maxHP: 5, currentHP: 5, statBlock: {} };
  assert.equal(withDefaults(legacy).location, null);
});

test('encountersAt keeps encounters in the party node plus unbound ones', () => {
  const here = createEncounter('e1', 'Goblin', 7, {}, { nodeId: 'region', tileId: '1,1' });
  const elsewhere = createEncounter('e2', 'Ogre', 20, {}, { nodeId: 'world', tileId: '0,0' });
  const unbound = createEncounter('e3', 'Wandering ghost', 10);
  const all = [here, elsewhere, unbound];

  assert.deepEqual(
    encountersAt(all, { nodeId: 'region', tileId: '3,0' }).map((e) => e.id),
    ['e1', 'e3'],
    'node-level match: tile within the node does not matter',
  );
  assert.deepEqual(encountersAt(all, null).map((e) => e.id), ['e3']);
});

test('encountersOnTile matches the exact tile, skips unbound, defeated, and null position', () => {
  const here = createEncounter('e1', 'Goblin', 7, {}, { nodeId: 'region', tileId: '1,1' });
  const sameNodeOtherTile = createEncounter('e2', 'Ogre', 20, {}, { nodeId: 'region', tileId: '2,2' });
  const dead = applyDamage(
    createEncounter('e3', 'Corpse', 5, {}, { nodeId: 'region', tileId: '1,1' }),
    5,
  );
  const unbound = createEncounter('e4', 'Ghost', 10);
  const all = [here, sameNodeOtherTile, dead, unbound];

  assert.deepEqual(
    encountersOnTile(all, { nodeId: 'region', tileId: '1,1' }).map((e) => e.id),
    ['e1'],
    'exact-tile match, excluding the defeated e3 on the same tile',
  );
  assert.deepEqual(encountersOnTile(all, { nodeId: 'region', tileId: '9,9' }), []);
  assert.deepEqual(encountersOnTile(all, null), []);
});

test('toTemplate captures the blueprint, not the live state', () => {
  const goblin = applyDamage(
    createEncounter('e1', 'Goblin', 7, { AC: 13 }, { nodeId: 'world', tileId: '5,2' }),
    3,
  );
  const template = toTemplate('goblin-template', goblin);
  assert.deepEqual(template, { id: 'goblin-template', name: 'Goblin', maxHP: 7, statBlock: { AC: 13 } });
  // The stat block is copied, not shared: editing the template never touches
  // the encounter it was saved from.
  template.statBlock.AC = 99;
  assert.equal(goblin.statBlock.AC, 13);
});

test('fromTemplate spawns a fresh, full-health encounter at the given location', () => {
  const template = { id: 't1', name: 'Goblin', maxHP: 7, statBlock: { AC: 13, Speed: 30 } };
  const spawned = fromTemplate(template, 'e9', { nodeId: 'region', tileId: '1,1' });
  assert.equal(spawned.id, 'e9');
  assert.equal(spawned.currentHP, 7);
  assert.deepEqual(spawned.statBlock, { AC: 13, Speed: 30 });
  assert.deepEqual(spawned.location, { nodeId: 'region', tileId: '1,1' });
  assert.deepEqual(spawned.conditions, []);
  // Independent copy again: two spawns never share one stat block.
  spawned.statBlock.AC = 1;
  assert.equal(template.statBlock.AC, 13);
});
