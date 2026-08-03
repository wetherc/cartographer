import test from 'node:test';
import assert from 'node:assert/strict';

import { dedent, snippetOf } from '../docs/gallery/runtime.js';

/**
 * The gallery reads its code snippets back from the source of each story's
 * render function, so the two cannot drift. These cover the source
 * reshaping, which is the only pure logic on that page. The stories
 * themselves are checked by opening the page.
 */

test('dedent strips the shared indentation and the blank edges', () => {
  const text = '\n    first\n      second\n\n    third\n\n';
  assert.equal(dedent(text), 'first\n  second\n\nthird');
});

test('dedent leaves text that starts at the left margin alone', () => {
  assert.equal(dedent('one\ntwo'), 'one\ntwo');
});

test('snippetOf returns a one-expression body without its arrow', () => {
  const render = () => textButton('Save');
  assert.equal(snippetOf(render), "textButton('Save')");
});

test('snippetOf unwraps a braced body', () => {
  const render = () => {
    const host = 1;
    return host;
  };
  assert.equal(snippetOf(render), 'const host = 1;\nreturn host;');
});

test('snippetOf unwraps the array a multi-widget story returns', () => {
  const render = () => [chip('one'), chip('two')];
  assert.equal(snippetOf(render), "chip('one'), chip('two')");
});

test('snippetOf pulls continuation lines under their first line', () => {
  const render = () =>
    textareaField('Read aloud', {
      rows: 3,
    });
  assert.equal(snippetOf(render), "textareaField('Read aloud', {\n  rows: 3,\n})");
});

/* eslint-disable no-unused-vars */
/** The stories above never run, so these stand in for the real builders. */
function textButton(label) {
  return label;
}
function chip(label) {
  return label;
}
function textareaField(value, opts) {
  return value;
}
