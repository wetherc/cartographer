import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellLevelLabel, groupSpellsByLevel, spellStatus } from '../src/entities/SpellView.js';

/** @param {Partial<import('../src/types/spell.js').Spell>} over */
function spell(over) {
  return {
    id: over.id ?? 'x',
    name: over.name ?? 'X',
    level: over.level ?? 1,
    school: 'evocation',
    classes: ['wizard'],
    castingTime: '1 action',
    range: '60 ft',
    components: ['V'],
    duration: 'Instant',
    concentration: false,
    ritual: false,
    description: '',
    effect: { kind: 'utility' },
    ...over,
  };
}

test('spellLevelLabel names cantrips and leveled groups', () => {
  assert.equal(spellLevelLabel(0), 'Cantrips');
  assert.equal(spellLevelLabel(1), 'Level 1');
  assert.equal(spellLevelLabel(9), 'Level 9');
});

test('groupSpellsByLevel sorts levels ascending and names within a level', () => {
  const groups = groupSpellsByLevel([
    spell({ id: 'b', name: 'Bolt', level: 1 }),
    spell({ id: 'a', name: 'Arc', level: 1 }),
    spell({ id: 'c', name: 'Cinder', level: 0 }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.level, g.label]),
    [
      [0, 'Cantrips'],
      [1, 'Level 1'],
    ],
  );
  assert.deepEqual(
    groups[1].spells.map((s) => s.id),
    ['a', 'b'],
  );
});

test('groupSpellsByLevel collapses duplicate ids', () => {
  const groups = groupSpellsByLevel([
    spell({ id: 'a', name: 'Arc', level: 2 }),
    spell({ id: 'a', name: 'Arc', level: 2 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].spells.length, 1);
});

test('spellStatus reports cantrip/known/prepared from the spellbook', () => {
  const character = {
    spellbook: { cantrips: ['light'], known: ['bless', 'aid'], prepared: ['bless'] },
  };
  assert.deepEqual(spellStatus(/** @type {any} */ (character), spell({ id: 'light', level: 0 })), {
    cantrip: true,
    known: true,
    prepared: false,
  });
  assert.deepEqual(spellStatus(/** @type {any} */ (character), spell({ id: 'bless', level: 1 })), {
    cantrip: false,
    known: true,
    prepared: true,
  });
  assert.deepEqual(spellStatus(/** @type {any} */ (character), spell({ id: 'aid', level: 2 })), {
    cantrip: false,
    known: true,
    prepared: false,
  });
  assert.deepEqual(spellStatus(/** @type {any} */ (character), spell({ id: 'fire', level: 3 })), {
    cantrip: false,
    known: false,
    prepared: false,
  });
});
