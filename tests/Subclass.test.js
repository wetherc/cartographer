import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canChooseSubclass,
  subclassName,
  withSubclass,
  subclassChoices,
  subclassNotice,
  OTHER_SUBCLASS,
} from '../src/entities/Subclass.js';
import { applyLevelChoices, asksForSubclass, hasChoiceAt } from '../src/entities/LevelAssign.js';
import { createCharacter, getClasses, getSpellbook } from '../src/entities/Character.js';
import { getSlotPools, getPactPool, withSpellSlots } from '../src/entities/SpellSlots.js';
import { createResource } from '../src/entities/Resource.js';
import { cantripLimit } from '../src/entities/Classes.js';

const EK = 'Eldritch Knight';

/**
 * @param {import('../src/types/class.js').ClassRef[]} classes
 * @param {number} [level]
 */
function classed(classes, level = classes.reduce((s, r) => s + r.level, 0)) {
  return {
    ...createCharacter('c1', 'Bron', { STR: 16, INT: 14, CON: 14 }),
    classes,
    level,
  };
}

test('canChooseSubclass waits for the subclass level of a held class', () => {
  assert.equal(canChooseSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter'), true);
  assert.equal(canChooseSubclass(classed([{ classId: 'fighter', level: 2 }]), 'fighter'), false);
  assert.equal(canChooseSubclass(classed([{ classId: 'cleric', level: 1 }]), 'cleric'), true);
  assert.equal(canChooseSubclass(classed([{ classId: 'fighter', level: 3 }]), 'rogue'), false);
  assert.equal(canChooseSubclass(classed([{ classId: 'bogus', level: 3 }]), 'bogus'), false);
});

test('subclassName stores the catalog name for a match and trims free text', () => {
  assert.equal(subclassName('fighter', 'eldritch-knight'), EK);
  assert.equal(subclassName('fighter', ' ELDRITCH knight '), EK);
  assert.equal(subclassName('fighter', '  Rune Knight '), 'Rune Knight');
  assert.equal(subclassName('fighter', '   '), '');
});

test('withSubclass makes a fighter an Eldritch Knight with slots and cantrips', () => {
  const knight = withSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter', EK);
  assert.deepEqual(getClasses(knight), [{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.deepEqual(
    getSlotPools(knight).map((p) => p.max),
    [2],
  );
  assert.equal(cantripLimit(knight), 2);
});

test('withSubclass returns the character unchanged for no change or no choice yet', () => {
  const knight = withSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter', EK);
  assert.equal(withSubclass(knight, 'fighter', 'eldritch-knight'), knight);
  const young = classed([{ classId: 'fighter', level: 2 }]);
  assert.equal(withSubclass(young, 'fighter', EK), young);
  const plain = classed([{ classId: 'fighter', level: 3 }]);
  assert.equal(withSubclass(plain, 'fighter', ''), plain, 'clearing nothing');
});

test('withSubclass keeps slots and spells when the casting does not change', () => {
  const cleric = withSpellSlots(classed([{ classId: 'cleric', level: 3 }]));
  const named = withSubclass(cleric, 'cleric', 'life');
  assert.equal(getClasses(named)[0].subclass, 'Life Domain');
  assert.equal(named.resources, cleric.resources, 'no re-derive');
  const cleared = withSubclass(named, 'cleric', '');
  assert.deepEqual(getClasses(cleared), [{ classId: 'cleric', level: 3 }]);
});

test('withSubclass drops the slots and the spells of a class that stops casting', () => {
  let knight = withSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter', EK);
  knight = {
    ...knight,
    spellbook: {
      cantrips: ['fire-bolt', 'light'],
      known: ['magic-missile'],
      prepared: [],
      sources: { 'fire-bolt': 'fighter', 'magic-missile': 'fighter' },
    },
  };
  const champion = withSubclass(knight, 'fighter', 'Champion');
  assert.deepEqual(getSlotPools(champion), []);
  const book = getSpellbook(champion);
  assert.deepEqual(book.cantrips, ['light'], 'a spell with no recorded class stays');
  assert.deepEqual(book.known, []);
  assert.deepEqual(book.sources, {});
});

test('withSubclass keeps the other class slots when an Eldritch Knight multiclass stops casting', () => {
  let c = classed([
    { classId: 'fighter', level: 3 },
    { classId: 'wizard', level: 3 },
  ]);
  c = withSubclass(c, 'fighter', EK);
  assert.deepEqual(
    getSlotPools(c).map((p) => p.max),
    [4, 3],
  );
  const cleared = withSubclass(c, 'fighter', '');
  assert.deepEqual(
    getSlotPools(cleared).map((p) => p.max),
    [4, 2],
  );
});

test('withSubclass strips a pact pool when no caster class is left', () => {
  const c = withSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter', EK);
  const withPact = {
    ...c,
    resources: [...c.resources, createResource('pact-1', 'Pact', 'mana', 1)],
  };
  const cleared = withSubclass(withPact, 'fighter', 'Champion');
  assert.equal(getPactPool(cleared), null);
  assert.deepEqual(getSlotPools(cleared), []);
});

test('subclassChoices lists the catalog, a stored custom name, None, and Other', () => {
  assert.deepEqual(subclassChoices('fighter'), [
    { value: 'Champion', label: 'Champion' },
    { value: EK, label: `${EK} (casts spells)` },
    { value: OTHER_SUBCLASS, label: 'Other…' },
  ]);
  assert.deepEqual(
    subclassChoices('fighter', 'Rune Knight').map((o) => o.value),
    ['', 'Champion', EK, 'Rune Knight', OTHER_SUBCLASS],
  );
  assert.deepEqual(
    subclassChoices('fighter', 'champion').map((o) => o.value),
    ['', 'Champion', EK, OTHER_SUBCLASS],
  );
  assert.deepEqual(subclassChoices('bogus'), [{ value: OTHER_SUBCLASS, label: 'Other…' }]);
});

test('subclassNotice names the subclass and points a caster to the Spellbook', () => {
  const knight = withSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter', EK);
  assert.equal(
    subclassNotice(knight, 'fighter'),
    'Fighter: Eldritch Knight. Learn its spells in the Spellbook tab.',
  );
  const champ = withSubclass(knight, 'fighter', 'Champion');
  assert.equal(subclassNotice(champ, 'fighter'), 'Fighter: Champion.');
  const none = withSubclass(champ, 'fighter', '');
  assert.equal(subclassNotice(none, 'fighter'), 'Fighter: no martial archetype.');
  assert.equal(subclassNotice(classed([]), 'bogus'), 'bogus: no subclass.');
});

test('asksForSubclass fires once, as the class reaches its subclass level', () => {
  assert.equal(asksForSubclass(classed([{ classId: 'fighter', level: 3 }]), 'fighter'), true);
  assert.equal(asksForSubclass(classed([{ classId: 'fighter', level: 4 }]), 'fighter'), false);
  assert.equal(
    asksForSubclass(classed([{ classId: 'fighter', level: 3, subclass: EK }]), 'fighter'),
    false,
  );
  assert.equal(asksForSubclass(classed([{ classId: 'fighter', level: 3 }]), 'rogue'), false);
});

test('applyLevelChoices applies a subclass picked at the subclass level', () => {
  const c = classed([{ classId: 'fighter', level: 2 }], 3);
  const next = applyLevelChoices(c, { classId: 'fighter', skills: [], stamps: [], subclass: EK });
  assert.deepEqual(getClasses(next), [{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.deepEqual(
    getSlotPools(next).map((p) => p.max),
    [2],
  );
});

test('a chosen subclass claims its level against the donor move', () => {
  const knight = classed([{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.equal(hasChoiceAt(knight, 'fighter', 3), true);
  assert.equal(hasChoiceAt(knight, 'fighter', 4), false);
  const cleric = classed([{ classId: 'cleric', level: 2, subclass: 'Life Domain' }]);
  assert.equal(hasChoiceAt(cleric, 'cleric', 2), false, 'a level-1 domain is not moved');
  assert.equal(
    hasChoiceAt(classed([{ classId: 'bogus', level: 3, subclass: 'x' }]), 'bogus', 3),
    false,
  );
});
