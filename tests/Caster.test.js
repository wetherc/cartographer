import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toCaster,
  isCaster,
  withCasterFields,
  ensureCasterFields,
  withCasterState,
  casterTemplateFields,
  casterSummary,
} from '../src/entities/Caster.js';
import {
  createCreature,
  toTemplate,
  fromTemplate,
  editCreature,
} from '../src/entities/Creature.js';
import { getSlotPools, slotLevelOf } from '../src/entities/SpellSlots.js';
import { spellSaveDC, spellAttackBonus } from '../src/entities/Classes.js';

/** The slot pool for a spell level, or undefined. */
function slot(entity, level) {
  return getSlotPools(entity).find((p) => slotLevelOf(p) === level);
}

test("toCaster carries a character's class list straight through", () => {
  const view = toCaster({
    id: 'c1',
    name: 'Mira',
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    stats: { INT: 16 },
    resources: [],
  });
  assert.equal(view.level, 5);
  assert.equal(view.stats.INT, 16);
  assert.deepEqual(view.classes, [{ classId: 'wizard', level: 5 }]);
});

test('a caster view reports the same DC and attack bonus as the character itself', () => {
  const character = {
    id: 'c1',
    name: 'Mira',
    classes: [
      { classId: 'cleric', level: 3 },
      { classId: 'wizard', level: 2 },
    ],
    level: 5,
    stats: { WIS: 16, INT: 14 },
    resources: [],
  };
  const view = /** @type {any} */ (toCaster(character));
  assert.equal(spellSaveDC(view), spellSaveDC(character));
  assert.equal(spellAttackBonus(view), spellAttackBonus(character));
  assert.equal(spellSaveDC(view), 8 + 3 + 3, 'proficiency +3 at level 5, WIS 16');
  assert.equal(spellSaveDC(view, 'wizard'), 8 + 3 + 2, "the named class's ability powers the DC");
});

test('toCaster reads a creature scalar class as a one-entry list at its caster level', () => {
  const view = toCaster({
    id: 'e1',
    name: 'Acolyte',
    class: 'cleric',
    subclass: 'life',
    casterLevel: 3,
    level: 2,
    statBlock: { WIS: 16 },
  });
  assert.deepEqual(view.classes, [{ classId: 'cleric', level: 3, subclass: 'life' }]);
  assert.equal(spellSaveDC(/** @type {any} */ (view)), 8 + 2 + 3, 'level 3: proficiency +2');
});

test('toCaster yields an empty class list for a classless entity', () => {
  assert.deepEqual(toCaster({ id: 'x', name: 'Blank' }).classes, []);
});

test('toCaster reads a pre-merge statBlock as stats and casterLevel as level', () => {
  const view = toCaster({
    id: 'e1',
    name: 'Cultist',
    class: 'cleric',
    casterLevel: 3,
    level: 2,
    statBlock: { WIS: 14, AC: 15 },
    resources: [],
  });
  assert.equal(view.level, 3, 'casterLevel wins over the mob level');
  assert.equal(view.stats.WIS, 14);
});

test('toCaster defaults a creature with no level to 1', () => {
  const view = toCaster({ id: 'n1', name: 'Seer', class: 'bard', stats: { CHA: 12 } });
  assert.equal(view.level, 1);
  assert.equal(view.stats.CHA, 12);
});

test('withCasterFields stamps caster-type-aware slots and an empty spellbook', () => {
  const cleric = withCasterFields({ id: 'e', name: 'C' }, { class: 'cleric' }, 3);
  assert.equal(cleric.casterLevel, 3);
  assert.deepEqual(cleric.spellbook, { cantrips: [], known: [], prepared: [] });
  assert.equal(slot(cleric, 1).max, 4, 'full caster level 3: four 1st-level slots');
  assert.equal(slot(cleric, 2).max, 2);
});

test('withCasterFields honors an explicit subclass and casterLevel over the default', () => {
  const c = withCasterFields(
    { id: 'e', name: 'C' },
    { class: 'wizard', subclass: 'evocation', casterLevel: 7 },
    1,
  );
  assert.equal(c.subclass, 'evocation');
  assert.equal(c.casterLevel, 7, 'the option level wins over the default');
});

test('withCasterFields floors a zero/garbage caster level to 1', () => {
  const c = withCasterFields({ id: 'e', name: 'C' }, { class: 'cleric', casterLevel: 0 }, 5);
  assert.equal(c.casterLevel, 1);
});

test('toCaster falls back to an empty stat map with neither stats nor statBlock', () => {
  const view = toCaster({ id: 'x', name: 'Blank', class: 'wizard' });
  assert.deepEqual(view.stats, {});
});

test('withCasterState tolerates an entity with no resources array', () => {
  const next = withCasterState(
    { id: 'e', name: 'C' },
    { resources: [{ id: 'slots-1', name: 'L1', type: 'mana', current: 2, max: 4 }] },
  );
  assert.equal(slot(next, 1).current, 2);
});

test('casterTemplateFields carries a subclass and omits an absent caster level', () => {
  const fields = casterTemplateFields({ class: 'wizard', subclass: 'evocation' });
  assert.equal(fields.subclass, 'evocation');
  assert.ok(!('casterLevel' in fields), 'no caster level is carried when the entity has none');
});

test('withCasterFields respects half-caster tables (paladin has no level-1 slots)', () => {
  const pal1 = withCasterFields({ id: 'e', name: 'P' }, { class: 'paladin' }, 1);
  assert.equal(getSlotPools(pal1).length, 0);
  const pal2 = withCasterFields({ id: 'e', name: 'P' }, { class: 'paladin' }, 2);
  assert.equal(slot(pal2, 1).max, 2);
});

test('withCasterFields is a no-op for a non-caster class or none', () => {
  const base = { id: 'e', name: 'Brute' };
  assert.equal(withCasterFields(base, { class: 'fighter' }, 5), base);
  assert.equal(withCasterFields(base, {}, 5), base);
});

test('withCasterFields keeps non-slot resources and replaces stale slots', () => {
  const rage = { id: 'x', name: 'X', current: 2, max: 2 };
  const first = withCasterFields({ id: 'e', name: 'C', resources: [rage] }, { class: 'cleric' }, 1);
  const second = withCasterFields(first, { class: 'cleric' }, 5);
  assert.ok(second.resources.includes(rage), 'the custom pool survives');
  assert.equal(
    getSlotPools(second).filter((p) => slotLevelOf(p) === 1).length,
    1,
    'no duplicate slot pool',
  );
  assert.equal(slot(second, 3).max, 2, 'slots rebuilt for the new level');
});

test('ensureCasterFields keeps spent slots but backfills a missing spellbook', () => {
  const caster = withCasterFields({ id: 'e', name: 'C' }, { class: 'cleric' }, 3);
  const spent = {
    ...caster,
    spellbook: undefined,
    resources: caster.resources.map((p) => (slotLevelOf(p) === 1 ? { ...p, current: 1 } : p)),
  };
  const restored = ensureCasterFields(spent, 3);
  assert.deepEqual(restored.spellbook, { cantrips: [], known: [], prepared: [] });
  assert.equal(slot(restored, 1).current, 1, 'spent slots are preserved, not refilled');
});

test('ensureCasterFields stamps slots when none are stored', () => {
  const noSlots = ensureCasterFields({ id: 'e', name: 'C', class: 'druid' }, 4);
  assert.equal(slot(noSlots, 2).max, 3, 'full caster level 4');
});

test('isCaster requires a caster class and a spellbook', () => {
  assert.equal(
    isCaster({ class: 'wizard', spellbook: { cantrips: [], known: [], prepared: [] } }),
    true,
  );
  assert.equal(
    isCaster({
      classes: [
        { classId: 'fighter', level: 2 },
        { classId: 'wizard', level: 1 },
      ],
      spellbook: { cantrips: [], known: [], prepared: [] },
    }),
    true,
    'a class list answers the same as a scalar class',
  );
  assert.equal(isCaster({ class: 'wizard' }), false);
  assert.equal(
    isCaster({ class: 'fighter', spellbook: { cantrips: [], known: [], prepared: [] } }),
    false,
  );
});

test("withCasterState splices a resolved cast's slots back onto the entity", () => {
  const rage = { id: 'rage', name: 'Rage', current: 1, max: 2 };
  const entity = {
    id: 'e',
    name: 'C',
    resources: [rage, { id: 'slots-1', name: 'L1', type: 'mana', current: 4, max: 4 }],
  };
  const casterResult = {
    resources: [{ id: 'slots-1', name: 'L1', type: 'mana', current: 3, max: 4 }],
  };
  const next = withCasterState(entity, casterResult);
  assert.ok(next.resources.includes(rage), 'non-slot resources kept');
  assert.equal(slot(next, 1).current, 3, 'spent slot written back');
});

test('casterTemplateFields carries the caster identity, not its live slots', () => {
  const book = { cantrips: ['light'], known: ['cure-wounds'], prepared: ['cure-wounds'] };
  const fields = casterTemplateFields({ class: 'cleric', casterLevel: 4, spellbook: book });
  assert.deepEqual(fields, { class: 'cleric', casterLevel: 4, spellbook: book });
  assert.ok(!('resources' in fields));
  assert.deepEqual(casterTemplateFields({ class: 'fighter' }), {});
});

test('createCreature with a caster class stamps slots and a spellbook', () => {
  const enc = createCreature('e1', 'Acolyte', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { WIS: 14 },
    level: 3,
    class: 'cleric',
  });
  assert.equal(enc.casterLevel, 3);
  assert.deepEqual(enc.spellbook, { cantrips: [], known: [], prepared: [] });
  assert.equal(slot(enc, 1).max, 4);
});

test('a creature caster round-trips through a bestiary template', () => {
  const enc = createCreature('e1', 'Acolyte', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { WIS: 14 },
    level: 3,
    class: 'cleric',
  });
  enc.spellbook = { cantrips: ['light'], known: ['cure-wounds'], prepared: ['cure-wounds'] };
  const tmpl = toTemplate('t1', enc);
  assert.equal(tmpl.class, 'cleric');
  assert.deepEqual(tmpl.spellbook.prepared, ['cure-wounds']);
  assert.ok(!('resources' in tmpl), 'templates carry no slot pools');
  const spawned = fromTemplate(tmpl, 'e2');
  assert.equal(spawned.class, 'cleric');
  assert.equal(slot(spawned, 1).max, 4, 'slots rebuilt on spawn');
  assert.deepEqual(spawned.spellbook.prepared, ['cure-wounds']);
});

test('editCreature rebuilds slots on a caster-level change and clears them when dropped', () => {
  const enc = createCreature('e1', 'Acolyte', {
    disposition: 'hostile',
    maxHP: 20,
    stats: { WIS: 14 },
    level: 3,
    class: 'cleric',
  });
  const leveled = editCreature(enc, {
    name: 'Acolyte',
    disposition: 'hostile',
    maxHP: 20,
    level: 3,
    tier: 'mob',
    location: null,
    class: 'cleric',
    casterLevel: 5,
  });
  assert.equal(slot(leveled, 3).max, 2, 'level-5 full caster gains 3rd-level slots');
  const dropped = editCreature(leveled, {
    name: 'Acolyte',
    disposition: 'hostile',
    maxHP: 20,
    level: 3,
    tier: 'mob',
    location: null,
    class: 'fighter',
  });
  assert.equal(getSlotPools(dropped).length, 0, 'non-caster class sheds slot pools');
  assert.equal(dropped.casterLevel, undefined);
  assert.equal(dropped.class, 'fighter', 'the new non-caster class is applied');
});

test('an unleveled creature with a caster class builds slots at caster level', () => {
  const npc = createCreature('n1', 'Hedge Witch', {
    class: 'druid',
    casterLevel: 4,
    stats: { WIS: 15 },
  });
  assert.equal(npc.casterLevel, 4);
  assert.equal(slot(npc, 2).max, 3);
  assert.deepEqual(npc.spellbook, { cantrips: [], known: [], prepared: [] });
});

test('toCaster carries the exhaustion level, so a tired caster attacks worse', () => {
  const creature = {
    id: 'n1',
    name: 'Tired cultist',
    class: 'warlock',
    casterLevel: 3,
    statBlock: { CHA: 16 },
    exhaustion: 2,
  };
  assert.equal(toCaster(creature).exhaustion, 2);
  assert.equal(spellAttackBonus(toCaster(creature)), 2 + 3 - 4);
  assert.equal(toCaster({ id: 'x', name: 'Blank' }).exhaustion, undefined);
});

test('casterSummary states class, spell numbers, and remaining slots', () => {
  const fanatic = createCreature('f1', 'Cult Fanatic', {
    disposition: 'hostile',
    maxHP: 33,
    class: 'cleric',
    casterLevel: 4,
    cr: 2,
    stats: { WIS: 13 },
  });
  assert.equal(
    casterSummary(fanatic),
    'Cleric 4 | Spell DC 11, spell attack +3 | Slots L1 4/4, L2 3/3',
  );
  const spent = {
    ...fanatic,
    resources: fanatic.resources.map((pool) =>
      pool.id === 'slots-2' ? { ...pool, current: 1 } : pool,
    ),
  };
  assert.match(casterSummary(spent), /L2 1\/3/, 'a spent slot shows current over max');
  const brute = createCreature('b1', 'Brute', { disposition: 'hostile', maxHP: 20 });
  assert.equal(casterSummary(brute), '');
  const mute = { ...fanatic, stats: {} };
  assert.equal(
    casterSummary(mute),
    'Cleric 4 | Slots L1 4/4, L2 3/3',
    'a caster without its ability score omits the DC clause',
  );
});

test('a rated creature casts with the rating-ladder proficiency', () => {
  const mage = {
    id: 'm1',
    name: 'Mage',
    class: 'wizard',
    casterLevel: 9,
    cr: 6,
    stats: { INT: 17 },
  };
  // CR 6 gives prof +3 where caster level 9 would give +4.
  assert.equal(toCaster(mage).proficiency, 3);
  assert.equal(spellSaveDC(toCaster(mage)), 14);
  assert.equal(spellAttackBonus(toCaster(mage)), 6);
  const unrated = toCaster({ ...mage, cr: undefined });
  assert.equal(unrated.proficiency, undefined);
  assert.equal(spellSaveDC(unrated), 15, 'an unrated caster keeps the level ladder');
});
