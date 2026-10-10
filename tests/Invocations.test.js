import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blastPush,
  eligibleInvocations,
  getInvocation,
  getInvocations,
  getPactBoon,
  invocationCast,
  invocationCount,
  invocationSpellIds,
  invocationsClaim,
  invokedSpell,
  markInvocationUsed,
  settleInvocationSkills,
  pactBoonName,
  setInvocations,
  setPactBoon,
} from '../src/entities/Invocations.js';
import { longRest } from '../src/entities/Character.js';
import { emptyProficiencies } from '../src/entities/Proficiencies.js';
import { INVOCATIONS } from '../src/data/invocationCatalog.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** A warlock of the given level, with Eldritch Blast unless told otherwise. */
function warlock(level, { cantrips = ['eldritch-blast'], ...rest } = {}) {
  return /** @type {any} */ ({
    id: 'w',
    name: 'Wren',
    classes: [{ classId: 'warlock', level }],
    level,
    resources: [],
    proficiencies: emptyProficiencies(),
    spellbook: { cantrips, known: [], prepared: [] },
    ...rest,
  });
}

const spell = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));
const ids = (list) => list.map((inv) => inv.id);

test('the invocation count follows the warlock level', () => {
  assert.deepEqual(
    [1, 2, 4, 5, 7, 9, 12, 15, 18, 20].map(invocationCount),
    [0, 2, 2, 3, 4, 5, 6, 7, 8, 8],
  );
});

test('every invocation names a spell and a cantrip that exist, under a unique id', () => {
  const spellIds = new Set(DEFAULT_SPELLS.map((s) => s.id));
  assert.equal(new Set(ids(INVOCATIONS)).size, INVOCATIONS.length);
  for (const inv of INVOCATIONS) {
    if (inv.cantrip) assert.ok(spellIds.has(inv.cantrip), inv.id);
    const effect = /** @type {any} */ (inv.effect);
    if (effect?.spellId) assert.ok(spellIds.has(effect.spellId), inv.id);
  }
  assert.equal(getInvocation('nope'), undefined);
});

test('eligibility reads the warlock level, the cantrip, and the pact boon', () => {
  const low = ids(eligibleInvocations(warlock(2)));
  assert.ok(low.includes('agonizing-blast'));
  assert.ok(!low.includes('mire-the-mind'));
  assert.ok(!low.includes('book-of-ancient-secrets'));
  assert.ok(!ids(eligibleInvocations(warlock(2, { cantrips: [] }))).includes('agonizing-blast'));
  const tome = ids(eligibleInvocations(warlock(5, { pactBoon: 'tome' })));
  assert.ok(tome.includes('book-of-ancient-secrets'));
  assert.ok(tome.includes('mire-the-mind'));
  assert.ok(!tome.includes('thirsting-blade'));
  assert.deepEqual(eligibleInvocations(/** @type {any} */ ({ classes: [], level: 1 })), []);
});

test('a pact boon counts from 3rd warlock level, and only a known boon counts', () => {
  assert.equal(getPactBoon(warlock(2, { pactBoon: 'tome' })), null);
  assert.equal(getPactBoon(warlock(3, { pactBoon: 'tome' })), 'tome');
  assert.equal(getPactBoon(warlock(3, { pactBoon: 'wand' })), null);
  assert.equal(pactBoonName('chain'), 'Pact of the Chain');
  assert.equal(pactBoonName(/** @type {any} */ ('wand')), 'wand');
});

test('setInvocations drops repeats, unknown ids, ineligible picks, and picks past the count', () => {
  const next = setInvocations(warlock(2), [
    'agonizing-blast',
    'agonizing-blast',
    'nope',
    'mire-the-mind',
    'eldritch-sight',
    'devils-sight',
  ]);
  assert.deepEqual(next.invocations, ['agonizing-blast', 'eldritch-sight']);
  assert.equal('invocations' in setInvocations(next, []), false);
});

test('getInvocations keeps only the picks that still apply', () => {
  const picked = warlock(5, {
    invocations: ['mire-the-mind', 'agonizing-blast', 'eldritch-sight'],
  });
  assert.deepEqual(ids(getInvocations(picked)), [
    'mire-the-mind',
    'agonizing-blast',
    'eldritch-sight',
  ]);
  const lower = { ...picked, classes: [{ classId: 'warlock', level: 2 }] };
  assert.deepEqual(ids(getInvocations(lower)), ['agonizing-blast', 'eldritch-sight']);
  assert.deepEqual(getInvocations(warlock(5)), []);
});

test('Beguiling Influence records its skills and gives them back on undo', () => {
  const had = warlock(2, {
    proficiencies: { ...emptyProficiencies(), skills: ['deception'] },
  });
  const picked = setInvocations(had, ['beguiling-influence']);
  assert.deepEqual(picked.proficiencies.skills.sort(), ['deception', 'persuasion']);
  const record = picked.featureChoices['warlock 2 Beguiling Influence'];
  assert.deepEqual(record.granted, { skills: ['persuasion'] });
  assert.equal(
    setInvocations(picked, ['beguiling-influence']).featureChoices,
    picked.featureChoices,
  );
  const undone = setInvocations(picked, ['agonizing-blast']);
  assert.deepEqual(undone.proficiencies.skills, ['deception']);
  assert.equal('warlock 2 Beguiling Influence' in (undone.featureChoices ?? {}), false);
});

test('Beguiling Influence on a warlock that has both skills records no grant', () => {
  const had = warlock(2, {
    proficiencies: { ...emptyProficiencies(), skills: ['deception', 'persuasion'] },
  });
  const picked = setInvocations(had, ['beguiling-influence']);
  const record = picked.featureChoices['warlock 2 Beguiling Influence'];
  assert.equal('granted' in record, false);
  assert.deepEqual(record.requested, { skills: ['deception', 'persuasion'] });
  const undone = setInvocations(picked, []);
  assert.deepEqual(undone.proficiencies.skills, ['deception', 'persuasion']);
  assert.deepEqual(undone.featureChoices, {});
});

test('setPactBoon drops the picks that needed the old boon', () => {
  const tome = setInvocations(warlock(3, { pactBoon: 'tome' }), ['book-of-ancient-secrets']);
  assert.deepEqual(tome.invocations, ['book-of-ancient-secrets']);
  const chain = setPactBoon(tome, 'chain');
  assert.equal(chain.pactBoon, 'chain');
  assert.equal('invocations' in chain, false);
  assert.equal('pactBoon' in setPactBoon(chain, null), false);
});

test('Agonizing Blast and Eldritch Spear change Eldritch Blast', () => {
  const blast = spell('eldritch-blast');
  const plain = warlock(2);
  assert.equal(invokedSpell(plain, blast), blast);
  const both = warlock(2, { invocations: ['agonizing-blast', 'eldritch-spear'] });
  const changed = invokedSpell(both, blast);
  assert.equal(changed.effect.addsModifier, true);
  assert.equal(changed.range, '300 feet');
  assert.equal(blast.effect.addsModifier, undefined);
  const spear = invokedSpell(warlock(2, { invocations: ['eldritch-spear'] }), blast);
  assert.equal(spear.effect, blast.effect);
  const fire = spell('fire-bolt');
  assert.equal(invokedSpell(both, fire), fire);
});

test('an at-will invocation on the warlock alone reads as Self with no material', () => {
  const shadows = warlock(2, { invocations: ['armor-of-shadows', 'eldritch-sight'] });
  const armor = invokedSpell(shadows, spell('mage-armor'));
  assert.equal(armor.range, 'Self');
  assert.deepEqual(armor.components, ['V', 'S']);
  assert.equal('materials' in armor, false);
  const sight = spell('detect-magic');
  assert.equal(invokedSpell(shadows, sight), sight);
  const misty = invokedSpell(warlock(2, { invocations: ['misty-visions'] }), spell('silent-image'));
  assert.equal(misty.range, '60 feet');
  assert.deepEqual(misty.components, ['V', 'S']);
});

test('blastPush names Repelling Blast', () => {
  assert.equal(blastPush(warlock(2)), null);
  assert.equal(blastPush(warlock(2, { invocations: ['agonizing-blast'] })), null);
  assert.deepEqual(blastPush(warlock(2, { invocations: ['repelling-blast'] })), {
    name: 'Repelling Blast',
    feet: 10,
  });
});

test('invocationSpellIds lists each spell an invocation casts once', () => {
  const w = warlock(9, {
    invocations: ['armor-of-shadows', 'agonizing-blast', 'thief-of-five-fates', 'ascendant-step'],
  });
  assert.deepEqual(invocationSpellIds(w), ['mage-armor', 'bane', 'levitate']);
});

test('invocationCast tells an at-will cast from a once-per-rest one', () => {
  const w = warlock(2, { invocations: ['armor-of-shadows', 'thief-of-five-fates'] });
  const armor = invocationCast(w, 'mage-armor');
  assert.equal(armor?.invocation.id, 'armor-of-shadows');
  assert.equal(armor?.oncePerRest, false);
  assert.equal(armor?.spent, false);
  assert.deepEqual(
    {
      oncePerRest: invocationCast(w, 'bane')?.oncePerRest,
      spent: invocationCast(w, 'bane')?.spent,
    },
    { oncePerRest: true, spent: false },
  );
  const used = markInvocationUsed(w, 'thief-of-five-fates');
  assert.equal(invocationCast(used, 'bane')?.spent, true);
  assert.equal(markInvocationUsed(used, 'thief-of-five-fates'), used);
  assert.equal(invocationCast(w, 'fire-bolt'), null);
});

test('a long rest gives back the once-per-rest invocations', () => {
  const used = markInvocationUsed(warlock(2), 'thief-of-five-fates');
  assert.equal('invocationUses' in longRest(used), false);
});

test('invokedSpell keeps the range and material of a cast with a slot', () => {
  const c = setInvocations(warlock(2), ['armor-of-shadows']);
  const armor = spell('mage-armor');
  assert.equal(invokedSpell(c, armor).range, 'Self');
  assert.equal(invokedSpell(c, armor, { atWill: false }), armor);
});

test('the Beguiling Influence skills follow the warlock level', async () => {
  const { getProficiencies } = await import('../src/entities/Proficiencies.js');
  const c = setInvocations(warlock(2), ['beguiling-influence']);
  assert.equal(settleInvocationSkills(c), c);
  const low = settleInvocationSkills({ ...c, classes: [{ classId: 'warlock', level: 1 }] });
  assert.deepEqual(getProficiencies(low).skills, []);
  const back = settleInvocationSkills({ ...low, classes: [{ classId: 'warlock', level: 2 }] });
  assert.deepEqual(getProficiencies(back).skills, ['deception', 'persuasion']);
});

test('invocations and the pact boon claim the warlock levels they need', () => {
  assert.equal(invocationsClaim(warlock(2), 2), false);
  assert.equal(invocationsClaim(setInvocations(warlock(2), ['agonizing-blast']), 2), true);
  assert.equal(invocationsClaim(setInvocations(warlock(4), ['agonizing-blast']), 4), false);
  const five = setInvocations(warlock(5), ['agonizing-blast', 'mire-the-mind']);
  assert.equal(invocationsClaim(five, 5), true, 'Mire the Mind needs 5th level');
  assert.equal(invocationsClaim(setPactBoon(warlock(4), 'blade'), 3), true);
  assert.equal(invocationsClaim(setPactBoon(warlock(4), 'blade'), 4), false);
});
