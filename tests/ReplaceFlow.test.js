import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importProblem, importedToast, reloadToast } from '../src/view/ReplaceFlow.js';

test('importProblem refuses a campaign with no map', () => {
  assert.equal(importProblem({ nodes: [] }), 'That file has no map, so it is not a campaign file.');
  assert.equal(importProblem({ nodes: [{}] }), null);
});

test('reloadToast joins the notices and leaves out the empty ones', () => {
  assert.equal(
    reloadToast(['Campaign imported.', '', null, 'Undo history shortened.']),
    'Campaign imported. Undo history shortened.',
  );
});

test('importedToast names the library only when it was adopted', () => {
  assert.equal(importedToast(true), 'Campaign and library imported.');
  assert.equal(importedToast(false), 'Campaign imported.');
});
