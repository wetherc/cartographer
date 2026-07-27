import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '../src/util/deepFreeze.js';

test('deepFreeze freezes nested objects and arrays in place', () => {
  const value = { a: { b: [{ c: 1 }] } };
  assert.equal(deepFreeze(value), value, 'the same value comes back');
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.a));
  assert.ok(Object.isFrozen(value.a.b));
  assert.ok(Object.isFrozen(value.a.b[0]));
});

test('deepFreeze makes a write throw rather than silently sharing state', () => {
  const frozen = deepFreeze([{ name: 'Club', damage: [{ sides: 4 }] }]);
  assert.throws(() => {
    /** @type {any} */ (frozen)[0].damage[0].sides = 6;
  }, TypeError);
  assert.throws(() => {
    /** @type {any} */ (frozen).push({ name: 'Mace' });
  }, TypeError);
});

test('deepFreeze passes primitives and null through', () => {
  assert.equal(deepFreeze(null), null);
  assert.equal(deepFreeze(3), 3);
  assert.equal(deepFreeze('x'), 'x');
  assert.equal(deepFreeze(undefined), undefined);
});

test('deepFreeze terminates on a cycle', () => {
  /** @type {any} */
  const a = { name: 'a' };
  a.self = a;
  a.child = { parent: a };
  deepFreeze(a);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.child));
});
