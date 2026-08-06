import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  castingCost,
  durationInRounds,
  formatCastingTime,
  formatDuration,
  parseCastingTime,
  parseDuration,
} from '../src/entities/SpellTiming.js';

/** The casting-time phrasings the SRD and the shipped corpus actually use,
 * each with the structured value it must read as. */
const CASTING_CASES = [
  ['1 action', { kind: 'action' }],
  ['action', { kind: 'action' }],
  ['1 bonus action', { kind: 'bonus' }],
  ['1 reaction', { kind: 'reaction' }],
  ['1 minute', { kind: 'minutes', amount: 1 }],
  ['10 minutes', { kind: 'minutes', amount: 10 }],
  ['1 hour', { kind: 'hours', amount: 1 }],
  ['8 hours', { kind: 'hours', amount: 8 }],
];

const DURATION_CASES = [
  ['Instantaneous', { kind: 'instantaneous' }],
  ['1 round', { kind: 'rounds', amount: 1 }],
  ['10 rounds', { kind: 'rounds', amount: 10 }],
  ['1 minute', { kind: 'minutes', amount: 1 }],
  ['1 hour', { kind: 'hours', amount: 1 }],
  ['8 hours', { kind: 'hours', amount: 8 }],
  ['7 days', { kind: 'days', amount: 7 }],
  ['Until dispelled', { kind: 'until-dispelled' }],
  ['Concentration, up to 1 minute', { kind: 'minutes', amount: 1, upTo: true }],
  ['Up to 1 minute', { kind: 'minutes', amount: 1, upTo: true }],
];

test('parseCastingTime reads every printed phrasing', () => {
  for (const [text, expected] of CASTING_CASES) {
    assert.deepEqual(parseCastingTime(text), expected, text);
  }
});

test('a reaction keeps its trigger clause verbatim', () => {
  const parsed = parseCastingTime('1 reaction, which you take when you see a Creature casting');
  assert.deepEqual(parsed, {
    kind: 'reaction',
    trigger: 'which you take when you see a Creature casting',
  });
  assert.equal(
    formatCastingTime(parsed),
    '1 reaction, which you take when you see a Creature casting',
  );
});

test('casting time round-trips through parse and format', () => {
  for (const [text] of CASTING_CASES) {
    const printed = formatCastingTime(parseCastingTime(text));
    // 'action' is the one input that is not itself the printed form.
    assert.deepEqual(parseCastingTime(printed), parseCastingTime(text), text);
  }
  assert.equal(formatCastingTime(parseCastingTime('1 bonus action')), '1 bonus action');
  assert.equal(formatCastingTime(parseCastingTime('10 minutes')), '10 minutes');
  assert.equal(formatCastingTime(parseCastingTime('1 hour')), '1 hour');
});

test('parseDuration reads every printed phrasing, stripping the concentration prefix', () => {
  for (const [text, expected] of DURATION_CASES) {
    assert.deepEqual(parseDuration(text), expected, text);
  }
});

test('duration round-trips, with concentration restoring its printed prefix', () => {
  assert.equal(formatDuration(parseDuration('Instantaneous')), 'Instantaneous');
  assert.equal(formatDuration(parseDuration('Until dispelled')), 'Until dispelled');
  assert.equal(formatDuration(parseDuration('1 round')), '1 round');
  assert.equal(formatDuration(parseDuration('8 hours')), '8 hours');
  assert.equal(formatDuration(parseDuration('Up to 1 minute')), 'Up to 1 minute');
  assert.equal(
    formatDuration(parseDuration('Concentration, up to 1 minute'), { concentration: true }),
    'Concentration, up to 1 minute',
  );
});

test('unreadable text is preserved rather than discarded', () => {
  const time = parseCastingTime('a full night of chanting');
  assert.deepEqual(time, { kind: 'special', text: 'a full night of chanting' });
  assert.equal(formatCastingTime(time), 'a full night of chanting');

  // The whole original is kept, prefix included, so a partial parse loses nothing.
  const duration = parseDuration('Concentration, until the moon sets');
  assert.deepEqual(duration, { kind: 'special', text: 'Concentration, until the moon sets' });
  assert.equal(formatDuration(duration), 'Concentration, until the moon sets');
});

test('a structured value passes through unchanged', () => {
  assert.deepEqual(parseCastingTime({ kind: 'minutes', amount: 10 }), {
    kind: 'minutes',
    amount: 10,
  });
  assert.deepEqual(parseDuration({ kind: 'rounds', amount: 3, upTo: true }), {
    kind: 'rounds',
    amount: 3,
    upTo: true,
  });
  // Fields the kind does not carry are dropped, so no stale amount survives a
  // kind change in the authoring form.
  assert.deepEqual(parseCastingTime({ kind: 'action', amount: 4, trigger: 'x' }), {
    kind: 'action',
  });
  assert.deepEqual(parseDuration({ kind: 'instantaneous', amount: 4, upTo: true }), {
    kind: 'instantaneous',
  });
});

test('a garbage structured value degrades to empty special text', () => {
  assert.deepEqual(parseCastingTime({ kind: 'fortnight' }), { kind: 'special', text: '' });
  assert.deepEqual(parseDuration({ kind: 'fortnight' }), { kind: 'special', text: '' });
  assert.deepEqual(parseCastingTime(null), { kind: 'special', text: '' });
  assert.deepEqual(parseDuration(undefined), { kind: 'special', text: '' });
});

test('a missing or nonsense amount falls back to one unit', () => {
  assert.deepEqual(parseCastingTime({ kind: 'hours' }), { kind: 'hours', amount: 1 });
  assert.deepEqual(parseDuration({ kind: 'minutes', amount: 0 }), { kind: 'minutes', amount: 1 });
  assert.deepEqual(parseDuration({ kind: 'days', amount: 'many' }), { kind: 'days', amount: 1 });
  assert.deepEqual(parseDuration({ kind: 'rounds', amount: 2.7 }), { kind: 'rounds', amount: 2 });
});

test('formatters plural only past one unit', () => {
  assert.equal(formatCastingTime({ kind: 'minutes', amount: 1 }), '1 minute');
  assert.equal(formatCastingTime({ kind: 'minutes', amount: 2 }), '2 minutes');
  assert.equal(formatDuration({ kind: 'days', amount: 1 }), '1 day');
  assert.equal(formatDuration({ kind: 'days', amount: 30 }), '30 days');
  // An amount-bearing kind with no amount still prints something sane.
  assert.equal(formatDuration({ kind: 'hours' }), '1 hour');
  assert.equal(formatCastingTime({ kind: 'special' }), 'Special');
  assert.equal(formatDuration({ kind: 'special' }), 'Special');
});

test('durationInRounds converts the tickable durations and refuses the rest', () => {
  assert.equal(durationInRounds({ kind: 'rounds', amount: 3 }), 3);
  assert.equal(durationInRounds({ kind: 'minutes', amount: 1 }), 10);
  assert.equal(durationInRounds({ kind: 'hours', amount: 1 }), 600);
  assert.equal(durationInRounds({ kind: 'instantaneous' }), null);
  assert.equal(durationInRounds({ kind: 'days', amount: 1 }), null);
  assert.equal(durationInRounds({ kind: 'until-dispelled' }), null);
  assert.equal(durationInRounds({ kind: 'special', text: 'when the sun rises' }), null);
});

test('a structured reaction keeps its trigger and drops an empty one', () => {
  assert.deepEqual(parseCastingTime({ kind: 'reaction', trigger: '  when you are hit  ' }), {
    kind: 'reaction',
    trigger: 'when you are hit',
  });
  assert.deepEqual(parseCastingTime({ kind: 'reaction', trigger: '   ' }), { kind: 'reaction' });
  assert.deepEqual(parseCastingTime({ kind: 'reaction' }), { kind: 'reaction' });
});

test('a structured special keeps its text and coerces a non-string away', () => {
  assert.deepEqual(parseCastingTime({ kind: 'special', text: ' a night of chanting ' }), {
    kind: 'special',
    text: 'a night of chanting',
  });
  assert.deepEqual(parseCastingTime({ kind: 'special', text: 12 }), { kind: 'special', text: '' });
  assert.deepEqual(parseDuration({ kind: 'special', text: ' until the moon sets ' }), {
    kind: 'special',
    text: 'until the moon sets',
  });
  assert.deepEqual(parseDuration({ kind: 'special' }), { kind: 'special', text: '' });
});

test('a casting time with no amount prints as one unit', () => {
  assert.equal(formatCastingTime({ kind: 'minutes' }), '1 minute');
  assert.equal(formatCastingTime({ kind: 'hours' }), '1 hour');
});

test('castingCost names the part of a turn a cast spends', () => {
  assert.equal(castingCost({ kind: 'action' }), 'action');
  assert.equal(castingCost({ kind: 'bonus' }), 'bonus');
  assert.equal(castingCost({ kind: 'reaction' }), 'reaction');
  assert.equal(castingCost(parseCastingTime('1 reaction, when you are hit')), 'reaction');
});

test('castingCost reads a casting time longer than a turn as no cost', () => {
  assert.equal(castingCost({ kind: 'minutes', amount: 10 }), null);
  assert.equal(castingCost({ kind: 'hours', amount: 1 }), null);
  assert.equal(castingCost({ kind: 'special', text: 'a full night of chanting' }), null);
});
