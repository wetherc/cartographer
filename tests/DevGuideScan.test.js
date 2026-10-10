import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeLineCount, firstSentence, scanModules } from '../scripts/dev-guide/scan.mjs';

test('codeLineCount skips blank lines and line comments', () => {
  assert.equal(codeLineCount('const a = 1;\n\n   \n// note\n  // indented\nb();\n'), 2);
});

test('codeLineCount skips every line of a block comment', () => {
  const text = ['/**', ' * Docs.', ' * @param {number} n', ' */', 'export function f(n) {}'];
  assert.equal(codeLineCount(text.join('\n')), 1);
});

test('codeLineCount counts code before or after a comment', () => {
  assert.equal(codeLineCount('x(); // trailing'), 1);
  assert.equal(codeLineCount('/* lead */ y();'), 1);
  assert.equal(codeLineCount('/* a */ /* b */'), 0);
  assert.equal(codeLineCount('/* open\n still */ z();'), 1);
  assert.equal(codeLineCount('/* open\n still */'), 0);
});

test('codeLineCount returns 0 for empty text', () => {
  assert.equal(codeLineCount(''), 0);
});

test('firstSentence returns the first sentence of the first prose JSDoc block', () => {
  const text = [
    '/** @typedef {number} N */',
    '/**',
    ' * Rolls dice. Then logs.',
    ' * @param {N} n',
    ' */',
  ];
  assert.equal(firstSentence(text.join('\n')), 'Rolls dice.');
});

test('firstSentence returns a block with no sentence end whole, and empty text as empty', () => {
  assert.equal(firstSentence('/**\n * The dice\n * tray\n */'), 'The dice tray');
  assert.equal(firstSentence('/** @type {number} */ const a = 1;'), '');
  assert.equal(firstSentence('const a = 1;'), '');
});

test('scanModules groups every source module by area with a summary', () => {
  const areas = scanModules(new URL('..', import.meta.url).pathname);
  const app = areas.find((group) => group.area === 'app');
  assert.ok(app?.modules.some((m) => m.path === 'app/companions.js' && m.summary.length > 0));
  assert.ok(areas.find((group) => group.area === 'src')?.modules.some((m) => m.path === 'main.js'));
});
