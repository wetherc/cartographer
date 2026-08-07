import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableFeats,
  abilityPool,
  choicePool,
  buildStamp,
} from '../src/entities/FeatChoices.js';
import { takeFeat } from '../src/entities/LevelUp.js';
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
