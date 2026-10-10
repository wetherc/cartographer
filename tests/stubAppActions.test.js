import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACTION_NAMES, stubApp } from './helpers/app.js';

/**
 * The stub app gives every action a no-op, so a wiring module under test
 * calls an action without a guard. An action missing from the stub would
 * throw in a test and push the module to guard the call, and a guarded call
 * in the real app skips the action without a word. This test reads the
 * `AppActions` interface from its declaration file and checks that the stub
 * lists the same names in the same order.
 */

const TYPES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'types', 'app.ts');

/** @returns {string[]} the member names of `AppActions`, in declaration order */
function declaredActions() {
  const source = readFileSync(TYPES, 'utf8');
  const start = source.indexOf('export interface AppActions {');
  assert.notEqual(start, -1, 'app.ts declares AppActions');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  return [...body.matchAll(/^ {2}(\w+)\??\(/gm)].map((m) => m[1]);
}

test('the stub app lists every AppActions member, in order', () => {
  assert.deepEqual(ACTION_NAMES, declaredActions());
});

test('the stub budget actions let a spend through and report no fight', () => {
  const app = stubApp();
  assert.equal(app.actions.spendBudget('a', 'action'), true);
  assert.equal(app.actions.surgeBudget('a'), true);
  assert.equal(app.actions.toggleBudget('a', 'action'), null);
});
