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

test('shift makes it the redo that matches the mode', () => {
  assert.equal(shortcutFor({ key: 'z', ctrlKey: true, shiftKey: true }, gmInBuild), 'redo-stroke');
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

test('the help dialog documents every shortcut', () => {
  assert.deepEqual(SHORTCUT_HELP, [
    '?: show this list',
    '/: search the campaign',
    'Ctrl/Cmd+S: save the campaign',
    'Ctrl/Cmd+Z: undo (Build: last edit; Play: previous save)',
    'Ctrl/Cmd+Shift+Z: redo (Build: last undone edit; Play: next save)',
    'B / P: switch to Build / Play mode',
    'C: open or close the full character sheet (Play)',
    'Escape: close a dialog or the full sheet, or put down the fog brush',
    'On the map (click it first):',
    'Arrows: move the cursor. Enter / Space: act on the cursor cell',
    '+ / -: zoom',
    'Arrow off an edge twice: leave through that side (the first press lights the exit)',
    'Shift+F10 or Menu key: open the tile menu (Build)',
    'In the World tree:',
    'Up / Down: move between rows. Home / End: first / last row',
    'Right / Left: open / close a row, or move to its child / parent',
    'Enter / Space: open the map. Shift+F10 or Menu key: open the row menu',
  ]);
});

test('a player cannot save, undo, or redo from the keyboard', () => {
  assert.equal(shortcutFor({ key: 's', ctrlKey: true }, player), null);
  assert.equal(shortcutFor({ key: 'z', metaKey: true }, player), null);
  assert.equal(shortcutFor({ key: 'z', ctrlKey: true, shiftKey: true }, player), null);
});

test('C opens the full sheet in Play mode only, for either role', () => {
  assert.equal(shortcutFor({ key: 'c' }, gmInPlay), 'sheet');
  assert.equal(shortcutFor({ key: 'c' }, player), 'sheet');
  assert.equal(shortcutFor({ key: 'c' }, gmInBuild), null);
});

test('slash focuses the search box for the GM and for players, with no modifier', () => {
  assert.equal(shortcutFor({ key: '/' }, gmInPlay), 'search');
  assert.equal(shortcutFor({ key: '/' }, gmInBuild), 'search');
  assert.equal(shortcutFor({ key: '/' }, player), 'search');
  assert.equal(shortcutFor({ key: '/', ctrlKey: true }, gmInPlay), null);
  assert.ok(SHORTCUT_HELP.some((line) => line.startsWith('/:')));
});
