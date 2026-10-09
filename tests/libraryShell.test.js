import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../styles/library.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/LibraryPanel.js', import.meta.url), 'utf8');

/** The declarations of every rule for one selector, joined. @param {string} selector */
function block(selector) {
  const parts = css.split(`${selector} {`).slice(1);
  assert.ok(parts.length > 0, `${selector} has a rule`);
  return parts.map((part) => part.slice(0, part.indexOf('}'))).join('\n');
}

test('Library mode is a fixed screen, so the header stays in view', () => {
  const body = block('body.mode-library');
  assert.match(body, /height: 100dvh;/);
  assert.match(body, /overflow: hidden;/);
  assert.match(block('body.mode-library #library-tools'), /overflow-y: auto;/);
});

test('the Library editor opens in a dialog and leaves the list in place', () => {
  assert.match(panel, /openDialog\(/);
  assert.doesNotMatch(panel, /chrome\.hidden = true/);
  assert.match(block('.modal--library-editor'), /overflow-y: auto;/);
});
