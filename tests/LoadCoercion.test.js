import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionList, recordList, spellbookOf } from '../src/entities/LoadCoercion.js';
import {
  createCharacter,
  withDefaults as withCharacterDefaults,
} from '../src/entities/Character.js';
import { createCreature, withDefaults as withCreatureDefaults } from '../src/entities/Creature.js';
import { deserialize } from '../src/storage/SaveManager.js';

test('recordList keeps the record entries of an array and reads anything else as empty', () => {
  assert.deepEqual(recordList([{ id: 'a' }, 5, null, [1], 'x', { id: 'b' }]), [
    { id: 'a' },
    { id: 'b' },
  ]);
  assert.deepEqual(recordList(5), []);
  assert.deepEqual(recordList(undefined), []);
  assert.deepEqual(recordList({ id: 'a' }), []);
});

test('conditionList drops conditions with no string name', () => {
  const blessed = { name: 'Blessed', rounds: 10 };
  assert.deepEqual(conditionList([blessed, { rounds: 3 }, { name: 4 }, 'Prone']), [blessed]);
  assert.deepEqual(conditionList('Prone'), []);
});

test('spellbookOf keeps string ids and string sources only', () => {
  assert.equal(spellbookOf(5), undefined);
  assert.equal(spellbookOf(null), undefined);
  assert.equal(spellbookOf(['fire-bolt']), undefined);
  assert.deepEqual(spellbookOf({}), { cantrips: [], known: [], prepared: [] });
  assert.deepEqual(
    spellbookOf({
      cantrips: ['fire-bolt', 3],
      known: 'shield',
      prepared: ['shield'],
      sources: { shield: 'wizard', bless: 7 },
    }),
    { cantrips: ['fire-bolt'], known: [], prepared: ['shield'], sources: { shield: 'wizard' } },
  );
  assert.equal('sources' in /** @type {object} */ (spellbookOf({ sources: 'x' })), false);
});

test('character withDefaults coerces malformed list and spellbook fields', () => {
  const loaded = withCharacterDefaults(
    /** @type {any} */ ({
      ...createCharacter('c1', 'Hero'),
      spellbook: 5,
      resources: 'none',
      inventory: 5,
      conditions: { name: 'Prone' },
    }),
  );
  assert.deepEqual(loaded.spellbook, { cantrips: [], known: [], prepared: [] });
  assert.ok(Array.isArray(loaded.resources), 'the resource list is rebuilt');
  assert.deepEqual(loaded.inventory, []);
  assert.deepEqual(loaded.conditions, []);
});

test('creature withDefaults coerces malformed list and spellbook fields', () => {
  const loaded = withCreatureDefaults(
    /** @type {any} */ ({
      ...createCreature('e1', 'Goblin'),
      spellbook: 5,
      resources: 'none',
      conditions: 7,
    }),
  );
  assert.equal('spellbook' in loaded, false, 'an unreadable spellbook is dropped');
  assert.deepEqual(loaded.resources, []);
  assert.deepEqual(loaded.conditions, []);
  const plain = withCreatureDefaults(createCreature('e2', 'Wolf'));
  assert.equal('resources' in plain, false, 'a creature with no resources gains none');
});

test('deserialize breaks a parent loop in the node list', () => {
  const node = (id, parentId) => ({ id, name: id, parentId, width: 1, height: 1, tiles: [] });
  const state = deserialize(
    JSON.stringify({ nodes: [node('a', 'b'), node('b', 'a'), node('c', 'c')] }),
  );
  assert.deepEqual(
    state.nodes.map((n) => n.parentId),
    ['b', null, null],
  );
});

test('deserialize clears a tile link to a node the save does not hold', () => {
  const state = deserialize(
    JSON.stringify({
      nodes: [
        {
          id: 'world',
          name: 'World',
          width: 1,
          height: 1,
          tiles: [{ id: '0,0', imageRef: 'grass.svg', childNodeId: 'gone' }],
        },
      ],
    }),
  );
  assert.equal(state.nodes[0].tiles[0].childNodeId, null);
});
