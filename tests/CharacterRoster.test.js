import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterDependsOn } from '../src/ui/CharacterRoster.js';

// The roster's rows carry the current-row marker and the place-on-map
// action. Neither lives in a character object, so the repaint guard reads
// them through this value.
test('the same selection and place column give the same value', () => {
  assert.equal(rosterDependsOn('c1', true), rosterDependsOn('c1', true));
  assert.equal(rosterDependsOn(null, false), rosterDependsOn(null, false));
});

test('a different selection gives a different value', () => {
  assert.notEqual(rosterDependsOn('c1', true), rosterDependsOn('c2', true));
});

test('a selection cleared to null gives a different value', () => {
  assert.notEqual(rosterDependsOn('c1', true), rosterDependsOn(null, true));
});

test('the place column gives a different value', () => {
  assert.notEqual(rosterDependsOn('c1', true), rosterDependsOn('c1', false));
});

// The two parts are kept apart, so a character id can never read as a
// change in the place column or the other way around.
test('an id that looks like the place flag does not collide', () => {
  assert.notEqual(rosterDependsOn('1:c1', false), rosterDependsOn('c1', true));
});
