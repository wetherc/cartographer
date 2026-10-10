import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityRaises, applyRaises } from '../src/entities/AbilityRaises.js';
import { effectiveStats } from '../src/entities/Equipment.js';
import { needsGrant, pendingFeatureGrants } from '../src/entities/FeatureGrants.js';
import { createCharacter } from '../src/entities/Character.js';

/** @param {number} level @param {Record<string, number>} stats */
function barbarian(level, stats) {
  return {
    ...createCharacter('b', 'Grog', stats),
    classes: [{ classId: 'barbarian', level, subclass: 'berserker' }],
    level,
  };
}

test('Primal Champion raises STR and CON by 4 at barbarian 20, up to 24', () => {
  assert.deepEqual(abilityRaises(barbarian(19, {})), []);
  const champion = barbarian(20, { STR: 18, CON: 22, DEX: 14 });
  const stats = effectiveStats(champion);
  assert.equal(stats.STR, 22);
  assert.equal(stats.CON, 24, 'the cap of 24 stops the raise');
  assert.equal(stats.DEX, 14);
  assert.equal(champion.stats.STR, 18, 'the base score is unchanged');
  assert.equal(effectiveStats(barbarian(19, { STR: 18 })).STR, 18);
});

test('applyRaises never lowers a score above the cap, and reads a missing score as 10', () => {
  const raise = { kind: 'abilityRaise', abilities: ['STR', 'CON'], amount: 4, cap: 24 };
  assert.deepEqual(applyRaises({ STR: 26 }, [/** @type {any} */ (raise)]), { STR: 26, CON: 14 });
});

test('abilityRaises skips an unknown class and reads a legacy single class', () => {
  assert.deepEqual(
    abilityRaises(/** @type {any} */ ({ classes: [{ classId: 'x', level: 20 }] })),
    [],
  );
  assert.equal(abilityRaises(/** @type {any} */ ({ class: 'barbarian', level: 20 })).length, 1);
  const cleric = { classes: [{ classId: 'cleric', level: 20, subclass: 'life' }] };
  assert.deepEqual(abilityRaises(/** @type {any} */ (cleric)), [], 'subclass features raise none');
  assert.equal(
    abilityRaises(/** @type {any} */ ({ classes: [{ classId: 'barbarian', level: NaN }] })).length,
    0,
    'a malformed level reads as 1',
  );
});

test('a feature with only an ability raise is never a pending grant', () => {
  assert.equal(
    needsGrant({ effects: [{ kind: 'abilityRaise', abilities: [], amount: 1, cap: 20 }] }),
    false,
  );
  assert.equal(needsGrant({}), false);
  assert.deepEqual(pendingFeatureGrants(barbarian(20, {})), []);
});
