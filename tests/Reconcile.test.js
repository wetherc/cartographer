import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../src/storage/Reconcile.js';

/**
 * A parsed save shape: a small collection of entities, each with an id and a
 * nested object. The tests assert on object identity with `assert.equal`,
 * because identity is the whole point of the module.
 */
function encounters() {
  return [
    { id: 'e1', name: 'Goblin Scout', hp: { current: 7, max: 7 }, conditions: [] },
    { id: 'e2', name: 'Orc Brute', hp: { current: 15, max: 15 }, conditions: ['prone'] },
  ];
}

/** A separate parse of the same data, as an adoption receives it. */
function reparse(value) {
  return JSON.parse(JSON.stringify(value));
}

test('an unchanged collection comes back as the live array', () => {
  const live = encounters();
  assert.equal(reconcile(live, reparse(live)), live);
});

test('an unchanged entity comes back as the live object', () => {
  const live = encounters();
  const out = reconcile(live, reparse(live));
  assert.equal(out[0], live[0]);
  assert.equal(out[1], live[1]);
});

test('the same reference passes straight through', () => {
  const live = encounters();
  assert.equal(reconcile(live, live), live);
});

test('a changed field gives a new object for that entity only', () => {
  const live = encounters();
  const incoming = reparse(live);
  incoming[1].hp.current = 9;
  const out = reconcile(live, incoming);
  assert.notEqual(out, live);
  assert.equal(out[0], live[0]);
  assert.notEqual(out[1], live[1]);
  assert.equal(out[1].hp.current, 9);
});

test('an untouched sub-object of a changed entity is still the live one', () => {
  const live = encounters();
  const incoming = reparse(live);
  incoming[0].name = 'Goblin Sentry';
  const out = reconcile(live, incoming);
  assert.notEqual(out[0], live[0]);
  assert.equal(out[0].hp, live[0].hp);
  assert.equal(out[0].conditions, live[0].conditions);
});

test('an added entity is new, and its siblings are not', () => {
  const live = encounters();
  const incoming = reparse(live);
  incoming.push({ id: 'e3', name: 'Wolf', hp: { current: 11, max: 11 }, conditions: [] });
  const out = reconcile(live, incoming);
  assert.equal(out.length, 3);
  assert.equal(out[0], live[0]);
  assert.equal(out[1], live[1]);
  assert.equal(out[2], incoming[2]);
});

test('a removal keeps the entities that remain', () => {
  const live = encounters();
  const incoming = reparse(live).slice(1);
  const out = reconcile(live, incoming);
  assert.equal(out.length, 1);
  assert.equal(out[0], live[1]);
});

// A collection is paired by id, so an insertion at the front does not shift
// every later entity onto the wrong live sibling and rewrite it.
test('an insertion at the front leaves the entities after it alone', () => {
  const live = encounters();
  const incoming = reparse(live);
  incoming.unshift({ id: 'e0', name: 'Bandit', hp: { current: 5, max: 5 }, conditions: [] });
  const out = reconcile(live, incoming);
  assert.equal(out[1], live[0]);
  assert.equal(out[2], live[1]);
});

test('a reorder gives a new array of the same objects', () => {
  const live = encounters();
  const incoming = reparse(live).reverse();
  const out = reconcile(live, incoming);
  assert.notEqual(out, live);
  assert.equal(out[0], live[1]);
  assert.equal(out[1], live[0]);
});

test('a list without ids pairs by index', () => {
  const live = [{ label: 'one' }, { label: 'two' }];
  const incoming = reparse(live);
  incoming[1].label = 'three';
  const out = reconcile(live, incoming);
  assert.equal(out[0], live[0]);
  assert.notEqual(out[1], live[1]);
});

test('a repeated id falls back to index pairing', () => {
  const live = [
    { id: 'dup', n: 1 },
    { id: 'dup', n: 2 },
  ];
  const out = reconcile(live, reparse(live));
  assert.equal(out, live);
});

test('a scalar collection comes back as the live array when it matches', () => {
  const live = { order: ['e1', 'e2'], round: 3 };
  assert.equal(reconcile(live, reparse(live)), live);
});

test('a changed scalar in a list rebuilds that list only', () => {
  const live = { order: ['e1', 'e2'], tally: { hits: 2 } };
  const incoming = reparse(live);
  incoming.order[1] = 'e3';
  const out = reconcile(live, incoming);
  assert.notEqual(out.order, live.order);
  assert.equal(out.tally, live.tally);
});

test('an added key rebuilds the record', () => {
  const live = { id: 'e1', name: 'Goblin Scout' };
  const out = reconcile(live, { id: 'e1', name: 'Goblin Scout', noticed: true });
  assert.notEqual(out, live);
  assert.equal(out.noticed, true);
});

test('a removed key rebuilds the record without it', () => {
  const live = { id: 'e1', name: 'Goblin Scout', noticed: true };
  const out = reconcile(live, { id: 'e1', name: 'Goblin Scout' });
  assert.notEqual(out, live);
  assert.equal('noticed' in out, false);
});

// A key set to undefined does not survive a JSON round trip, so it counts as
// absent on both sides. Otherwise a live field the app cleared would make its
// entity look changed on every adoption.
test('an undefined value counts as an absent key', () => {
  const live = { id: 'e1', name: 'Goblin Scout', statBlock: undefined };
  assert.equal(reconcile(live, { id: 'e1', name: 'Goblin Scout' }), live);
});

test('null is a value, not an absent key', () => {
  const live = { id: 'e1', statBlock: null };
  const out = reconcile(live, { id: 'e1', statBlock: { ac: 13 } });
  assert.notEqual(out, live);
  assert.deepEqual(out.statBlock, { ac: 13 });
});

test('a null incoming field replaces a live object', () => {
  const live = { id: 'e1', statBlock: { ac: 13 } };
  const out = reconcile(live, { id: 'e1', statBlock: null });
  assert.equal(out.statBlock, null);
});

test('a shape change takes the incoming value whole', () => {
  assert.deepEqual(reconcile({ a: 1 }, [1]), [1]);
  assert.deepEqual(reconcile([1], { a: 1 }), { a: 1 });
  assert.equal(reconcile({ a: 1 }, 4), 4);
  assert.deepEqual(reconcile(4, { a: 1 }), { a: 1 });
});

test('an absent live field takes the incoming one', () => {
  assert.deepEqual(reconcile(undefined, encounters()), encounters());
  assert.equal(reconcile(undefined, null), null);
});

test('neither side is mutated', () => {
  const live = encounters();
  const incoming = reparse(live);
  incoming[0].name = 'Goblin Sentry';
  const liveCopy = reparse(live);
  const incomingCopy = reparse(incoming);
  reconcile(live, incoming);
  assert.deepEqual(live, liveCopy);
  assert.deepEqual(incoming, incomingCopy);
});

test('a deep nesting keeps every untouched branch', () => {
  const live = {
    characters: [
      {
        id: 'c1',
        name: 'Ser Aldric',
        inventory: [{ id: 'i1', name: 'Longsword', qty: 1 }],
        resources: [{ id: 'r1', name: 'Hit Dice', current: 3 }],
      },
    ],
  };
  const incoming = reparse(live);
  incoming.characters[0].resources[0].current = 2;
  const out = reconcile(live, incoming);
  assert.equal(out.characters[0].inventory, live.characters[0].inventory);
  assert.notEqual(out.characters[0].resources, live.characters[0].resources);
  assert.equal(out.characters[0].resources[0].current, 2);
});

// JSON.parse creates an own `__proto__` data property. A plain `in` check
// matches that key on every object, and a plain assignment to it sets the
// prototype instead of storing the value.
test('an own __proto__ key stays data, not a prototype', () => {
  const live = { a: 1 };
  const incoming = JSON.parse('{"a":1,"__proto__":{"x":1}}');
  const out = reconcile(live, incoming);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(out, '__proto__')?.value, { x: 1 });
});

test('a structurally equal save with an own __proto__ key comes back live', () => {
  const live = JSON.parse('{"a":1,"__proto__":{"x":1}}');
  const incoming = JSON.parse('{"a":1,"__proto__":{"x":1}}');
  assert.equal(reconcile(live, incoming), live);
});
