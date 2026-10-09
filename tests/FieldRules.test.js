import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldRules, filled, hasFieldRules, ruleEnables } from '../src/view/FieldRules.js';

/** @type {import('../src/types/modal.js').ModalField[]} */
const FIELDS = [
  { name: 'lock', label: 'Lock' },
  { name: 'key', label: 'Key', enabledWhen: { field: 'lock' } },
  { name: 'count', label: 'Count', type: 'number' },
  { name: 'die', label: 'Die', enabledWhen: { field: 'count', test: (v) => Number(v) > 0 } },
];

test('a rule with no test enables its field while the parent is not blank', () => {
  assert.equal(filled(' x '), true);
  assert.equal(filled('  '), false);
  assert.equal(
    ruleEnables(FIELDS[1], () => 'locked'),
    true,
  );
  assert.equal(
    ruleEnables(FIELDS[1], () => ' '),
    false,
  );
  assert.equal(
    ruleEnables(FIELDS[0], () => 'x'),
    null,
  );
});

test('a rule with a test enables its field by that test', () => {
  assert.equal(
    ruleEnables(FIELDS[3], () => '2'),
    true,
  );
  assert.equal(
    ruleEnables(FIELDS[3], () => '0'),
    false,
  );
});

test('on open every ruled field is set, and on a change only its dependents', () => {
  const values = { lock: '', count: '3' };
  /** @type {[string, boolean][]} */
  const calls = [];
  const get = (/** @type {string} */ n) => /** @type {any} */ (values)[n] ?? '';
  const set = (/** @type {string} */ n, /** @type {boolean} */ d) => calls.push([n, d]);
  applyFieldRules(FIELDS, null, get, set);
  assert.deepEqual(calls, [
    ['key', true],
    ['die', false],
  ]);
  calls.length = 0;
  values.lock = 'locked';
  applyFieldRules(FIELDS, 'lock', get, set);
  assert.deepEqual(calls, [['key', false]]);
  calls.length = 0;
  applyFieldRules(FIELDS, 'key', get, set);
  assert.deepEqual(calls, []);
});

test('hasFieldRules tells a ruled list from a plain one', () => {
  assert.equal(hasFieldRules(FIELDS), true);
  assert.equal(hasFieldRules([FIELDS[0], FIELDS[2]]), false);
});
