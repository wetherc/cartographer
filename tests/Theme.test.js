import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, normalizeTheme, themeLabel } from '../src/view/Theme.js';

test('normalizeTheme keeps valid preferences and coerces everything else to system', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('system'), 'system');
  assert.equal(normalizeTheme(null), 'system');
  assert.equal(normalizeTheme(undefined), 'system');
  assert.equal(normalizeTheme('sepia'), 'system');
});

test('THEMES lists each preference once, system first', () => {
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
});

test('every theme has a distinct label', () => {
  const labels = THEMES.map(themeLabel);
  assert.deepEqual(labels, ['System', 'Light', 'Dark']);
  assert.equal(new Set(labels).size, THEMES.length);
});
