import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTomeRituals,
  hasAncientSecrets,
  maxRitualLevel,
  pendingTomeCantrips,
  pendingTomeRituals,
  setTomeCantrips,
  settleTome,
  tomeCantrips,
  tomeOptions,
  tomeRituals,
} from '../src/entities/PactTome.js';
import { cantripLimit, hasRitualCasting, spellSaveDC } from '../src/entities/Classes.js';
import { learnCantrip, unlearnCantrip } from '../src/entities/Character.js';
import { setInvocations, setPactBoon } from '../src/entities/Invocations.js';
import { isRitualOnly } from '../src/entities/SpellView.js';
import { canCast, castSpell } from '../src/entities/Casting.js';
import { toCaster } from '../src/entities/Caster.js';
import { applyWarlockPicks } from '../src/entities/InvocationLevelUp.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

const spell = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A Pact of the Tome warlock of the given level with two class cantrips. */
function warlock(level, rest = {}) {
  return /** @type {any} */ ({
    id: 'w',
    name: 'Wren',
    classes: [{ classId: 'warlock', level }],
    level,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 16 },
    resources: [],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['eldritch-blast', 'chill-touch'], known: [], prepared: [] },
    pactBoon: 'tome',
    ...rest,
  });
}

const secrets = { invocations: ['book-of-ancient-secrets'] };

test('the book needs the Tome boon at 3rd warlock level', () => {
  assert.equal(pendingTomeCantrips(warlock(3)), 3);
  assert.equal(pendingTomeCantrips(warlock(2)), 0);
  assert.equal(pendingTomeCantrips(warlock(3, { pactBoon: 'chain' })), 0);
  assert.equal(setTomeCantrips(warlock(3, { pactBoon: 'blade' }), ['fire-bolt']).pactBoon, 'blade');
  assert.deepEqual(setTomeCantrips(warlock(2), ['fire-bolt']).spellbook.cantrips.length, 2);
});

test('book cantrips join the spellbook as warlock spells and do not count against the limit', () => {
  const base = warlock(3);
  assert.equal(cantripLimit(base), 2);
  const c = setTomeCantrips(base, ['fire-bolt', 'sacred-flame', 'guidance', 'light']);
  assert.deepEqual(tomeCantrips(c), ['fire-bolt', 'sacred-flame', 'guidance']);
  assert.deepEqual(c.spellbook.cantrips, [
    'eldritch-blast',
    'chill-touch',
    'fire-bolt',
    'sacred-flame',
    'guidance',
  ]);
  assert.equal(c.spellbook.sources['fire-bolt'], 'warlock');
  assert.equal(cantripLimit(c), 5);
  assert.equal(pendingTomeCantrips(c), 0);
  // The class cantrips are still full, so a new class cantrip refuses.
  assert.equal(learnCantrip(c, 'ray-of-frost', 'warlock'), c);
  assert.equal(canCast(toCaster(c), spell('fire-bolt')), true);
  assert.equal(spellSaveDC(toCaster(c), 'warlock'), 13);
});

test('picking the book cantrips again replaces the old ones and keeps a class cantrip', () => {
  const c = setTomeCantrips(warlock(3), ['fire-bolt', 'guidance', 'light']);
  const next = setTomeCantrips(c, ['chill-touch', 'ray-of-frost']);
  assert.deepEqual(next.spellbook.cantrips, ['eldritch-blast', 'chill-touch', 'ray-of-frost']);
  assert.deepEqual(next.bookOfShadows?.cantrips, ['ray-of-frost']);
  assert.equal('fire-bolt' in next.spellbook.sources, false);
});

test('a forgotten book cantrip no longer counts', () => {
  const c = setTomeCantrips(warlock(3), ['fire-bolt']);
  const forgot = { ...c, spellbook: { ...c.spellbook, cantrips: ['eldritch-blast'] } };
  assert.deepEqual(tomeCantrips(forgot), []);
  assert.equal(pendingTomeCantrips(forgot), 3);
});

test('Book of Ancient Secrets needs the invocation and the Tome boon', () => {
  assert.equal(hasAncientSecrets(warlock(3, secrets)), true);
  assert.equal(hasAncientSecrets(warlock(3)), false);
  assert.equal(hasAncientSecrets(warlock(3, { ...secrets, pactBoon: 'chain' })), false);
  assert.equal(pendingTomeRituals(warlock(3, secrets)), 2);
  assert.equal(pendingTomeRituals(warlock(3)), 0);
});

test('rituals copy in up to half the warlock level, rituals only, no repeats', () => {
  assert.equal(maxRitualLevel(warlock(3)), 2);
  const c = addTomeRituals(warlock(3, secrets), [
    spell('detect-magic'),
    spell('fireball'),
    { ...spell('detect-magic'), id: 'deep-ritual', level: 3 },
  ]);
  assert.deepEqual(tomeRituals(c), ['detect-magic']);
  assert.equal(addTomeRituals(c, [spell('detect-magic')]), c);
  assert.equal(addTomeRituals(warlock(3), [spell('detect-magic')]).bookOfShadows, undefined);
  const both = addTomeRituals(c, [spell('speak-with-animals')]);
  assert.deepEqual(tomeRituals(both), ['detect-magic', 'speak-with-animals']);
  assert.equal(pendingTomeRituals(both), 0);
});

test('a book ritual casts as a ritual only, and the warlock gains ritual casting for it', () => {
  const c = addTomeRituals(warlock(3, secrets), [spell('detect-magic')]);
  const caster = toCaster(c);
  assert.equal(hasRitualCasting(caster), true);
  assert.equal(hasRitualCasting(caster, 'detect-magic'), true);
  assert.equal(hasRitualCasting(caster, 'comprehend-languages'), false);
  assert.equal(hasRitualCasting(toCaster(warlock(3))), false);
  assert.equal(isRitualOnly(caster, spell('detect-magic')), true);
  assert.equal(castSpell(caster, spell('detect-magic'), { slotLevel: 1 }).ok, false);
  const ritual = castSpell(caster, spell('detect-magic'), { ritual: true });
  assert.equal(ritual.ok, true);
  assert.equal(ritual.ok && ritual.spent, false);
});

test('tomeOptions offers every cantrip, or every leveled ritual up to a level', () => {
  const cantrips = tomeOptions(DEFAULT_SPELLS, 'cantrip');
  assert.ok(cantrips.every((s) => s.level === 0));
  assert.ok(cantrips.some((s) => s.id === 'sacred-flame'));
  assert.deepEqual(
    tomeOptions(DEFAULT_SPELLS, 'ritual', 1)
      .map((s) => s.id)
      .sort(),
    ['detect-magic', 'speak-with-animals'],
  );
});

test('applyWarlockPicks fills an empty book and adds rituals', () => {
  const c = warlock(3, { pactBoon: undefined });
  const next = applyWarlockPicks(c, {
    boon: 'tome',
    added: ['book-of-ancient-secrets'],
    tomeCantrips: ['fire-bolt'],
    rituals: [spell('detect-magic')],
  });
  assert.deepEqual(tomeCantrips(next), ['fire-bolt']);
  assert.deepEqual(tomeRituals(next), ['detect-magic']);
  const again = applyWarlockPicks(next, { added: [], tomeCantrips: ['light'] });
  assert.deepEqual(tomeCantrips(again), ['fire-bolt']);
});

test('a switch away from the Pact of the Tome removes the book cantrips', () => {
  const tome = setTomeCantrips(warlock(5, secrets), ['fire-bolt', 'guidance', 'chill-touch']);
  const withRituals = addTomeRituals(tome, [spell('detect-magic')]);
  const blade = setPactBoon(withRituals, 'blade');
  assert.equal('bookOfShadows' in blade, false);
  // Chill Touch was a class cantrip before the book, so it stays.
  assert.deepEqual(blade.spellbook.cantrips, ['eldritch-blast', 'chill-touch']);
  assert.deepEqual(blade.spellbook.sources ?? {}, {});
  assert.equal(cantripLimit(blade), 3, 'no book cantrip counts against the limit');
  assert.deepEqual(blade.invocations, undefined, 'Book of Ancient Secrets needs the Tome');
  assert.equal(setPactBoon(withRituals, null).bookOfShadows, undefined);
});

test('dropping Book of Ancient Secrets empties the rituals and keeps the cantrips', () => {
  const tome = setTomeCantrips(warlock(5, secrets), ['fire-bolt']);
  const book = addTomeRituals(tome, [spell('detect-magic')]);
  const dropped = setInvocations(book, []);
  assert.deepEqual(dropped.bookOfShadows, { cantrips: ['fire-bolt'], rituals: [] });
  assert.deepEqual(tomeCantrips(dropped), ['fire-bolt']);
  // Taking the invocation again asks for two new rituals.
  assert.equal(pendingTomeRituals(setInvocations(dropped, ['book-of-ancient-secrets'])), 2);
});

test('settleTome leaves a character with nothing to take back unchanged', () => {
  const bare = warlock(5);
  assert.equal(settleTome(bare), bare);
  const tome = setTomeCantrips(warlock(5), ['fire-bolt']);
  assert.equal(settleTome(tome), tome, 'a Tome warlock keeps the book');
  const book = addTomeRituals(setTomeCantrips(warlock(5, secrets), ['fire-bolt']), [
    spell('detect-magic'),
  ]);
  assert.equal(settleTome(book), book, 'the invocation keeps the rituals');
  // A book with no spellbook beside it just goes.
  const orphan = {
    ...warlock(5, { pactBoon: 'chain' }),
    bookOfShadows: { cantrips: ['x'], rituals: [] },
  };
  delete orphan.spellbook;
  assert.equal('bookOfShadows' in settleTome(orphan), false);
  // A spellbook without a source map gets none.
  const noSources = {
    ...warlock(5, { pactBoon: 'chain' }),
    bookOfShadows: { cantrips: ['fire-bolt'], rituals: [] },
  };
  noSources.spellbook = { ...noSources.spellbook, cantrips: ['eldritch-blast', 'fire-bolt'] };
  assert.equal('sources' in settleTome(noSources).spellbook, false);
});

test('a forgotten book cantrip learned again from a class stays at the switch', () => {
  const tome = setTomeCantrips(warlock(5), ['fire-bolt', 'guidance']);
  const forgot = unlearnCantrip(tome, 'fire-bolt');
  assert.deepEqual(forgot.bookOfShadows.cantrips, ['guidance']);
  // Unlearning a class cantrip leaves the book alone.
  assert.equal(unlearnCantrip(tome, 'chill-touch').bookOfShadows, tome.bookOfShadows);
  const relearned = learnCantrip(forgot, 'fire-bolt', 'warlock');
  assert.deepEqual(tomeCantrips(relearned), ['guidance']);
  const chain = setPactBoon(relearned, 'chain');
  assert.deepEqual(chain.spellbook.cantrips, ['eldritch-blast', 'chill-touch', 'fire-bolt']);
});
