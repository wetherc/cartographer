import { test } from 'node:test';
import assert from 'node:assert/strict';
import { despawnSummons, isSummonedBy, stampSummon } from '../src/entities/Summons.js';

/** @param {string} id @param {object} [over] */
function creature(id, over = {}) {
  return /** @type {any} */ ({
    id,
    name: 'Wolf',
    disposition: 'hostile',
    maxHP: 11,
    currentHP: 11,
    stats: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6, AC: 13 },
    location: { nodeId: 'n1', tileId: '0,0' },
    conditions: [],
    met: true,
    weapon: null,
    armor: null,
    ...over,
  });
}

const CAST = { spellId: 'conjure-animals', spellName: 'Conjure Animals', casterId: 'druid' };

test('stampSummon marks a creature with the cast, and copies the stamp', () => {
  const plain = creature('wolf');
  const stamped = stampSummon(plain, CAST);
  assert.deepEqual(stamped.summonedBy, CAST);
  assert.notEqual(stamped, plain, 'the original is left alone');
  assert.equal(plain.summonedBy, undefined);
  assert.notEqual(stamped.summonedBy, CAST, 'the stamp is a copy, not the object handed in');
});

test('isSummonedBy needs both the caster and the spell to match', () => {
  const wolf = stampSummon(creature('wolf'), CAST);
  assert.equal(isSummonedBy(wolf, 'druid', 'conjure-animals'), true);
  assert.equal(isSummonedBy(wolf, 'druid', 'spirit-guardians'), false);
  assert.equal(isSummonedBy(wolf, 'ranger', 'conjure-animals'), false);
  // A creature the GM placed carries no stamp and belongs to no cast.
  assert.equal(isSummonedBy(creature('goblin'), 'druid', 'conjure-animals'), false);
});

test('despawnSummons removes only the creatures of that one cast', () => {
  const list = [
    creature('goblin'),
    stampSummon(creature('wolf-1'), CAST),
    stampSummon(creature('wolf-2'), CAST),
    stampSummon(creature('bear'), { ...CAST, casterId: 'ranger' }),
    stampSummon(creature('spirit'), { ...CAST, spellId: 'spirit-guardians' }),
  ];
  const { creatures, despawned } = despawnSummons(list, 'druid', 'conjure-animals');
  assert.deepEqual(
    despawned.map((c) => c.id),
    ['wolf-1', 'wolf-2'],
  );
  assert.deepEqual(
    creatures.map((c) => c.id),
    ['goblin', 'bear', 'spirit'],
  );
});

test('despawnSummons takes a defeated summon away with the living ones', () => {
  const list = [stampSummon(creature('wolf-1', { currentHP: 0 }), CAST)];
  const { creatures, despawned } = despawnSummons(list, 'druid', 'conjure-animals');
  assert.equal(despawned.length, 1);
  assert.deepEqual(creatures, []);
});

test('despawnSummons hands back the same list when nothing matched', () => {
  const list = [creature('goblin'), stampSummon(creature('bear'), { ...CAST, casterId: 'ranger' })];
  const { creatures, despawned } = despawnSummons(list, 'druid', 'conjure-animals');
  assert.equal(creatures, list, 'identity is preserved, so the caller can skip the write');
  assert.deepEqual(despawned, []);
});
