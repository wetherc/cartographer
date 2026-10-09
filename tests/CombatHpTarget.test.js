import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hpTargetId } from '../src/view/CombatHpTarget.js';

const HP = { current: 5, max: 10, bonus: 0 };

/** A view of three rows, with the turn on `turnIndex`. */
function view(turnIndex = 0, rows = ['boss', 'mirelle', 'wolf']) {
  return /** @type {any} */ ({
    turnIndex,
    rows: rows.map((id) => ({ id, hp: id === 'nohp' ? null : HP })),
  });
}

test('a pick in the box wins over every other candidate', () => {
  const ids = { picked: 'wolf', selectedId: 'mirelle', inspectedId: 'boss' };
  assert.equal(hpTargetId(view(), ids), 'wolf');
});

test('the inspected row wins over the selected card', () => {
  // The box sits under the inspected combatant's name, so it acts on that
  // combatant and not on a card picked earlier on the board.
  assert.equal(hpTargetId(view(), { selectedId: 'mirelle', inspectedId: 'wolf' }), 'wolf');
});

test('the selected card wins when nothing is inspected', () => {
  assert.equal(hpTargetId(view(), { selectedId: 'mirelle' }), 'mirelle');
});

test('with no candidate, the box has no target, not the current turn', () => {
  assert.equal(hpTargetId(view(1), {}), null);
});

test('a stale id falls through to the next candidate', () => {
  assert.equal(hpTargetId(view(), { picked: 'gone', selectedId: 'wolf' }), 'wolf');
  assert.equal(hpTargetId(view(), { inspectedId: 'gone', selectedId: 'wolf' }), 'wolf');
});

test('a row without HP is never the target', () => {
  assert.equal(hpTargetId(view(0, ['nohp', 'wolf']), { selectedId: 'nohp' }), null);
  assert.equal(
    hpTargetId(view(0, ['nohp', 'wolf']), { inspectedId: 'nohp', selectedId: 'wolf' }),
    'wolf',
  );
});
