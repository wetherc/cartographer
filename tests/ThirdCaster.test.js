import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slotsForCaster,
  casterLevelContribution,
  characterSlots,
  syncSlotsToLevel,
  getSlotPools,
} from '../src/entities/SpellSlots.js';
import {
  casterClassRefs,
  cantripLimit,
  cantripsKnownForClass,
  casterSlots,
  hasPreparedCaster,
  hasRitualCasting,
  slotsForClass,
  spellAbilityModifier,
  spellSaveDC,
} from '../src/entities/Classes.js';
import { classSpellLevelCap, canLearnSpell } from '../src/entities/SpellLearning.js';
import { spellRule } from '../src/entities/SpellView.js';
import {
  isCaster,
  casterSummary,
  withCasterFields,
  ensureCasterFields,
  casterTemplateFields,
} from '../src/entities/Caster.js';
import {
  createCreature,
  editCreature,
  toTemplate,
  fromTemplate,
} from '../src/entities/Creature.js';
import { normalizeLibrary } from '../src/library/Library.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** @param {string} id */
function spell(id) {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  assert.ok(found, `fixture spell ${id} exists`);
  return found;
}

/** @param {import('../src/types/class.js').ClassRef[]} classes */
function classed(classes, over = {}) {
  return /** @type {any} */ ({
    id: 'c1',
    name: 'Vess',
    classes,
    level: classes.reduce((s, c) => s + c.level, 0),
    stats: { INT: 16 },
    resources: [],
    spellbook: { cantrips: [], known: [], prepared: [] },
    ...over,
  });
}

const EK = 'Eldritch Knight';
const AT = 'Arcane Trickster';

test('the third-caster table follows the Eldritch Knight progression', () => {
  const rows = Array.from({ length: 21 }, (_, i) => slotsForCaster('third', i + 1));
  assert.deepEqual(rows[1], [], 'no slots at 2');
  assert.deepEqual(rows[2], [2]);
  assert.deepEqual(rows[3], [3]);
  assert.deepEqual(rows[6], [4, 2]);
  assert.deepEqual(rows[9], [4, 3]);
  assert.deepEqual(rows[12], [4, 3, 2]);
  assert.deepEqual(rows[15], [4, 3, 3]);
  assert.deepEqual(rows[18], [4, 3, 3, 1]);
  assert.deepEqual(rows[20], [4, 3, 3, 1], 'past 20 reads the level-20 row');
});

test('a third caster adds a third of its level to the combined caster level', () => {
  assert.equal(casterLevelContribution('third', 2), 0);
  assert.equal(casterLevelContribution('third', 3), 1);
  assert.equal(casterLevelContribution('third', 8), 2);
});

test('an Eldritch Knight reads its own table, and a Champion gets nothing', () => {
  assert.deepEqual(
    characterSlots(classed([{ classId: 'fighter', level: 7, subclass: EK }])),
    [4, 2],
  );
  assert.deepEqual(
    characterSlots(classed([{ classId: 'fighter', level: 7, subclass: 'Champion' }])),
    [],
  );
  assert.deepEqual(characterSlots(classed([{ classId: 'rogue', level: 3, subclass: AT }])), [2]);
});

test('an Eldritch Knight multiclass sums its third into the combined table', () => {
  const ekWizard = classed([
    { classId: 'fighter', level: 3, subclass: EK },
    { classId: 'wizard', level: 3 },
  ]);
  // Combined caster level 1 + 3 = 4 reads [4, 3].
  assert.deepEqual(characterSlots(ekWizard), [4, 3]);
});

test('a class without its Spellcasting feature yet does not join the combined table', () => {
  // A paladin 1 has no slots, so the Eldritch Knight 4 reads its own table.
  const dip = classed([
    { classId: 'fighter', level: 4, subclass: EK },
    { classId: 'paladin', level: 1 },
  ]);
  assert.deepEqual(characterSlots(dip), [3]);
  const ranger = classed([
    { classId: 'ranger', level: 5 },
    { classId: 'paladin', level: 1 },
  ]);
  assert.deepEqual(characterSlots(ranger), [4, 2], 'the half-caster case too');
});

test('syncSlotsToLevel grows Eldritch Knight slots at fighter level 3', () => {
  const two = classed([{ classId: 'fighter', level: 2, subclass: EK }]);
  assert.equal(syncSlotsToLevel(two), two, 'no casting before the subclass level');
  const three = syncSlotsToLevel(classed([{ classId: 'fighter', level: 3, subclass: EK }]));
  assert.deepEqual(
    getSlotPools(three).map((p) => p.max),
    [2],
  );
});

test('the class readers take a subclass', () => {
  assert.deepEqual(slotsForClass('fighter', 4, EK), [3]);
  assert.deepEqual(slotsForClass('fighter', 4), []);
  assert.deepEqual(slotsForClass(undefined, 4), []);
  assert.deepEqual(slotsForClass('bogus', 4), []);
  assert.deepEqual(
    casterSlots('rogue', 7, AT).map((p) => p.max),
    [4, 2],
  );
  assert.deepEqual(casterSlots(undefined, 7), []);
  assert.deepEqual(casterSlots('bogus', 7), []);
  assert.equal(cantripsKnownForClass('fighter', 3, EK), 2);
  assert.equal(cantripsKnownForClass('fighter', 10, EK), 3);
  assert.equal(cantripsKnownForClass('rogue', 3, AT), 3);
  assert.equal(cantripsKnownForClass('rogue', 10, AT), 4);
  assert.equal(cantripsKnownForClass('fighter', 10), 0);
  assert.equal(cantripsKnownForClass(undefined, 10), 0);
});

test('an Eldritch Knight casts with INT as a known caster without rituals', () => {
  const knight = classed([{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.deepEqual(casterClassRefs(knight), knight.classes);
  assert.equal(spellAbilityModifier(knight), 3);
  assert.equal(spellAbilityModifier(knight, 'fighter'), 3);
  assert.equal(spellSaveDC(knight, 'fighter'), 13);
  assert.equal(cantripLimit(knight), 2);
  assert.equal(hasPreparedCaster(knight), false);
  assert.equal(hasRitualCasting(knight), false);
  assert.equal(spellRule(knight, 'magic-missile'), 'known');
  assert.equal(isCaster(knight), true);
  const champion = classed([{ classId: 'fighter', level: 3, subclass: 'Champion' }]);
  assert.deepEqual(casterClassRefs(champion), []);
  assert.equal(spellAbilityModifier(champion, 'fighter'), null);
  assert.equal(isCaster(champion), false);
});

test('spellAbilityModifier reads a class the character does not hold from the catalog', () => {
  const knight = classed([{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.equal(spellAbilityModifier(knight, 'wizard'), 3);
});

test('an Eldritch Knight learns from the wizard list up to its own cap', () => {
  assert.equal(classSpellLevelCap('fighter', 3, EK), 1);
  assert.equal(classSpellLevelCap('fighter', 7, EK), 2);
  assert.equal(classSpellLevelCap('fighter', 13, EK), 3);
  assert.equal(classSpellLevelCap('fighter', 19, EK), 4);
  assert.equal(classSpellLevelCap('fighter', 19), 0);
  const three = classed([{ classId: 'fighter', level: 3, subclass: EK }]);
  assert.equal(canLearnSpell(three, spell('fire-bolt')), true);
  assert.equal(canLearnSpell(three, spell('magic-missile')), true);
  assert.equal(canLearnSpell(three, spell('scorching-ray')), false);
  assert.equal(canLearnSpell(three, spell('cure-wounds')), false, 'not on the wizard list');
  const seven = classed([{ classId: 'fighter', level: 7, subclass: EK }]);
  assert.equal(canLearnSpell(seven, spell('scorching-ray')), true);
  const two = classed([{ classId: 'fighter', level: 2, subclass: EK }]);
  assert.equal(canLearnSpell(two, spell('fire-bolt')), false, 'no casting before level 3');
});

test('a creature Eldritch Knight gets third-caster slots and names its subclass', () => {
  const knight = createCreature('k1', 'Hexblade', {
    maxHP: 30,
    level: 7,
    class: 'fighter',
    subclass: EK,
    casterLevel: 7,
    stats: { INT: 14 },
  });
  assert.deepEqual(
    getSlotPools(knight).map((p) => p.max),
    [4, 2],
  );
  assert.equal(isCaster(knight), true);
  assert.match(casterSummary(knight), /^Eldritch Knight 7 \| Spell DC 13/);
});

test('withCasterFields leaves a subclass that does not cast yet untouched', () => {
  const base = { id: 'x', name: 'X', resources: [] };
  assert.equal(withCasterFields(base, { class: 'fighter', subclass: EK, casterLevel: 2 }), base);
  assert.equal(withCasterFields(base, { class: 'fighter', casterLevel: 5 }), base);
});

test('ensureCasterFields backfills Eldritch Knight slots and keeps spent ones', () => {
  const bare = {
    id: 'x',
    name: 'X',
    class: 'fighter',
    subclass: EK,
    casterLevel: 4,
    resources: [],
  };
  const filled = ensureCasterFields(bare);
  assert.deepEqual(
    getSlotPools(filled).map((p) => p.max),
    [3],
  );
  const spent = {
    ...filled,
    resources: filled.resources.map((r) => ({ ...r, current: 1 })),
  };
  assert.equal(getSlotPools(ensureCasterFields(spent))[0].current, 1);
  const champion = { ...bare, subclass: 'Champion' };
  assert.equal(ensureCasterFields(champion), champion);
});

test('a creature template keeps an Eldritch Knight through a spawn', () => {
  const knight = createCreature('k1', 'Hexblade', {
    maxHP: 30,
    class: 'fighter',
    subclass: EK,
    casterLevel: 5,
  });
  const fields = casterTemplateFields(knight);
  assert.equal(fields.subclass, EK);
  assert.deepEqual(casterTemplateFields({ class: 'fighter', subclass: 'Champion' }), {});
  assert.equal(casterTemplateFields({ class: 'fighter', subclass: EK }).class, 'fighter');
  const spawned = fromTemplate(toTemplate('t1', knight), 'k2');
  assert.deepEqual(
    getSlotPools(spawned).map((p) => p.max),
    [3],
  );
});

test('editCreature keeps spent Eldritch Knight slots and a named domain', () => {
  const knight = createCreature('k1', 'Hexblade', {
    maxHP: 30,
    level: 4,
    class: 'fighter',
    subclass: EK,
    casterLevel: 4,
  });
  const spent = { ...knight, resources: knight.resources.map((r) => ({ ...r, current: 0 })) };
  const edits = {
    name: 'Hexblade',
    disposition: /** @type {const} */ ('hostile'),
    maxHP: 30,
    level: 4,
    tier: /** @type {const} */ ('mob'),
    location: null,
    class: 'fighter',
    subclass: EK,
    casterLevel: 4,
  };
  const kept = editCreature(spent, edits);
  assert.equal(getSlotPools(kept)[0].current, 0, 'an unrelated edit keeps spent slots');
  const cleared = editCreature(spent, { ...edits, subclass: 'Champion' });
  assert.deepEqual(getSlotPools(cleared), [], 'a non-casting subclass sheds the slots');
  assert.equal(cleared.spellbook, undefined);
  const priest = createCreature('p1', 'Priest', {
    maxHP: 20,
    level: 3,
    class: 'cleric',
    subclass: 'life',
  });
  const renamed = editCreature(priest, {
    ...edits,
    name: 'Priest',
    class: 'cleric',
    subclass: undefined,
    casterLevel: 3,
  });
  assert.equal(renamed.subclass, 'life', 'the form sends no subclass for a cleric');
});

test('normalizeLibrary keeps an Eldritch Knight template and drops a Champion', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Knight', class: 'fighter', subclass: EK },
      { name: 'Young Knight', class: 'fighter', subclass: EK, casterLevel: 2 },
      { name: 'Brute', class: 'fighter', subclass: 'Champion' },
    ],
  });
  const [knight, young, brute] = lib.creatures;
  assert.equal(knight.class, 'fighter');
  assert.equal(knight.subclass, EK);
  assert.equal(young.class, undefined);
  assert.equal(brute.class, undefined);
});
