import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchChildren } from '../src/ui/keyedChildren.js';

/** A list element with just the members patchChildren uses. */
function fakeParent() {
  /** @type {any[]} */
  const children = [];
  const parent = {
    children,
    moves: 0,
    get lastElementChild() {
      return children.at(-1) ?? null;
    },
    insertBefore(child, ref) {
      parent.moves++;
      const from = children.indexOf(child);
      if (from >= 0) children.splice(from, 1);
      const at = ref ? children.indexOf(ref) : children.length;
      children.splice(at, 0, child);
    },
  };
  return parent;
}

/** @param {string} name */
function node(name) {
  const n = { name, remove: () => {} };
  return n;
}

/** @param {any} parent @param {[string, string][]} pairs */
function items(parent, pairs, built = []) {
  return pairs.map(([key, sig]) => ({
    key,
    sig,
    build: () => {
      const n = node(`${key}:${sig}`);
      n.remove = () => parent.children.splice(parent.children.indexOf(n), 1);
      built.push(key);
      return n;
    },
  }));
}

test('patchChildren builds every child on the first call', () => {
  const parent = fakeParent();
  patchChildren(
    /** @type {any} */ (parent),
    items(parent, [
      ['a', '1'],
      ['b', '1'],
    ]),
  );
  assert.deepEqual(
    parent.children.map((n) => n.name),
    ['a:1', 'b:1'],
  );
});

test('patchChildren keeps a child whose signature is unchanged', () => {
  const parent = fakeParent();
  patchChildren(
    /** @type {any} */ (parent),
    items(parent, [
      ['a', '1'],
      ['b', '1'],
    ]),
  );
  const [a] = parent.children;
  const built = [];
  parent.moves = 0;
  patchChildren(
    /** @type {any} */ (parent),
    items(
      parent,
      [
        ['a', '1'],
        ['b', '2'],
      ],
      built,
    ),
  );
  assert.equal(parent.children[0], a);
  assert.deepEqual(built, ['b']);
  assert.deepEqual(
    parent.children.map((n) => n.name),
    ['a:1', 'b:2'],
  );
  assert.equal(parent.moves, 1);
});

test('patchChildren reorders kept children and drops the rest', () => {
  const parent = fakeParent();
  patchChildren(
    /** @type {any} */ (parent),
    items(parent, [
      ['a', '1'],
      ['b', '1'],
      ['c', '1'],
    ]),
  );
  const [a, b] = parent.children;
  const built = [];
  patchChildren(
    /** @type {any} */ (parent),
    items(
      parent,
      [
        ['b', '1'],
        ['a', '1'],
      ],
      built,
    ),
  );
  assert.deepEqual(parent.children, [b, a]);
  assert.deepEqual(built, []);
});

test('patchChildren rebuilds a child that came from elsewhere', () => {
  const parent = fakeParent();
  const stray = node('stray');
  stray.remove = () => parent.children.splice(parent.children.indexOf(stray), 1);
  parent.children.push(stray);
  patchChildren(/** @type {any} */ (parent), items(parent, [['a', '1']]));
  assert.deepEqual(
    parent.children.map((n) => n.name),
    ['a:1'],
  );
});
