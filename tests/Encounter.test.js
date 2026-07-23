import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, editEncounter, applyDamage, heal, isDefeated, withDefaults, encountersAt, encountersOnTile, toTemplate, fromTemplate } from '../src/entities/Encounter.js';

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
  assert.deepEqual(template, {
    id: 'goblin-template',
    name: 'Goblin',
    maxHP: 7,
    statBlock: { AC: 13 },
    level: 1,
    tier: 'mob',
  });
  // The stat block is copied, not shared: editing the template never touches
  // the encounter it was saved from.
  template.statBlock.AC = 99;
  assert.equal(goblin.statBlock.AC, 13);
});

test('fromTemplate spawns a fresh, full-health encounter at the given location', () => {
  // A pre-tier template (no level/tier) still spawns, reading as a level-1 mob.
  const template = /** @type {any} */ ({ id: 't1', name: 'Goblin', maxHP: 7, statBlock: { AC: 13, Speed: 30 } });
  const spawned = fromTemplate(template, 'e9', { nodeId: 'region', tileId: '1,1' });
  assert.equal(spawned.id, 'e9');
  assert.equal(spawned.currentHP, 7);
  assert.equal(spawned.level, 1);
  assert.equal(spawned.tier, 'mob');
  assert.deepEqual(spawned.statBlock, { AC: 13, Speed: 30 });
  assert.deepEqual(spawned.location, { nodeId: 'region', tileId: '1,1' });
  assert.deepEqual(spawned.conditions, []);
  // Independent copy again: two spawns never share one stat block.
  spawned.statBlock.AC = 1;
  assert.equal(template.statBlock.AC, 13);
});

test('editEncounter rewrites blueprint fields but keeps live state', () => {
  const base = applyDamage(
    { ...createEncounter('e1', 'Goblin', 10, { AC: 13 }, { nodeId: 'world', tileId: '1,1' }), conditions: [{ name: 'prone' }] },
    4,
  );
  const edited = editEncounter(base, {
    name: 'Goblin Chief',
    maxHP: 20,
    level: 3,
    tier: 'legend',
    location: { nodeId: 'world', tileId: '1,1' },
  });
  assert.equal(edited.name, 'Goblin Chief');
  assert.equal(edited.maxHP, 20);
  assert.equal(edited.currentHP, 6, 'current HP survives the edit');
  assert.equal(edited.level, 3);
  assert.equal(edited.tier, 'legend');
  assert.deepEqual(edited.statBlock, { AC: 13 }, 'hand-tuned stat block is not re-stamped');
  assert.deepEqual(edited.conditions, [{ name: 'prone' }]);
});

test('editEncounter clamps current HP down to a lowered maximum', () => {
  const base = createEncounter('e1', 'Ogre', 30);
  const edited = editEncounter(base, { name: 'Ogre', maxHP: 12, level: 1, tier: 'mob', location: null });
  assert.equal(edited.maxHP, 12);
  assert.equal(edited.currentHP, 12);
});

test('editEncounter resets the noticed flag only when the location changes', () => {
  const noticed = { ...createEncounter('e1', 'Goblin', 10, {}, { nodeId: 'world', tileId: '1,1' }), noticed: true };
  const edits = { name: 'Goblin', maxHP: 10, level: 1, tier: /** @type {const} */ ('mob') };
  const stayed = editEncounter(noticed, { ...edits, location: { nodeId: 'world', tileId: '1,1' } });
  assert.equal(stayed.noticed, true, 'unmoved encounter stays noticed');
  const moved = editEncounter(noticed, { ...edits, location: { nodeId: 'world', tileId: '2,2' } });
  assert.equal(moved.noticed, false, 'a move makes the next walk-in log again');
  const unplaced = editEncounter(noticed, { ...edits, location: null });
  assert.equal(unplaced.noticed, false);
});
