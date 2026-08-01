import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repaintNeeded } from '../src/ui/listPanel.js';

/**
 * Two row objects, held by identity the way a panel holds them between
 * paints. The guard compares references, so the fixture returns the same
 * objects to every caller in a test.
 */
const alpha = { id: 'a', name: 'Goblin Scout' };
const beta = { id: 'b', name: 'Orc Brute' };

/**
 * @param {object} [over]
 * @returns {import('../src/ui/listPanel.js').PaintState<object>}
 */
function state(over = {}) {
  return { gm: true, rows: [alpha, beta], dependsOn: undefined, ...over };
}

test('the first update always paints', () => {
  assert.equal(repaintNeeded(null, state()), true);
});

test('the same gate, rows, and dependency need no paint', () => {
  assert.equal(repaintNeeded(state(), state()), false);
});

test('a flipped gate needs a paint', () => {
  assert.equal(repaintNeeded(state({ gm: true }), state({ gm: false })), true);
});

test('a replaced row object needs a paint', () => {
  const edited = { ...beta, name: 'Orc Chief' };
  assert.equal(repaintNeeded(state(), state({ rows: [alpha, edited] })), true);
});

// A row object that is equal by value but not by reference is what a
// cross-tab adoption used to produce for every entity. The guard cannot see
// the difference, which is why `storage/Reconcile.js` keeps the live objects.
test('an equal row object with a new identity needs a paint', () => {
  assert.equal(repaintNeeded(state(), state({ rows: [alpha, { ...beta }] })), true);
});

test('a shorter or longer row list needs a paint', () => {
  assert.equal(repaintNeeded(state(), state({ rows: [alpha] })), true);
  assert.equal(repaintNeeded(state(), state({ rows: [alpha, beta, alpha] })), true);
});

test('a reorder of the same objects needs a paint', () => {
  assert.equal(repaintNeeded(state(), state({ rows: [beta, alpha] })), true);
});

// The Active encounter tab draws a Start combat button that no row
// describes. `dependsOn` is how the guard sees it appear and disappear.
test('a changed dependency needs a paint even when the rows hold', () => {
  assert.equal(repaintNeeded(state({ dependsOn: 1 }), state({ dependsOn: 0 })), true);
  assert.equal(repaintNeeded(state({ dependsOn: 0 }), state({ dependsOn: 0 })), false);
});

test('a dependency is compared by value, not by identity', () => {
  assert.equal(
    repaintNeeded(state({ dependsOn: 'nearby' }), state({ dependsOn: 'nearby' })),
    false,
  );
  assert.equal(repaintNeeded(state({ dependsOn: false }), state({ dependsOn: true })), true);
});

// A dependency built as an object is a mistake worth surfacing: a fresh
// object per read differs from the last one every time, which is the
// unconditional repaint this option exists to avoid.
test('an object dependency never matches', () => {
  assert.equal(
    repaintNeeded(state({ dependsOn: { open: true } }), state({ dependsOn: { open: true } })),
    true,
  );
});

test('an absent dependency matches itself', () => {
  assert.equal(repaintNeeded(state(), state()), false);
  assert.equal(repaintNeeded(state({ dependsOn: undefined }), state({ dependsOn: null })), true);
});
