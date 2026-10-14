import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asiChoicesOf,
  coerceHPBuffs,
  conditionList,
  levelOf,
  recordList,
  resourceList,
  spellbookOf,
  stringList,
  warlockPicks,
} from '../src/entities/LoadCoercion.js';
import {
  createCharacter,
  withDefaults as withCharacterDefaults,
} from '../src/entities/Character.js';
import {
  createCreature,
  effectiveStatBlock,
  withDefaults as withCreatureDefaults,
} from '../src/entities/Creature.js';
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

test('warlockPicks keeps string id lists and a known pact boon', () => {
  assert.deepEqual(stringList(['a', 1, null, 'b']), ['a', 'b']);
  assert.deepEqual(warlockPicks({ invocations: 'agonizing-blast', invocationUses: 'x' }), {});
  assert.deepEqual(
    warlockPicks({
      invocations: ['agonizing-blast', 3],
      invocationUses: ['mire-the-mind'],
      pactBoon: 'blade',
    }),
    { invocations: ['agonizing-blast'], invocationUses: ['mire-the-mind'], pactBoon: 'blade' },
  );
  assert.deepEqual(warlockPicks({ pactBoon: 'spoon' }), {});
});

test('character withDefaults coerces malformed warlock picks', () => {
  const loaded = withCharacterDefaults(
    /** @type {any} */ ({
      ...createCharacter('c1', 'Hero'),
      classes: [{ classId: 'warlock', level: 5 }],
      level: 5,
      invocations: 'agonizing-blast',
      invocationUses: 'mire-the-mind-x',
      pactBoon: 'spoon',
    }),
  );
  assert.equal('invocations' in loaded, false);
  assert.equal('invocationUses' in loaded, false);
  assert.equal('pactBoon' in loaded, false);
});

test('conditionList runs chip mods through normalizeChipMods', () => {
  const list = conditionList([
    { name: 'X', rounds: null, mods: { ac: '5' } },
    { name: 'Y', rounds: null, mods: { junk: 1 } },
    { name: 'Z', rounds: 2 },
  ]);
  assert.deepEqual(list, [
    { name: 'X', rounds: null, mods: { ac: 5 } },
    { name: 'Y', rounds: null },
    { name: 'Z', rounds: 2 },
  ]);
});

test('a loaded chip with a string AC bonus adds it as a number', () => {
  const orc = withCreatureDefaults(
    /** @type {any} */ ({
      id: 'o',
      name: 'Orc',
      maxHP: 10,
      stats: { AC: 15 },
      conditions: [{ name: 'X', rounds: null, mods: { ac: '5' } }],
    }),
  );
  assert.equal(effectiveStatBlock(orc).AC, 20);
});

test('coerceHPBuffs keeps a whole raise from 0 up and a named grant', () => {
  assert.deepEqual(coerceHPBuffs({ a: 1, hpBoost: '7', bonusHPFrom: 'heroism' }), {
    a: 1,
    hpBoost: 7,
    bonusHPFrom: 'heroism',
  });
  assert.deepEqual(coerceHPBuffs({ hpBoost: -3, bonusHPFrom: 5 }), {});
  assert.deepEqual(coerceHPBuffs({ hpBoost: 'x', bonusHPFrom: '' }), {});
  const hero = withCharacterDefaults(
    /** @type {any} */ ({ id: 'h', name: 'H', hpBoost: '-4', bonusHPFrom: 3 }),
  );
  assert.equal('hpBoost' in hero, false);
  assert.equal('bonusHPFrom' in hero, false);
  const orc = withCreatureDefaults(
    /** @type {any} */ ({ id: 'o', name: 'Orc', maxHP: 10, hpBoost: 'x' }),
  );
  assert.equal('hpBoost' in orc, false);
});

test('resourceList keeps records with a string id that is not empty', () => {
  assert.deepEqual(resourceList([{ id: 'hp' }, { id: '' }, { id: 3 }, {}, null]), [{ id: 'hp' }]);
  assert.deepEqual(resourceList('hp'), []);
});

test('asiChoicesOf keeps the record entries of either stored form', () => {
  assert.deepEqual(asiChoicesOf([null, { level: 4 }]), [{ level: 4 }]);
  assert.deepEqual(asiChoicesOf({ a: { type: 'asi' }, b: 3 }), { a: { type: 'asi' } });
  assert.deepEqual(asiChoicesOf(null), {});
  assert.deepEqual(asiChoicesOf('x'), {});
});

test('asiChoicesOf gives a Durable feat record its hit-die minimum', () => {
  const durable = { type: 'feat', feat: 'Durable', featId: 'durable' };
  assert.deepEqual(asiChoicesOf({ a: durable }), { a: { ...durable, hitDieFloor: true } });
  const flagged = { ...durable, hitDieFloor: true };
  assert.equal(asiChoicesOf({ a: flagged }).a, flagged);
  const tough = { type: 'feat', feat: 'Tough', featId: 'tough' };
  assert.equal(asiChoicesOf({ a: tough }).a, tough);
});

test('levelOf reads a whole number in range, or undefined', () => {
  assert.equal(levelOf(4.7, 1, 20), 4);
  assert.equal(levelOf('6', 1, 20), 6);
  assert.equal(levelOf(-3, 1, 20), 1);
  assert.equal(levelOf(99, 1, 20), 20);
  for (const bad of ['__proto__', '', {}, [], null, undefined, true, Infinity, NaN]) {
    assert.equal(levelOf(bad, 1, 20), undefined, JSON.stringify(bad));
  }
});
