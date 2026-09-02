import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classSpellLevelCap,
  canLearnSpell,
  learnableSpells,
} from '../src/entities/SpellLearning.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** @param {string} id @returns {import('../src/types/spell.js').Spell} */
function spell(id) {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  assert.ok(found, `fixture spell ${id} exists`);
  return found;
}

/** @param {import('../src/types/class.js').ClassRef[]} classes */
function classed(classes) {
  return /** @type {any} */ ({
    id: 'c1',
    name: 'Vess',
    classes,
    level: classes.reduce((s, c) => s + c.level, 0),
    stats: {},
    resources: [],
  });
}

test('classSpellLevelCap reads the single-class table for each caster type', () => {
  assert.equal(classSpellLevelCap('wizard', 1), 1);
  assert.equal(classSpellLevelCap('wizard', 3), 2);
  assert.equal(classSpellLevelCap('wizard', 5), 3);
  assert.equal(classSpellLevelCap('wizard', 17), 9);
  // A half caster has no slots at 1, first-level slots at 2, second at 5.
  assert.equal(classSpellLevelCap('paladin', 1), 0);
  assert.equal(classSpellLevelCap('paladin', 2), 1);
  assert.equal(classSpellLevelCap('paladin', 5), 2);
});

test('classSpellLevelCap follows the pact progression for a warlock', () => {
  assert.equal(classSpellLevelCap('warlock', 1), 1);
  assert.equal(classSpellLevelCap('warlock', 2), 1);
  assert.equal(classSpellLevelCap('warlock', 3), 2);
  assert.equal(classSpellLevelCap('warlock', 9), 5);
  assert.equal(classSpellLevelCap('warlock', 0), 0);
});

test('classSpellLevelCap is 0 for a martial or unknown class', () => {
  assert.equal(classSpellLevelCap('fighter', 20), 0);
  assert.equal(classSpellLevelCap('warlord', 5), 0);
});

test('a multiclass caster learns each class as a single-class caster', () => {
  // Cleric 3 / wizard 3 has third-level slots on the combined table, but
  // each class learns second-level spells at most.
  const duo = classed([
    { classId: 'cleric', level: 3 },
    { classId: 'wizard', level: 3 },
  ]);
  assert.equal(canLearnSpell(duo, spell('fireball')), false);
  assert.equal(canLearnSpell(duo, spell('hold-person')), true);
  assert.equal(canLearnSpell(duo, spell('invisibility')), true);
  // Wizard 5 alone reaches Fireball.
  assert.equal(canLearnSpell(classed([{ classId: 'wizard', level: 5 }]), spell('fireball')), true);
});

test('a warlock learns by its own pact level, not by another class slots', () => {
  const lock = classed([
    { classId: 'warlock', level: 2 },
    { classId: 'sorcerer', level: 3 },
  ]);
  // Invisibility is on both lists. The sorcerer 3 reaches it; the warlock 2
  // would not on its own.
  assert.equal(canLearnSpell(lock, spell('invisibility')), true);
  const lone = classed([{ classId: 'warlock', level: 2 }]);
  assert.equal(canLearnSpell(lone, spell('invisibility')), false);
  assert.equal(
    canLearnSpell(classed([{ classId: 'warlock', level: 3 }]), spell('invisibility')),
    true,
  );
});

test('the spell must be on the list of the class that reaches its level', () => {
  // Cleric 5 / wizard 1: the cleric reaches third level, but Fireball is not
  // a cleric spell, and the wizard 1 cannot reach it.
  const mixed = classed([
    { classId: 'cleric', level: 5 },
    { classId: 'wizard', level: 1 },
  ]);
  assert.equal(canLearnSpell(mixed, spell('fireball')), false);
  assert.equal(canLearnSpell(mixed, spell('bless')), true);
});

test('cantrips need only a class that lists them', () => {
  const pal = classed([{ classId: 'paladin', level: 1 }]);
  assert.equal(canLearnSpell(pal, spell('cure-wounds')), false, 'no slots at paladin 1');
  assert.equal(canLearnSpell(pal, spell('guidance')), false, 'not on the paladin list');
  const cleric = classed([{ classId: 'cleric', level: 1 }]);
  assert.equal(canLearnSpell(cleric, spell('guidance')), true);
  assert.equal(canLearnSpell(cleric, spell('eldritch-blast')), false);
});

test('a martial or classless character learns nothing', () => {
  assert.equal(canLearnSpell(classed([{ classId: 'fighter', level: 5 }]), spell('bless')), false);
  assert.deepEqual(learnableSpells(classed([]), DEFAULT_SPELLS), []);
});

test('learnableSpells keeps catalog order and filters by every rule', () => {
  const pal = classed([{ classId: 'paladin', level: 5 }]);
  const ids = learnableSpells(pal, DEFAULT_SPELLS).map((s) => s.id);
  assert.ok(ids.includes('cure-wounds'));
  assert.ok(ids.includes('bless'));
  assert.ok(!ids.includes('fireball'));
  assert.ok(!ids.includes('guidance'));
  const order = ids.map((id) => DEFAULT_SPELLS.findIndex((s) => s.id === id));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  for (const s of learnableSpells(pal, DEFAULT_SPELLS)) {
    assert.ok(s.classes.includes('paladin') && s.level <= 2, `${s.id} fits paladin 5`);
  }
});
