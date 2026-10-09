import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCondition,
  addCondition,
  removeCondition,
  removeChip,
  endedLine,
  outlasts,
  sameSlot,
  strongestPerName,
  tracksCast,
} from '../src/entities/Conditions.js';

test('addCondition appends a new condition', () => {
  const list = addCondition([], 'Poisoned');
  assert.deepEqual(list, [createCondition('Poisoned', null)]);
});

test('addCondition replaces a same-name condition case-insensitively rather than stacking', () => {
  const list = addCondition(addCondition([], 'Poisoned', 2), 'poisoned', 5);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'poisoned');
  assert.equal(list[0].rounds, 5);
});

test('addCondition trims and ignores an empty name', () => {
  assert.deepEqual(addCondition([], '   '), []);
  assert.equal(addCondition([], '  Prone  ')[0].name, 'Prone');
});

test('removeCondition drops by name case-insensitively', () => {
  const list = addCondition(addCondition([], 'Prone'), 'Stunned');
  assert.deepEqual(
    removeCondition(list, 'prone').map((c) => c.name),
    ['Stunned'],
  );
});

test('a chip stores only the halves it was given', () => {
  const rider = { rolls: ['attack'], dice: 1, die: 'd4' };
  assert.deepEqual(createCondition('Bless', 10, { rider }), {
    name: 'Bless',
    rounds: 10,
    rider,
  });
  // A hand-added chip stores neither key, so an old save stays the shape it was.
  assert.deepEqual(createCondition('Prone'), { name: 'Prone', rounds: null });
  const list = addCondition([], 'Bless', 10, { rider });
  assert.equal(list[0].rider, rider);
});

test('a replacement chip takes over the rider as well as the source', () => {
  const blessed = addCondition([], 'Bless', 10, {
    rider: { rolls: ['attack'], dice: 1, die: 'd4' },
  });
  // The GM adds a plain chip with the same name, so the GM owns it now.
  const plain = addCondition(blessed, 'bless', 3);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].rider, undefined);
  assert.equal(plain[0].rounds, 3);
});

test('endedLine keeps a standard condition as an adjective and names any other chip', () => {
  assert.equal(endedLine('Goblin', 'Paralyzed'), 'Goblin is no longer Paralyzed');
  assert.equal(endedLine('Goblin', 'prone'), 'Goblin is no longer prone');
  assert.equal(endedLine('Brannoc', 'Haste'), 'Brannoc is no longer affected by Haste');
});

const cast = (spellId, casterId, more = {}) => ({
  source: { spellId, spellName: spellId, casterId, ...more },
});

test('outlasts keeps the stronger chip of one spell whatever its length', () => {
  const big = createCondition('Aid', 4700, { ...cast('aid', 'A'), mods: { maxHP: 10 } });
  const small = createCondition('Aid', 4800, { ...cast('aid', 'B'), mods: { maxHP: 5 } });
  assert.equal(outlasts(big, small), true);
  assert.equal(outlasts(small, big), false);
  const sameCaster = createCondition('Aid', 4800, { ...cast('aid', 'A'), mods: { maxHP: 5 } });
  assert.equal(outlasts(big, sameCaster), true);
  const refresh = createCondition('Aid', 4800, { ...cast('aid', 'A'), mods: { maxHP: 10 } });
  assert.equal(outlasts(big, refresh), false);
});

test('outlasts keeps the longer chip from another cast, and never a hand-added one', () => {
  const long = createCondition('Blinded', 10, cast('blindness', 'A'));
  const short = createCondition('Blinded', 1, cast('color-spray', 'B'));
  assert.equal(outlasts(long, short), true);
  assert.equal(outlasts(short, long), false);
  assert.equal(outlasts(createCondition('Blinded', 10), short), false);
  assert.equal(outlasts(undefined, short), false);
  const other = createCondition('Blinded', 1, cast('blindness', 'B'));
  assert.equal(outlasts(long, other), true);
});

test('chips that track their cast keep one place per caster and spell', () => {
  const ongoing = { damage: [{ count: 2, sides: 4, type: 'acid' }] };
  const one = { ...cast('acid-arrow', 'A'), ongoing };
  const two = { ...cast('acid-arrow', 'B'), ongoing };
  let list = addCondition([], 'Acid Arrow', 1, one);
  list = addCondition(list, 'Acid Arrow', 1, two);
  assert.equal(list.length, 2);
  list = addCondition(list, 'Acid Arrow', 1, one);
  assert.equal(list.length, 2);
  const pk = createCondition('Frightened', 10, cast('pk', 'A', { saveEnds: true }));
  const fear = createCondition('Frightened', 10, cast('fear', 'B'));
  assert.equal(tracksCast(pk), true);
  assert.equal(tracksCast(fear), false);
  assert.equal(sameSlot(fear, pk), false);
  assert.equal(sameSlot(createCondition('Frightened'), pk), false);
  assert.equal(sameSlot(fear, createCondition('frightened ')), true);
  assert.equal(sameSlot(fear, createCondition('Prone')), false);
});

test('removeChip takes off only the picked cast of a chip that tracks its cast', async () => {
  const { endedEffects } = await import('../src/entities/Lethargy.js');
  /** @param {string} casterId */
  const hold = (casterId) =>
    createCondition('Paralyzed', 10, {
      source: { spellId: 'hold-person', spellName: 'Hold Person', casterId, saveEnds: true },
    });
  const list = [hold('ana'), hold('bo'), createCondition('Prone')];
  const next = removeChip(list, list[0]);
  assert.deepEqual(next, [list[1], list[2]]);
  // The Haste lethargy check sees only the removed cast as ended.
  assert.deepEqual(endedEffects(list, next), [list[0]]);
});

test('removeChip takes off a plain chip by name, and leaves a same-name chip that tracks its cast', () => {
  const acid = createCondition('Burning', 1, {
    source: { spellId: 'acid-arrow', spellName: 'Acid Arrow', casterId: 'ana' },
    ongoing: { damage: [{ dice: { 4: 2 }, bonus: 0, type: 'acid' }] },
  });
  const list = [createCondition('burning'), acid, createCondition('Prone')];
  assert.deepEqual(removeChip(list, createCondition('Burning')), [acid, list[2]]);
});

test('two casters each keep their own chip of one name', () => {
  let list = addCondition([], 'Blessed', 10, cast('bless', 'A'));
  list = addCondition(list, 'Blessed', 10, cast('bless', 'B'));
  assert.deepEqual(
    list.map((c) => c.source?.casterId),
    ['A', 'B'],
  );
  list = addCondition(list, 'Blessed', 10, cast('bless', 'B'));
  assert.equal(list.length, 2, 'a recast by B refreshes only its own chip');
  list = addCondition(list, 'Blessed', 5);
  assert.deepEqual(
    list.map((c) => c.source?.casterId ?? null),
    [null],
    'a hand-added chip still replaces every sourced one',
  );
});

test('strongestPerName keeps one chip per name, the highest score, first on a tie', () => {
  const a = createCondition('Shielded', 10, { mods: { ac: 2 } });
  const b = createCondition('shielded', 10, { mods: { ac: 5 } });
  const c = createCondition('Prone');
  const d = createCondition('Shielded', 10, { mods: { ac: 5 } });
  const score = (/** @type {any} */ chip) => chip.mods?.ac ?? 0;
  assert.deepEqual(strongestPerName([a, c, b, d], score), [b, c]);
});
