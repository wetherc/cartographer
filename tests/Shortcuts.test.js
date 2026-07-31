import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SHORTCUT_HELP, shortcutFor } from '../src/view/Shortcuts.js';

const gmInPlay = { mode: 'play', gm: true };
const gmInBuild = { mode: 'build', gm: true };
const player = { mode: 'play', gm: false };

test('either command key saves, in any mode and either case', () => {
  assert.equal(shortcutFor({ key: 's', ctrlKey: true }, gmInPlay), 'save');
  assert.equal(shortcutFor({ key: 's', metaKey: true }, gmInBuild), 'save');
  assert.equal(shortcutFor({ key: 'S', ctrlKey: true, shiftKey: true }, gmInPlay), 'save');
});

test('undo is the stroke-level one in Build and the save-level one elsewhere', () => {
  assert.equal(shortcutFor({ key: 'z', ctrlKey: true }, gmInBuild), 'undo-stroke');
  assert.equal(shortcutFor({ key: 'z', ctrlKey: true }, gmInPlay), 'undo');
  assert.equal(shortcutFor({ key: 'z', metaKey: true }, { mode: 'library', gm: true }), 'undo');
});

test('shift makes it a redo, and always the save-level one', () => {
  assert.equal(shortcutFor({ key: 'z', ctrlKey: true, shiftKey: true }, gmInBuild), 'redo');
  assert.equal(shortcutFor({ key: 'z', metaKey: true, shiftKey: true }, gmInPlay), 'redo');
});

test('the GM switches mode with a bare letter', () => {
  assert.equal(shortcutFor({ key: 'b' }, gmInPlay), 'build');
  assert.equal(shortcutFor({ key: 'p' }, gmInBuild), 'play');
});

test('a player cannot switch mode', () => {
  assert.equal(shortcutFor({ key: 'b' }, player), null);
  assert.equal(shortcutFor({ key: 'p' }, player), null);
});

test('the mode letters are case-sensitive, so shift-B is not a mode switch', () => {
  assert.equal(shortcutFor({ key: 'B' }, gmInPlay), null);
});

test('a held modifier takes the letter away from the mode switches', () => {
  assert.equal(shortcutFor({ key: 'b', ctrlKey: true }, gmInPlay), null);
  assert.equal(shortcutFor({ key: 'p', altKey: true }, gmInPlay), null);
  assert.equal(shortcutFor({ key: '?', metaKey: true }, gmInPlay), null);
});

test('help is open to everyone', () => {
  assert.equal(shortcutFor({ key: '?' }, gmInPlay), 'help');
  assert.equal(shortcutFor({ key: '?' }, player), 'help');
});

test('an unbound key asks for nothing', () => {
  assert.equal(shortcutFor({ key: 'q' }, gmInPlay), null);
  assert.equal(shortcutFor({ key: 'Escape' }, gmInPlay), null);
  assert.equal(shortcutFor({ key: 'a', ctrlKey: true }, gmInPlay), null);
});

test('every documented shortcut line says something', () => {
  assert.ok(SHORTCUT_HELP.length > 0);
  for (const line of SHORTCUT_HELP) assert.ok(line.trim().length > 0);
});
