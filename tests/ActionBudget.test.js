import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_COSTS,
  COST_LABELS,
  attacksAvailable,
  budgetOf,
  canSpend,
  canSurge,
  endSurprise,
  freshBudget,
  isFresh,
  refresh,
  refreshHeld,
  resetSneak,
  spend,
  spendAttack,
  surge,
  surprisedBudget,
  unspend,
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
    lightAttack: false,
    sneak: false,
    deathSave: false,
    bonusSpell: false,
    actionSpell: false,
    extra: false,
    surged: false,
    spare: false,
    legendary: 0,
  });
});

test('budgetOf reads a missing budget as a fresh turn', () => {
  assert.deepEqual(budgetOf(undefined), freshBudget());
  assert.deepEqual(budgetOf(null), freshBudget());
  assert.deepEqual(budgetOf('action'), freshBudget());
});

test('budgetOf keeps only the true booleans and a whole attack count', () => {
  assert.deepEqual(
    budgetOf({
      action: true,
      bonus: 'yes',
      attacksLeft: 2.7,
      attacked: 'sure',
      sneak: 1,
      deathSave: true,
      extra: 'yes',
    }),
    {
      action: true,
      bonus: false,
      reaction: false,
      attacksLeft: 2,
      attacked: false,
      lightAttack: false,
      sneak: false,
      deathSave: true,
      bonusSpell: false,
      actionSpell: false,
      extra: false,
      surged: false,
      spare: false,
      legendary: 0,
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

test('spendAttack marks a light melee swing, and a later swing keeps the mark', () => {
  const light = spendAttack(at(), 2, false, true);
  assert.equal(budgetOf(light.used).lightAttack, true);
  assert.equal(budgetOf(spendAttack(light, 2).used).lightAttack, true, 'a banked bow swing');
  assert.equal(budgetOf(spendAttack(at(), 2).used).lightAttack, false);
  const hasted = at({ action: true, attacked: true });
  assert.equal(budgetOf(spendAttack(hasted, 1, true, true).used).lightAttack, true);
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

test('a weapon that buys one swing per action cannot draw on the bank', () => {
  // Thirsting Blade banks a swing for the pact weapon alone.
  const banked = at({ action: true, attacksLeft: 1, attacked: true });
  assert.equal(attacksAvailable(banked, 1), 0);
  assert.equal(attacksAvailable(banked, 1, true), 1);
  // Haste still gives its one swing, and the bank waits for the pact weapon.
  assert.deepEqual(spendAttack(banked, 1, true).used, {
    ...freshBudget(),
    action: true,
    attacksLeft: 1,
    attacked: true,
    extra: true,
  });
});

test('an extra action buys one swing after the action and its bank', () => {
  // A fighter with Extra Attack and Haste swings three times: two for the
  // Attack action and one for the extra action.
  let p = at();
  assert.equal(attacksAvailable(p, 2, true), 3);
  p = spendAttack(p, 2, true);
  assert.equal(attacksAvailable(p, 2, true), 2);
  p = spendAttack(p, 2, true);
  assert.equal(attacksAvailable(p, 2, true), 1);
  p = spendAttack(p, 2, true);
  assert.deepEqual(p.used, { ...freshBudget(), action: true, attacked: true, extra: true });
  assert.equal(attacksAvailable(p, 2, true), 0);
});

test('an extra action still swings after a cast spent the action', () => {
  const cast = at({ action: true });
  assert.equal(attacksAvailable(cast, 2, true), 1);
  assert.equal(attacksAvailable(cast, 2, false), 0);
  // Nothing banks behind the extra swing, even with Extra Attack.
  assert.equal(spendAttack(cast, 2, true).used?.attacksLeft, 0);
  assert.equal(spendAttack(cast, 2, true).used?.extra, true);
});

test('isFresh is true only when nothing at all is spent', () => {
  assert.equal(isFresh(at()), true);
  assert.equal(isFresh(at({ sneak: true })), false);
  assert.equal(isFresh(at({ extra: true })), false);
  assert.equal(isFresh(at({ attacksLeft: 1 })), false);
});

test('isFresh is false for every spent field of a fresh budget', () => {
  for (const [key, value] of Object.entries(freshBudget())) {
    const spent = typeof value === 'number' ? 1 : true;
    // budgetOf reads a spare action only beside a surge.
    const extra = key === 'spare' ? { surged: true } : {};
    assert.equal(isFresh(at({ ...extra, [key]: spent })), false, key);
  }
});

test('refresh gives back a spent death save and spent spell flags', () => {
  const used = at({ deathSave: true, actionSpell: true, bonusSpell: true });
  assert.deepEqual(refresh(used).used, freshBudget());
});

test('refresh gives a whole turn back, reaction included', () => {
  const used = at({
    action: true,
    bonus: true,
    reaction: true,
    attacksLeft: 1,
    attacked: true,
    lightAttack: true,
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

test('unspend frees one cost, and freeing the action drops its banked swings', () => {
  const fresh = at({});
  assert.equal(unspend(fresh, 'bonus'), fresh, 'a free cost returns the same participant');
  assert.equal(budgetOf(unspend(at({ bonus: true }), 'bonus').used).bonus, false);
  const swung = unspend(
    at({ action: true, attacksLeft: 1, attacked: true, lightAttack: true, bonus: true }),
    'action',
  );
  assert.deepEqual(budgetOf(swung.used), { ...freshBudget(), bonus: true });
  const cast = unspend(at({ action: true, actionSpell: true }), 'action');
  assert.equal(budgetOf(cast.used).actionSpell, false, 'the action takes its spell back');
  const reacted = unspend(at({ reaction: true, action: true, attacksLeft: 1 }), 'reaction');
  assert.equal(budgetOf(reacted.used).attacksLeft, 1, 'only the action gives its bank back');
});

test('surge before the action leaves a spare that the first action spends', () => {
  const fresh = { id: 'a', initiative: 10, modifier: 0 };
  assert.equal(canSurge(fresh), true);
  const surged = surge(fresh);
  assert.deepEqual(surged.used, { ...freshBudget(), surged: true, spare: true });
  assert.equal(canSurge(surged), false, 'one surge per turn');
  assert.equal(surge(surged), surged);
  const dashed = spend(surged, 'action');
  assert.equal(canSpend(dashed, 'action'), true, 'the spare paid for the first action');
  assert.equal(dashed.used?.spare, false);
  assert.equal(canSpend(spend(dashed, 'action'), 'action'), false, 'two actions in all');
  const swung = spendAttack(surged, 2);
  assert.deepEqual(swung.used, { ...freshBudget(), surged: true, attacksLeft: 1, attacked: true });
  assert.equal(attacksAvailable(swung, 2), 1, 'the banked swing comes first');
  const third = spendAttack(spendAttack(swung, 2), 2);
  assert.equal(third.used?.action, true);
  assert.equal(third.used?.attacksLeft, 1, 'the second Attack action banks its own swing');
  assert.equal(budgetOf({ spare: true }).spare, false, 'a spare needs the surge');
  assert.equal(isFresh({ ...fresh, used: { ...freshBudget(), surged: true, spare: true } }), false);
});

test('surge gives a spent action back once per turn and keeps the swing bank', () => {
  const fresh = { id: 'a', initiative: 10, modifier: 0 };
  const swung = spendAttack(fresh, 2);
  const surged = surge(swung);
  assert.equal(canSurge(surged), false, 'one surge per turn');
  assert.equal(surge(surged), surged);
  assert.deepEqual(surged.used, { ...budgetOf(swung.used), action: false, surged: true });
  assert.equal(attacksAvailable(surged, 2), 1, 'the banked swing still comes first');
  const next = spendAttack(spendAttack(surged, 2), 2);
  assert.equal(next.used?.action, true);
  assert.equal(next.used?.attacksLeft, 1, 'the second Attack action banks its own swing');
  assert.equal(isFresh({ ...fresh, used: { ...freshBudget(), surged: true } }), false);
});

test('surprisedBudget spends the reaction, and on the turn the action and bonus too', () => {
  assert.deepEqual(surprisedBudget(false), { ...freshBudget(), reaction: true });
  assert.deepEqual(surprisedBudget(true), {
    ...freshBudget(),
    action: true,
    bonus: true,
    reaction: true,
  });
});

test('endSurprise drops the flag and gives the reaction back', () => {
  const plain = { id: 'a', initiative: 10, modifier: 0 };
  assert.equal(endSurprise(plain), plain);
  const ended = endSurprise({ ...plain, surprised: true, used: surprisedBudget(true) });
  assert.equal('surprised' in ended, false);
  assert.deepEqual(ended.used, { ...freshBudget(), action: true, bonus: true });
});

test('the spell flags are read, spent, and freed with the bonus action', () => {
  const used = budgetOf({ bonusSpell: true, actionSpell: true });
  assert.equal(used.bonusSpell, true);
  assert.equal(used.actionSpell, true);
  const cast = spend(spend(at(), 'bonus'), 'bonusSpell');
  assert.equal(canSpend(cast, 'bonusSpell'), false);
  const freed = unspend(cast, 'bonus');
  assert.equal(budgetOf(freed.used).bonusSpell, false);
});

test('refreshHeld gives back only the reaction and the legendary actions', () => {
  const fresh = at();
  assert.equal(refreshHeld(fresh), fresh, 'identity when nothing was spent');
  const worn = at({ action: true, reaction: true, legendary: 1 });
  const back = refreshHeld(worn);
  assert.equal(back.used?.reaction, false);
  assert.equal(back.used?.legendary, 0);
  assert.equal(back.used?.action, true);
});
