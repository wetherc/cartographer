import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableFeats,
  abilityPool,
  choicePool,
  buildStamp,
  featRiders,
  riderSources,
} from '../src/entities/FeatChoices.js';
import { takeFeat } from '../src/entities/LevelUp.js';
import { savingThrow, abilityCheck } from '../src/entities/Checks.js';
import { createCharacter } from '../src/entities/Character.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';

function fighter(level = 4) {
  return {
    ...createCharacter('c1', 'Bron', { STR: 16 }),
    classes: [{ classId: 'fighter', level }],
    level,
  };
}

test('availableFeats drops a taken feat by id or by hand-typed name', () => {
  const skilled = /** @type {NonNullable<unknown>} */ (
    DEFAULT_FEATS.find((f) => f.id === 'skilled')
  );
  const byStamp = takeFeat(fighter(), { name: 'Actor', featId: 'actor' });
  assert.equal(
    availableFeats(byStamp, DEFAULT_FEATS).some((f) => f.id === 'actor'),
    false,
  );
  const byName = takeFeat(fighter(), '  lucky ');
  assert.equal(
    availableFeats(byName, DEFAULT_FEATS).some((f) => f.id === 'lucky'),
    false,
    'a hand-typed name blocks the catalog entry it matches',
  );
  const repeat = takeFeat(fighter(6), buildStamp(/** @type {any} */ (skilled), {}));
  assert.equal(
    availableFeats(repeat, DEFAULT_FEATS).some((f) => f.id === 'skilled'),
    true,
    'a repeatable feat stays on offer',
  );
});

test('abilityPool narrows to the effect list and drops capped scores', () => {
  const c = { ...fighter(), stats: { STR: 20, DEX: 14 } };
  assert.deepEqual(abilityPool(c, { abilities: ['STR', 'DEX'] }), ['DEX']);
  assert.deepEqual(
    abilityPool(c, { abilities: [] }),
    ['DEX', 'CON', 'INT', 'WIS', 'CHA'],
    'an empty list means any ability below the cap',
  );
});

test('choicePool offers the from list or the vocabulary, minus what is held', () => {
  assert.deepEqual(choicePool({ choose: 1, from: ['stealth', 'arcana'] }, ['x'], ['arcana']), [
    'stealth',
  ]);
  const anySkill = choicePool({ choose: 3, from: [] }, ['a', 'b', 'c'], ['b']);
  assert.deepEqual(anySkill, ['a', 'c']);
});

test('buildStamp folds picks and fixed grants into one FeatStamp', () => {
  /** @type {import('../src/types/feat.js').Feat} */
  const feat = {
    id: 'homebrew',
    name: 'Homebrew',
    description: '',
    effects: [
      { kind: 'asi', abilities: [] },
      { kind: 'asi', abilities: [] },
      {
        kind: 'proficiency',
        skills: { choose: 1, from: [] },
        armor: ['light'],
        tools: ['herbalism kit'],
        languages: ['Elvish'],
      },
      { kind: 'rider', rider: { rolls: ['save'], flat: 1 } },
    ],
  };
  const stamp = buildStamp(feat, {
    abilities: ['CON', 'CON'],
    skills: ['stealth'],
    expertise: ['stealth'],
  });
  assert.deepEqual(stamp, {
    name: 'Homebrew',
    featId: 'homebrew',
    increases: { CON: 2 },
    granted: {
      skills: ['stealth'],
      saves: [],
      expertise: ['stealth'],
      armor: ['light'],
      tools: ['herbalism kit'],
      languages: ['Elvish'],
    },
    rider: { rolls: ['save'], flat: 1 },
  });
});

test('buildStamp with no picks and no modeled effects is a bare stamp', () => {
  /** @type {import('../src/types/feat.js').Feat} */
  const feat = { id: 'lucky', name: 'Lucky', description: '', effects: [] };
  assert.deepEqual(buildStamp(feat, {}), {
    name: 'Lucky',
    featId: 'lucky',
    granted: { skills: [], saves: [], expertise: [], armor: [], tools: [], languages: [] },
  });
});

test('featRiders reads the stamped riders and riderSources joins the chips', () => {
  const taken = takeFeat(fighter(), {
    name: 'Iron Will',
    rider: { rolls: ['save'], flat: 1 },
  });
  assert.deepEqual(featRiders(taken), [{ name: 'Iron Will', rider: { rolls: ['save'], flat: 1 } }]);
  const chipped = { ...taken, conditions: [{ name: 'Blessed', rounds: null }] };
  assert.deepEqual(
    riderSources(chipped).map((s) => s.name),
    ['Blessed', 'Iron Will'],
  );
  assert.deepEqual(featRiders(fighter()), []);
  const creature = { id: 'w1', name: 'Wolf', conditions: [{ name: 'Bane', rounds: 2 }] };
  assert.deepEqual(
    riderSources(/** @type {any} */ (creature)).map((s) => s.name),
    ['Bane'],
    'a creature contributes its chips alone',
  );
});

test('a stamped feat rider joins a saving throw and names itself in the note', () => {
  const taken = takeFeat(fighter(), {
    name: 'Iron Will',
    rider: { rolls: ['save'], flat: 2 },
  });
  const rigged = () => 0.5; // d20 face 11
  const result = savingThrow(taken, 'WIS', 12, { rng: rigged });
  assert.equal(result.total, 13, 'd20 11 plus the +2 feat rider');
  assert.match(result.rider?.note ?? '', /Iron Will \+2/);
  const check = abilityCheck(taken, 'WIS', null, { rng: rigged });
  assert.equal(check.rider, null, 'a save-only rider stays off a check');
});
