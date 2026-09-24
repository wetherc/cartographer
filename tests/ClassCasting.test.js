import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subclassDef,
  casterDefFor,
  casterTypeOf,
  isCasterRef,
  spellListOf,
  casterName,
  castsAs,
} from '../src/entities/ClassCasting.js';
import { getClass } from '../src/entities/Classes.js';

const EK = { classId: 'fighter', level: 3, subclass: 'Eldritch Knight' };

test('subclassDef matches a catalog subclass by id or by name without case', () => {
  assert.equal(subclassDef('fighter', 'eldritch-knight')?.name, 'Eldritch Knight');
  assert.equal(subclassDef('fighter', '  eldritch KNIGHT ')?.id, 'eldritch-knight');
  assert.equal(subclassDef('cleric', 'life')?.name, 'Life Domain');
  assert.equal(subclassDef('rogue', 'Arcane Trickster')?.id, 'arcane-trickster');
});

test('subclassDef returns null for free text, a blank, a non-string, or no class', () => {
  assert.equal(subclassDef('fighter', 'Rune Knight'), null);
  assert.equal(subclassDef('fighter', '   '), null);
  assert.equal(subclassDef('fighter', 7), null);
  assert.equal(subclassDef('fighter', undefined), null);
  assert.equal(subclassDef('', 'Eldritch Knight'), null);
  assert.equal(subclassDef('bogus', 'Eldritch Knight'), null);
  assert.equal(subclassDef('rogue', 'Eldritch Knight'), null, 'another class does not match');
});

test('casterDefFor merges a casting subclass from the subclass level on', () => {
  const def = casterDefFor(EK);
  assert.equal(def?.casterType, 'third');
  assert.equal(def?.spellAbility, 'INT');
  assert.equal(def?.spellListId, 'wizard');
  assert.equal(def?.knownRule, 'known');
  assert.equal(def?.hitDie, 10, 'the class fields stay');
  assert.ok(Object.isFrozen(def));
  assert.equal(casterDefFor({ ...EK, subclass: 'eldritch-knight' }), def, 'one object per pair');
});

test('casterDefFor reads the plain class below the subclass level or without casting', () => {
  const fighter = getClass('fighter');
  assert.equal(casterDefFor({ ...EK, level: 2 }), fighter);
  assert.equal(casterDefFor({ classId: 'fighter', subclass: 'Eldritch Knight' }), fighter);
  assert.equal(casterDefFor({ ...EK, subclass: 'Champion' }), fighter);
  assert.equal(casterDefFor({ classId: 'fighter', level: 5 }), fighter);
  assert.equal(casterDefFor({ classId: 'bogus', level: 5 }), null);
});

test('the ref readers answer for a subclass caster, a class caster, and a non-caster', () => {
  assert.equal(casterTypeOf(EK), 'third');
  assert.equal(casterTypeOf({ classId: 'wizard', level: 1 }), 'full');
  assert.equal(casterTypeOf({ classId: 'bogus', level: 1 }), 'none');
  assert.equal(isCasterRef(EK), true);
  assert.equal(isCasterRef({ ...EK, subclass: 'Champion' }), false);
  assert.equal(spellListOf(EK), 'wizard');
  assert.equal(spellListOf({ classId: 'cleric', level: 1 }), 'cleric');
  assert.equal(spellListOf({ classId: 'bogus', level: 1 }), 'bogus');
});

test('casterName names a casting subclass, else the class, else the id', () => {
  assert.equal(casterName(EK), 'Eldritch Knight');
  assert.equal(casterName({ ...EK, level: 2 }), 'Fighter');
  assert.equal(casterName({ classId: 'cleric', level: 3, subclass: 'life' }), 'Cleric');
  assert.equal(casterName({ classId: 'bogus', level: 1 }), 'bogus');
});

test('castsAs judges a scalar class and subclass pair at a caster level', () => {
  assert.equal(castsAs('fighter', 'Eldritch Knight', 3), true);
  assert.equal(castsAs('fighter', 'Eldritch Knight', 2), false);
  assert.equal(castsAs('wizard', undefined, 1), true);
  assert.equal(castsAs(undefined, 'Eldritch Knight', 3), false);
  assert.equal(castsAs('', undefined, 3), false);
});
