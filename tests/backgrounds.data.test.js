import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BACKGROUNDS } from '../src/data/backgrounds.js';
import { SKILL_ABILITIES } from '../src/data/skills.js';

test('background ids are unique and match slugified names', () => {
  const ids = DEFAULT_BACKGROUNDS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of DEFAULT_BACKGROUNDS)
    assert.equal(b.id, b.name.toLowerCase().replace(/\s+/g, '-'));
});

test('every background grants exactly two distinct real skills', () => {
  for (const b of DEFAULT_BACKGROUNDS) {
    assert.equal(b.skills.length, 2, `${b.id} skill count`);
    assert.notEqual(b.skills[0], b.skills[1], `${b.id} duplicate skill`);
    for (const id of b.skills) assert.ok(SKILL_ABILITIES[id], `${b.id} unknown skill ${id}`);
  }
});

test('tool grants are lowercase names', () => {
  for (const b of DEFAULT_BACKGROUNDS) {
    for (const tool of b.tools) {
      assert.ok(typeof tool === 'string' && tool.length > 0, `${b.id} tool`);
      assert.equal(tool, tool.toLowerCase(), `${b.id} not lowercase: ${tool}`);
    }
  }
});

test('language counts are small non-negative integers', () => {
  for (const b of DEFAULT_BACKGROUNDS) {
    assert.ok(
      Number.isInteger(b.languageCount) && b.languageCount >= 0 && b.languageCount <= 2,
      `${b.id} languageCount ${b.languageCount}`,
    );
  }
});

test('every background names a feature', () => {
  for (const b of DEFAULT_BACKGROUNDS)
    assert.ok(typeof b.feature === 'string' && b.feature.length > 0, `${b.id} feature`);
});
