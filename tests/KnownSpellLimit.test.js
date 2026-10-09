import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classSpellsKnown, knownSpellIssues } from '../src/entities/KnownSpellLimit.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** @param {string[]} ids */
const resolve = (ids) => DEFAULT_SPELLS.filter((s) => ids.includes(s.id));

/**
 * @param {import('../src/types/class.js').ClassRef[]} classes
 * @param {Partial<import('../src/types/entities.js').Spellbook>} book
 */
function caster(classes, book) {
  return /** @type {any} */ ({
    id: 'c1',
    name: 'Wren',
    classes,
    level: classes.reduce((s, c) => s + c.level, 0),
    stats: {},
    resources: [],
    spellbook: { cantrips: [], known: [], prepared: [], ...book },
  });
}

test('the spells-known tables follow the 2014 class tables', () => {
  assert.equal(classSpellsKnown('bard', 1), 4);
  assert.equal(classSpellsKnown('bard', 4), 7);
  assert.equal(classSpellsKnown('bard', 20), 22);
  assert.equal(classSpellsKnown('sorcerer', 1), 2);
  assert.equal(classSpellsKnown('sorcerer', 20), 15);
  assert.equal(classSpellsKnown('warlock', 1), 2);
  assert.equal(classSpellsKnown('warlock', 10), 10);
  assert.equal(classSpellsKnown('ranger', 1), 0);
  assert.equal(classSpellsKnown('ranger', 2), 2);
  assert.equal(classSpellsKnown('ranger', 20), 11);
  assert.equal(classSpellsKnown('wizard', 5), null, 'a prepared caster has no table');
  assert.equal(classSpellsKnown('nope', 5), null);
  assert.equal(classSpellsKnown('bard', 0), 4, 'a bad level reads as level 1');
});

test('a sorcerer past its limit gets one warning', () => {
  const sorc = caster([{ classId: 'sorcerer', level: 1 }], {
    known: ['magic-missile', 'shield', 'sleep'],
  });
  assert.deepEqual(knownSpellIssues(sorc, resolve), [
    'Sorcerer 1 knows 2 leveled spells, and this sheet has 3.',
  ]);
  const ok = caster([{ classId: 'sorcerer', level: 1 }], { known: ['magic-missile', 'shield'] });
  assert.deepEqual(knownSpellIssues(ok, resolve), []);
});

test('a warlock does not count its Mystic Arcanum spells', () => {
  const lock = caster([{ classId: 'warlock', level: 11 }], {
    known: ['hellish-rebuke', 'circle-of-death'],
  });
  assert.deepEqual(knownSpellIssues(lock, resolve), []);
  const over = caster([{ classId: 'warlock', level: 1 }], {
    known: ['hellish-rebuke', 'witch-bolt', 'charm-person', 'circle-of-death'],
  });
  assert.deepEqual(knownSpellIssues(over, resolve), [
    'Warlock 1 knows 2 leveled spells, and this sheet has 3.',
  ]);
});

test('a multiclass caster counts each spell under its recorded class', () => {
  const both = caster(
    [
      { classId: 'wizard', level: 3 },
      { classId: 'ranger', level: 2 },
    ],
    {
      known: ['cure-wounds', 'hunters-mark', 'magic-missile', 'shield', 'sleep'],
      sources: { 'cure-wounds': 'ranger', 'hunters-mark': 'ranger' },
    },
  );
  assert.deepEqual(knownSpellIssues(both, resolve), [], 'the wizard spells do not count');
  const ranger1 = caster([{ classId: 'ranger', level: 1 }], { known: ['hunters-mark'] });
  assert.deepEqual(knownSpellIssues(ranger1, resolve), [
    'Ranger 1 knows 0 leveled spells, and this sheet has 1.',
  ]);
});
