import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocked,
  keyHolder,
  keyItemNames,
  lockBadge,
  lockFields,
  lockMessage,
  plateName,
  readLock,
  unknownKeyWarning,
  unlockNode,
} from '../src/map/NodeLock.js';
import { ruleEnables } from '../src/view/FieldRules.js';

const item = (/** @type {string} */ name) => ({
  id: name,
  name,
  quantity: 1,
  notes: '',
  type: 'gear',
});

test('readLock reads a lock, trims the key, and gives null for no lock', () => {
  assert.deepEqual(readLock({ requires: '  Warding Key ', open: true }), {
    requires: 'Warding Key',
    open: true,
  });
  assert.deepEqual(readLock({ requires: ' ', open: 'yes' }), { requires: null, open: false });
  assert.deepEqual(readLock({ requires: 5 }), { requires: null, open: false });
  assert.equal(readLock(null), null);
  assert.equal(readLock('locked'), null);
});

test('isLocked is true only for a lock that is not open', () => {
  assert.equal(isLocked(/** @type {any} */ ({ lock: { requires: null, open: false } })), true);
  assert.equal(isLocked(/** @type {any} */ ({ lock: { requires: null, open: true } })), false);
  assert.equal(isLocked(/** @type {any} */ ({})), false);
  assert.equal(isLocked(null), false);
});

test('keyHolder matches the item name across characters without regard to case', () => {
  const lock = { requires: 'Warding Key', open: false };
  const wren = /** @type {any} */ ({ name: 'Wren', inventory: [item('Rope')] });
  const aldric = /** @type {any} */ ({ name: 'Aldric', inventory: [item('warding key ')] });
  const bare = /** @type {any} */ ({ name: 'Bare' });
  assert.equal(keyHolder([bare, wren, aldric], lock), aldric);
  assert.equal(keyHolder([wren], lock), null);
  assert.equal(keyHolder([aldric], { requires: null, open: false }), null);
});

test('lockMessage names the key and who carries it', () => {
  const lock = { requires: 'warding key', open: false };
  assert.equal(
    lockMessage(lock, /** @type {any} */ ({ name: 'Aldric' })),
    'Locked. Requires the warding key; Aldric carries it.',
  );
  assert.equal(
    lockMessage(lock, null),
    'Locked. Requires the warding key; Nobody in the party carries it.',
  );
  assert.equal(lockMessage({ requires: null, open: false }, null), 'Locked.');
});

test('unlockNode opens the lock and leaves a node with no lock alone', () => {
  const node = /** @type {any} */ ({ id: 'b', lock: { requires: 'key', open: false } });
  assert.deepEqual(unlockNode(node).lock, { requires: 'key', open: true });
  const open = /** @type {any} */ ({ id: 'c' });
  assert.equal(unlockNode(open), open);
});

test('lockFields and readLockFields turn a lock into dialog fields and back', async () => {
  const { readLockFields } = await import('../src/map/NodeLock.js');
  assert.deepEqual(
    lockFields({ requires: 'key', open: false }).map((f) => f.value),
    ['locked', 'key'],
  );
  assert.equal(lockFields({ requires: null, open: true })[0].value, 'open');
  assert.deepEqual(
    lockFields(undefined).map((f) => f.value),
    ['', ''],
  );
  assert.deepEqual(readLockFields({ lockState: 'open', lockRequires: ' key ' }), {
    requires: 'key',
    open: true,
  });
  assert.deepEqual(readLockFields({ lockState: 'locked', lockRequires: '' }), {
    requires: null,
    open: false,
  });
  assert.equal(readLockFields({ lockState: '', lockRequires: 'key' }), null);
});

test('keyItemNames lists library and inventory names once each, sorted', () => {
  const party = /** @type {any[]} */ ([
    { name: 'A', inventory: [item('Silver Key'), item(' rope ')] },
    { name: 'B', inventory: [item('silver key'), { ...item(''), name: null }] },
    { name: 'C' },
  ]);
  assert.deepEqual(keyItemNames(party, ['Rope', 'Dagger']), ['Dagger', 'Rope', 'Silver Key']);
});

test('unknownKeyWarning warns only for a key that no known item matches', () => {
  const names = ['Silver Key'];
  assert.equal(unknownKeyWarning(null, names), null);
  assert.equal(unknownKeyWarning({ requires: null, open: false }, names), null);
  assert.equal(unknownKeyWarning({ requires: 'silver key', open: false }, names), null);
  assert.match(
    unknownKeyWarning({ requires: 'Silverkey', open: false }, names) ?? '',
    /named "Silverkey", so no item opens this lock yet\./,
  );
});

test('lockBadge and plateName mark a closed lock only', () => {
  const node = /** @type {any} */ ({ id: 'c', name: 'Crypt' });
  assert.equal(lockBadge(node), null);
  assert.equal(lockBadge(null), null);
  assert.equal(
    lockBadge({ ...node, lock: { requires: 'Silver Key', open: false } }),
    'Locked (needs Silver Key)',
  );
  assert.equal(lockBadge({ ...node, lock: { requires: null, open: false } }), 'Locked');
  assert.equal(lockBadge({ ...node, lock: { requires: 'Silver Key', open: true } }), null);
  assert.equal(plateName(node), 'Crypt');
  assert.equal(plateName(undefined), undefined);
  assert.equal(plateName({ ...node, lock: { requires: null, open: false } }), '\u{1F512} Crypt');
});

test('lockFields offers item names as key suggestions', () => {
  const fields = lockFields(undefined, ['Silver Key']);
  assert.deepEqual(/** @type {any} */ (fields[1]).suggestions, ['Silver Key']);
  assert.deepEqual(/** @type {any} */ (lockFields(undefined)[1]).suggestions, []);
});

test('Key item is enabled only while Lock names a lock', () => {
  const requires = lockFields(undefined)[1];
  assert.equal(
    ruleEnables(requires, () => ''),
    false,
  );
  assert.equal(
    ruleEnables(requires, () => 'locked'),
    true,
  );
  assert.equal(
    ruleEnables(requires, () => 'open'),
    true,
  );
});
