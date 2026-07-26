import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacter,
  withDefaults,
  getClasses,
  getSpellbook,
  emptySpellbook,
  learnCantrip,
  unlearnCantrip,
  learnSpell,
  unlearnSpell,
  prepareSpell,
  unprepareSpell,
} from '../src/entities/Character.js';
import { cantripLimit, preparedLimit } from '../src/entities/Classes.js';

/** A wizard fixture: class set, INT high enough for a comfortable prepared cap. */
function wizard(over = {}) {
  return {
    ...createCharacter('c1', 'Mage', { INT: 16 }),
    classes: [{ classId: 'wizard', level: 3 }],
    level: 3,
    ...over,
  };
}

test('createCharacter and withDefaults both carry an empty spellbook', () => {
  assert.deepEqual(getSpellbook(createCharacter('c', 'C')), emptySpellbook());
  // A pre-spellbook save (no spellbook field) is migrated to an empty one.
  const legacy = { ...createCharacter('c', 'C') };
  delete legacy.spellbook;
  assert.deepEqual(getSpellbook(withDefaults(legacy)), emptySpellbook());
  // getSpellbook tolerates the missing field directly, too.
  assert.deepEqual(getSpellbook(legacy), emptySpellbook());
});

test('getClasses returns a single-entry list for a classed character, empty otherwise', () => {
  assert.deepEqual(
    getClasses(wizard({ classes: [{ classId: 'wizard', level: 3, subclass: 'evocation' }] })),
    [{ classId: 'wizard', level: 3, subclass: 'evocation' }],
  );
  assert.deepEqual(getClasses(createCharacter('c', 'C')), []);
});

test('learnCantrip respects the class cantrip limit and rejects duplicates', () => {
  const mage = wizard(); // wizard L3 cantrip limit is 3
  assert.equal(cantripLimit(mage), 3);
  let m = learnCantrip(mage, 'fire-bolt');
  assert.deepEqual(getSpellbook(m).cantrips, ['fire-bolt']);
  // Duplicate does nothing.
  assert.equal(learnCantrip(m, 'fire-bolt'), m);
  m = learnCantrip(m, 'ray-of-frost');
  m = learnCantrip(m, 'light');
  assert.equal(getSpellbook(m).cantrips.length, 3);
  // Fourth exceeds the limit -> unchanged.
  assert.equal(learnCantrip(m, 'mage-hand'), m);
});

test('unlearnCantrip removes a cantrip and no-ops on an absent one', () => {
  const m = learnCantrip(wizard(), 'fire-bolt');
  assert.deepEqual(getSpellbook(unlearnCantrip(m, 'fire-bolt')).cantrips, []);
  assert.equal(unlearnCantrip(m, 'nonesuch').spellbook.cantrips.length, 1);
});

test('learnSpell adds to known once; unlearnSpell drops from known and prepared', () => {
  let m = learnSpell(wizard(), 'magic-missile');
  assert.deepEqual(getSpellbook(m).known, ['magic-missile']);
  assert.equal(learnSpell(m, 'magic-missile'), m); // duplicate no-op
  m = prepareSpell(m, 'magic-missile');
  assert.deepEqual(getSpellbook(m).prepared, ['magic-missile']);
  m = unlearnSpell(m, 'magic-missile');
  assert.deepEqual(getSpellbook(m).known, []);
  assert.deepEqual(getSpellbook(m).prepared, [], 'unlearning also unprepares');
});

test('prepareSpell requires the spell be known, rejects duplicates, honors the limit', () => {
  // Level-1 wizard, INT 16 (+3): prepared limit = max(1, 3 + 1) = 4.
  const mage = wizard({ classes: [{ classId: 'wizard', level: 1 }], level: 1 });
  assert.equal(preparedLimit(mage), 4);
  // Preparing an unknown spell does nothing.
  assert.equal(prepareSpell(mage, 'magic-missile'), mage);

  let m = mage;
  for (const id of ['s1', 's2', 's3', 's4', 's5']) m = learnSpell(m, id);
  for (const id of ['s1', 's2', 's3', 's4']) m = prepareSpell(m, id);
  assert.equal(getSpellbook(m).prepared.length, 4);
  // Fifth exceeds the limit -> unchanged.
  assert.equal(prepareSpell(m, 's5'), m);
  // Re-preparing an already-prepared spell -> unchanged.
  assert.equal(prepareSpell(m, 's1'), m);
});

test('unprepareSpell keeps the spell known', () => {
  let m = prepareSpell(learnSpell(wizard(), 'bless'), 'bless');
  m = unprepareSpell(m, 'bless');
  assert.deepEqual(getSpellbook(m).prepared, []);
  assert.deepEqual(getSpellbook(m).known, ['bless'], 'still known after unprepare');
});

test('spellbook mutators no-op cleanly for a classless (non-caster) character', () => {
  const npcish = createCharacter('c', 'C');
  assert.equal(cantripLimit(npcish), 0);
  assert.equal(preparedLimit(npcish), 0);
  // No cantrip capacity, so a learn is refused.
  assert.equal(learnCantrip(npcish, 'fire-bolt'), npcish);
});
