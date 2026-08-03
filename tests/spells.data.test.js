import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { CLASS_LIST } from '../src/entities/Classes.js';

const SCHOOLS = new Set([
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]);
const KINDS = new Set(['attack', 'save', 'heal', 'buff', 'utility']);
const ABILITIES = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const CASTER_IDS = new Set(CLASS_LIST.filter((c) => c.spellListId).map((c) => c.spellListId));

test('spell ids are unique', () => {
  const ids = DEFAULT_SPELLS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every spell is well-formed against the schema', () => {
  for (const spell of DEFAULT_SPELLS) {
    assert.ok(spell.id && spell.name, `${spell.id}: id and name`);
    assert.ok(
      Number.isInteger(spell.level) && spell.level >= 0 && spell.level <= 9,
      `${spell.id}: level`,
    );
    assert.ok(SCHOOLS.has(spell.school), `${spell.id}: school ${spell.school}`);
    assert.ok(spell.classes.length > 0, `${spell.id}: has classes`);
    for (const cls of spell.classes)
      assert.ok(CASTER_IDS.has(cls), `${spell.id}: class ${cls} is a real caster list`);
    assert.ok(KINDS.has(spell.effect.kind), `${spell.id}: effect kind`);
    if (spell.effect.kind === 'save')
      assert.ok(ABILITIES.has(spell.effect.saveAbility), `${spell.id}: save ability`);
  }
});

test('the corpus spans all effect kinds and cantrips through 9th level', () => {
  const kinds = new Set(DEFAULT_SPELLS.map((s) => s.effect.kind));
  for (const kind of KINDS) assert.ok(kinds.has(kind), `corpus includes a ${kind} spell`);
  const levels = new Set(DEFAULT_SPELLS.map((s) => s.level));
  assert.ok(levels.has(0), 'has cantrips');
  assert.ok(levels.has(9), 'has a 9th-level spell');
});
