import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  channelActions,
  checkAllocation,
  destroyUndeadCR,
  preserveLifeBudget,
  preserveLifeCap,
  turnVerdict,
} from '../src/combat/ChannelDivinity.js';
import { createCharacter } from '../src/entities/Character.js';

/** A cleric of the given level and subclass. */
const cleric = (/** @type {number} */ level, /** @type {string | undefined} */ subclass) => ({
  ...createCharacter('c', 'Cleric'),
  classes: [{ classId: 'cleric', level, ...(subclass ? { subclass } : {}) }],
  level,
});

test('destroyUndeadCR follows the SRD table and is null below level 5', () => {
  assert.equal(destroyUndeadCR(4), null);
  assert.equal(destroyUndeadCR(5), 0.5);
  assert.equal(destroyUndeadCR(10), 1);
  assert.equal(destroyUndeadCR(11), 2);
  assert.equal(destroyUndeadCR(14), 3);
  assert.equal(destroyUndeadCR(20), 4);
});

test('channelActions needs the pool and cleric level 2', () => {
  assert.deepEqual(channelActions(/** @type {any} */ (cleric(5)), undefined), []);
  assert.deepEqual(channelActions(/** @type {any} */ (cleric(1)), 1), []);
});

test('channelActions offers Turn Undead, and Preserve Life to a Life cleric', () => {
  const plain = channelActions(/** @type {any} */ (cleric(2)), 1);
  assert.deepEqual(
    plain.map((a) => a.id),
    ['turn-undead'],
  );
  assert.match(plain[0].title ?? '', /\(1 use left\)/);
  const life = channelActions(/** @type {any} */ (cleric(2, 'Life Domain')), 0);
  assert.deepEqual(
    life.map((a) => a.id),
    ['turn-undead', 'preserve-life'],
  );
  assert.match(life[1].title ?? '', /\(0 uses left\)/);
});

test('preserveLifeBudget is five times the cleric level, never negative', () => {
  assert.equal(preserveLifeBudget(6), 30);
  assert.equal(preserveLifeBudget(-1), 0);
});

test('preserveLifeCap heals up to half max HP and skips undead and constructs', () => {
  assert.equal(preserveLifeCap({ current: 3, max: 20 }, 'humanoid'), 7);
  assert.equal(preserveLifeCap({ current: 15, max: 20 }, undefined), 0);
  assert.equal(preserveLifeCap({ current: 0, max: 20 }, 'undead'), 0);
  assert.equal(preserveLifeCap({ current: 0, max: 20 }, 'construct'), 0);
});

test('checkAllocation refuses amounts over a cap, fractional, or with no cap', () => {
  const caps = { a: 5, b: 4 };
  assert.deepEqual(checkAllocation({ a: 5, b: 4 }, caps, 9), { ok: true, total: 9 });
  assert.equal(checkAllocation({ a: 6 }, caps, 9).ok, false);
  assert.equal(checkAllocation({ a: 1.5 }, caps, 9).ok, false);
  assert.equal(checkAllocation({ a: -1 }, caps, 9).ok, false);
  const stray = checkAllocation({ z: 1 }, caps, 9);
  assert.equal(stray.ok, false);
  assert.match(stray.ok ? '' : stray.message, /\(0\)/);
});

test('checkAllocation refuses a sum over the budget', () => {
  const result = checkAllocation({ a: 5, b: 4 }, { a: 5, b: 4 }, 8);
  assert.deepEqual(result, { ok: false, message: 'The amounts add up to 9, over 8.' });
});

test('turnVerdict turns, destroys, or leaves the undead alone', () => {
  assert.equal(turnVerdict(true, 0.25, 20), 'unaffected');
  assert.equal(turnVerdict(false, 0.25, 4), 'turned');
  assert.equal(turnVerdict(false, 0.5, 5), 'destroyed');
  assert.equal(turnVerdict(false, 1, 5), 'turned');
  assert.equal(turnVerdict(false, undefined, 20), 'turned');
});
