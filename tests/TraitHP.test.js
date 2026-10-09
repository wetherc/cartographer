import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withClasses, withRace, takeFeat, undoLastChoice } from '../src/entities/Progression.js';
import { createCharacter, withHP, getHP } from '../src/entities/Character.js';
import { classMaxHP, traitHPBonus, withHitDice } from '../src/entities/HitDice.js';
import { unarmoredDefenses } from '../src/entities/Classes.js';
import { armorClass } from '../src/entities/Armor.js';
import { buildStamp } from '../src/entities/FeatChoices.js';
import { normalizeFeat } from '../src/library/Library.js';
import { featSummary } from '../src/app/librarySummaries.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';

const TOUGH = /** @type {import('../src/types/feat.js').Feat} */ (
  DEFAULT_FEATS.find((f) => f.id === 'tough')
);

/**
 * A character with an HP pool sized to its class list.
 * @param {import('../src/types/class.js').ClassRef[]} classes
 * @param {Record<string, number>} [stats]
 */
function classed(classes, stats = {}) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  const base = { ...createCharacter('c1', 'Bron', { CON: 14, ...stats }), classes, level };
  return withHitDice(withHP(base, classMaxHP(base) ?? 10));
}

test('a Hill Dwarf gains 1 max HP per level from Dwarven Toughness', () => {
  const dwarf = withRace(classed([{ classId: 'fighter', level: 1 }], { CON: 12 }), 'dwarf');
  assert.equal(dwarf.stats.CON, 14);
  assert.equal(getHP(dwarf)?.max, 13, 'd10 + 2 from CON 14, plus 1');
  const third = withRace(classed([{ classId: 'fighter', level: 3 }], { CON: 12 }), 'dwarf');
  assert.equal(getHP(third)?.max, 13 + 2 * 9, 'each later level adds 6 + 2, plus 1');
});

test('a Draconic Bloodline sorcerer gains 1 max HP per sorcerer level', () => {
  const plain = classed([{ classId: 'sorcerer', level: 3 }]);
  const draconic = withClasses(plain, [{ classId: 'sorcerer', level: 3, subclass: 'draconic' }]);
  assert.equal(getHP(plain)?.max, 20);
  assert.equal(getHP(draconic)?.max, 23);
  assert.equal(traitHPBonus(draconic), 3);
});

test('the subclass HP counts only the levels of its own class', () => {
  const multi = classed([
    { classId: 'sorcerer', level: 2, subclass: 'draconic' },
    { classId: 'fighter', level: 3 },
  ]);
  assert.equal(traitHPBonus(multi), 2);
});

test('an unknown class and a malformed feat record add nothing', () => {
  const odd = {
    ...classed([{ classId: 'bogus', level: 2 }]),
    asiChoices: /** @type {any} */ ({ x: { type: 'feat', feat: 'Odd', hpPerLevel: 'lots' } }),
  };
  assert.equal(traitHPBonus(odd), 0);
});

test('a Draconic Bloodline sorcerer has 13 + DEX unarmored AC', () => {
  const sorcerer = classed([{ classId: 'sorcerer', level: 1, subclass: 'draconic' }], { DEX: 14 });
  assert.deepEqual(unarmoredDefenses(sorcerer), [{ base: 13, shield: true }]);
  assert.equal(armorClass(sorcerer), 15);
  assert.equal(armorClass(classed([{ classId: 'sorcerer', level: 1 }], { DEX: 14 })), 12);
});

test('Tough adds 2 max HP per level, now and at later levels, and undo takes it back', () => {
  const fighter = classed([{ classId: 'fighter', level: 4 }]);
  const before = getHP(fighter)?.max ?? 0;
  const tough = takeFeat(fighter, buildStamp(TOUGH, {}));
  assert.equal(tough.hpOverride, undefined);
  assert.equal(getHP(tough)?.max, before + 8);
  const fifth = withClasses({ ...tough, level: 5 }, [{ classId: 'fighter', level: 5 }]);
  assert.equal(getHP(fifth)?.max, before + 8 + 10, 'level 5 adds 6 + 2, and Tough adds 2 more');
  assert.equal(getHP(undoLastChoice(tough))?.max, before);
});

test('buildStamp copies the per-level HP of a feat, and a plain feat has none', () => {
  assert.equal(buildStamp(TOUGH, {}).hpPerLevel, 2);
  const plain = /** @type {import('../src/types/feat.js').Feat} */ (
    DEFAULT_FEATS.find((f) => f.effects.length === 0)
  );
  assert.equal(buildStamp(plain, {}).hpPerLevel, undefined);
});

test('normalizeFeat keeps a per-level HP effect and drops a zero one', () => {
  const kept = normalizeFeat({ name: 'Hardy', effects: [{ kind: 'hp', perLevel: '3' }] }, 'h');
  assert.deepEqual(kept.effects, [{ kind: 'hp', perLevel: 3 }]);
  const dropped = normalizeFeat({ name: 'Soft', effects: [{ kind: 'hp', perLevel: 0 }] }, 's');
  assert.deepEqual(dropped.effects, []);
});

test('featSummary names the per-level HP', () => {
  assert.equal(featSummary(TOUGH), '+2 HP per level');
});
