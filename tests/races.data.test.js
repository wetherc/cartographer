import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RACES } from '../src/data/races.js';
import { SKILL_ABILITIES } from '../src/data/skills.js';

const ABILITIES = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const SIZES = new Set(['small', 'medium']);

test('race ids are unique and match slugified names', () => {
  const ids = DEFAULT_RACES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of DEFAULT_RACES) assert.equal(r.id, r.name.toLowerCase());
});

test('ability increases use valid abilities and positive amounts', () => {
  for (const r of DEFAULT_RACES) {
    const entries = Object.entries(r.abilityIncreases);
    assert.ok(entries.length > 0, `${r.id} grants no increases`);
    for (const [ability, amount] of entries) {
      assert.ok(ABILITIES.has(ability), `${r.id} ability ${ability}`);
      assert.ok(Number.isInteger(amount) && amount >= 1 && amount <= 2, `${r.id} amount ${amount}`);
    }
  }
});

test('size, speed, and darkvision stay within the SRD shapes', () => {
  for (const r of DEFAULT_RACES) {
    assert.ok(SIZES.has(r.size), `${r.id} size`);
    assert.ok(r.speed === 25 || r.speed === 30, `${r.id} speed ${r.speed}`);
    assert.ok(r.darkvision === 0 || r.darkvision === 60, `${r.id} darkvision ${r.darkvision}`);
  }
});

test('granted skill proficiencies reference real skill ids', () => {
  for (const r of DEFAULT_RACES) {
    for (const id of r.skills) assert.ok(SKILL_ABILITIES[id], `${r.id} unknown skill ${id}`);
  }
});

test('resistances and weapon grants are lowercase names', () => {
  for (const r of DEFAULT_RACES) {
    for (const value of [...r.resistances, ...r.weapons])
      assert.equal(value, value.toLowerCase(), `${r.id} not lowercase: ${value}`);
  }
});

test('every race speaks Common and carries at least one trait', () => {
  for (const r of DEFAULT_RACES) {
    assert.ok(r.languages.includes('Common'), `${r.id} languages`);
    assert.ok(r.traits.length > 0, `${r.id} traits`);
    for (const t of r.traits) assert.ok(typeof t === 'string' && t.length > 0, `${r.id} trait`);
  }
});
