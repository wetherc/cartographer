import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_COSTS,
  COST_LABELS,
  attacksAvailable,
  budgetOf,
  canSpend,
  freshBudget,
  isFresh,
  refresh,
  resetSneak,
  spend,
  spendAttack,
} from '../src/combat/ActionBudget.js';

/**
 * A participant carrying the given budget. The order fields do not matter to
 * anything in this module.
 * @param {Partial<import('../src/types/combat.js').ActionBudget>} [used]
 * @returns {import('../src/types/combat.js').Participant}
 */
const at = (used) => ({
  id: 'a',
  initiative: 12,
  modifier: 1,
  ...(used ? { used: { ...freshBudget(), ...used } } : {}),
});

test('every cost has a label the action bar can show', () => {
  for (const cost of ACTION_COSTS) assert.equal(typeof COST_LABELS[cost], 'string');
});

test('freshBudget spends nothing', () => {
  assert.deepEqual(freshBudget(), {
    action: false,
    bonus: false,
    reaction: false,
    attacksLeft: 0,
    attacked: false,
    sneak: false,
  });
});

test('budgetOf reads a missing budget as a fresh turn', () => {
  assert.deepEqual(budgetOf(undefined), freshBudget());
  assert.deepEqual(budgetOf(null), freshBudget());
  assert.deepEqual(budgetOf('action'), freshBudget());
});

test('budgetOf keeps only the true booleans and a whole attack count', () => {
  assert.deepEqual(
    budgetOf({ action: true, bonus: 'yes', attacksLeft: 2.7, attacked: 'sure', sneak: 1 }),
    {
      action: true,
      bonus: false,
      reaction: false,
      attacksLeft: 2,
      attacked: false,
      sneak: false,
    },
  );
});

test('budgetOf floors a negative or unreadable attack count to zero', () => {
  assert.equal(budgetOf({ attacksLeft: -3 }).attacksLeft, 0);
  assert.equal(budgetOf({ attacksLeft: Number.NaN }).attacksLeft, 0);
  assert.equal(budgetOf({ attacksLeft: 'two' }).attacksLeft, 0);
});

test('canSpend holds every cost on a fresh turn and none of a spent one', () => {
  for (const cost of ACTION_COSTS) {
    assert.equal(canSpend(at(), cost), true);
    assert.equal(canSpend(at({ [cost]: true }), cost), false);
  }
});

test('canSpend reports no action left even when a banked swing remains', () => {
  // A banked Extra Attack swing is not an action, so a cast cannot use it.
  assert.equal(canSpend(at({ action: true, attacksLeft: 1 }), 'action'), false);
});

test('spend marks one cost and leaves the others alone', () => {
  const spent = spend(at(), 'bonus');
  assert.deepEqual(spent.used, { ...freshBudget(), bonus: true });
});

test('the sneak flag is spent and asked about like an action', () => {
  assert.equal(canSpend(at(), 'sneak'), true);
  assert.deepEqual(spend(at(), 'sneak').used, { ...freshBudget(), sneak: true });
  assert.equal(canSpend(at({ sneak: true }), 'sneak'), false);
});

test('spend returns the same participant when the cost is already gone', () => {
  const already = at({ reaction: true });
  assert.equal(spend(already, 'reaction'), already);
});

test('spendAttack takes the action, marks the attack, and banks the extra swings', () => {
  assert.deepEqual(spendAttack(at(), 2).used, {
    ...freshBudget(),
    action: true,
    attacksLeft: 1,
    attacked: true,
  });
  assert.deepEqual(spendAttack(at(), 1).used, {
    ...freshBudget(),
    action: true,
    attacksLeft: 0,
    attacked: true,
  });
});

test('spendAttack draws on the bank without spending a second action', () => {
  const banked = at({ action: true, attacksLeft: 2, attacked: true });
  assert.deepEqual(spendAttack(banked, 3).used, {
    ...freshBudget(),
    action: true,
    attacksLeft: 1,
    attacked: true,
  });
});

test('spendAttack past an empty bank spends another Attack action', () => {
  // The app's write path refuses first, so only a direct caller reaches this,
  // and it must not go into debt.
  const spent = spendAttack(at({ action: true, attacked: true }), 2);
  assert.deepEqual(spent.used, {
    ...freshBudget(),
    action: true,
    attacksLeft: 1,
    attacked: true,
  });
});

test('spendAttack treats a fractional or zero attack rate as one swing', () => {
  assert.equal(spendAttack(at(), 0).used?.attacksLeft, 0);
  assert.equal(spendAttack(at(), 2.9).used?.attacksLeft, 1);
});

test('attacksAvailable counts the swing the action itself buys', () => {
  assert.equal(attacksAvailable(at(), 2), 2);
  assert.equal(attacksAvailable(at(), 1), 1);
  assert.equal(attacksAvailable(at(), 0), 1);
});

test('attacksAvailable reports the bank once the action is spent', () => {
  assert.equal(attacksAvailable(at({ action: true, attacksLeft: 1 }), 2), 1);
  assert.equal(attacksAvailable(at({ action: true }), 2), 0);
});

test('isFresh is true only when nothing at all is spent', () => {
  assert.equal(isFresh(at()), true);
  assert.equal(isFresh(at({ sneak: true })), false);
  assert.equal(isFresh(at({ attacksLeft: 1 })), false);
});

test('refresh gives a whole turn back, reaction included', () => {
  const used = at({
    action: true,
    bonus: true,
    reaction: true,
    attacksLeft: 1,
    attacked: true,
    sneak: true,
  });
  assert.deepEqual(refresh(used).used, freshBudget());
});

test('resetSneak gives only the sneak flag back', () => {
  const spent = at({ action: true, attacked: true, sneak: true });
  assert.deepEqual(resetSneak(spent).used, { ...freshBudget(), action: true, attacked: true });
});

test('resetSneak returns the same participant when the flag is unspent', () => {
  const clean = at({ action: true });
  assert.equal(resetSneak(clean), clean);
  const legacy = at(undefined);
  assert.equal(resetSneak(legacy), legacy);
});

test('refresh returns the same participant when the turn is already fresh', () => {
  const clean = at();
  assert.equal(refresh(clean), clean);
  const legacy = at(undefined);
  assert.equal(refresh(legacy), legacy);
});
