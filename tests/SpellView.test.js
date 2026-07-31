import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spellLevelLabel,
  groupSpellsByLevel,
  spellStatus,
  spellRule,
  isSpellCastable,
  castableLeveledIds,
} from '../src/entities/SpellView.js';

/** @param {Partial<import('../src/types/spell.js').Spell>} over */
function spell(over) {
  return {
    id: over.id ?? 'x',
    name: over.name ?? 'X',
    level: over.level ?? 1,
    school: 'evocation',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '60 ft',
    components: ['V'],
    duration: { kind: 'instantaneous' },
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

test('spellStatus reports cantrip/known/prepared/preparable from the spellbook', () => {
  const character = /** @type {any} */ ({
    class: 'cleric',
    level: 3,
    spellbook: { cantrips: ['light'], known: ['bless', 'aid'], prepared: ['bless'] },
  });
  assert.deepEqual(spellStatus(character, spell({ id: 'light', level: 0 })), {
    cantrip: true,
    known: true,
    prepared: false,
    preparable: false,
  });
  assert.deepEqual(spellStatus(character, spell({ id: 'bless', level: 1 })), {
    cantrip: false,
    known: true,
    prepared: true,
    preparable: true,
  });
  assert.deepEqual(spellStatus(character, spell({ id: 'aid', level: 2 })), {
    cantrip: false,
    known: true,
    prepared: false,
    preparable: true,
  });
  assert.deepEqual(spellStatus(character, spell({ id: 'fire', level: 3 })), {
    cantrip: false,
    known: false,
    prepared: false,
    preparable: true,
  });
});

test('spellStatus never marks a known-rule caster spell preparable', () => {
  const bard = /** @type {any} */ ({
    class: 'bard',
    level: 3,
    spellbook: { cantrips: [], known: ['heroism'], prepared: [] },
  });
  assert.deepEqual(spellStatus(bard, spell({ id: 'heroism', level: 1 })), {
    cantrip: false,
    known: true,
    prepared: false,
    preparable: false,
  });
});

test('spellRule reads the source class, falling back to the first caster class', () => {
  const multiclass = /** @type {any} */ ({
    classes: [
      { classId: 'cleric', level: 2 },
      { classId: 'bard', level: 1 },
    ],
    level: 3,
    spellbook: {
      cantrips: [],
      known: ['bless', 'heroism', 'aid'],
      prepared: ['bless'],
      sources: { bless: 'cleric', heroism: 'bard' },
    },
  });
  assert.equal(spellRule(multiclass, 'bless'), 'prepared');
  assert.equal(spellRule(multiclass, 'heroism'), 'known');
  // No source recorded: the first caster class (cleric) governs.
  assert.equal(spellRule(multiclass, 'aid'), 'prepared');
  // No caster class at all: castable from the known list, so a legacy
  // character keeps casting what it knows.
  const classless = /** @type {any} */ ({ spellbook: { cantrips: [], known: [], prepared: [] } });
  assert.equal(spellRule(classless, 'bless'), 'known');
});

test('isSpellCastable gates prepared-rule spells on the prepared list only', () => {
  const cleric = /** @type {any} */ ({
    class: 'cleric',
    level: 3,
    spellbook: { cantrips: ['light'], known: ['bless', 'aid'], prepared: ['bless'] },
  });
  assert.equal(isSpellCastable(cleric, spell({ id: 'light', level: 0 })), true);
  assert.equal(isSpellCastable(cleric, spell({ id: 'bless', level: 1 })), true);
  assert.equal(isSpellCastable(cleric, spell({ id: 'aid', level: 2 })), false);
  const bard = /** @type {any} */ ({
    class: 'bard',
    level: 3,
    spellbook: { cantrips: [], known: ['heroism'], prepared: [] },
  });
  assert.equal(isSpellCastable(bard, spell({ id: 'heroism', level: 1 })), true);
});

test('castableLeveledIds lists prepared spells for prepared-rule classes and known ones otherwise', () => {
  const cleric = /** @type {any} */ ({
    class: 'cleric',
    level: 3,
    spellbook: { cantrips: ['light'], known: ['bless', 'aid'], prepared: ['bless'] },
  });
  assert.deepEqual(castableLeveledIds(cleric), ['bless']);
  const multiclass = /** @type {any} */ ({
    classes: [
      { classId: 'cleric', level: 2 },
      { classId: 'bard', level: 1 },
    ],
    level: 3,
    spellbook: {
      cantrips: [],
      known: ['bless', 'heroism', 'aid'],
      prepared: ['bless'],
      sources: { bless: 'cleric', heroism: 'bard', aid: 'cleric' },
    },
  });
  assert.deepEqual(castableLeveledIds(multiclass), ['bless', 'heroism']);
});
