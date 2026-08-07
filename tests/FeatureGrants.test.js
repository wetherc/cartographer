import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featureKey,
  getFeatureChoices,
  pendingFeatureGrants,
  buildFeatureStamp,
  applyFeatureGrant,
  undoFeatureGrant,
  featureRiders,
} from '../src/entities/FeatureGrants.js';
import { riderSources } from '../src/entities/FeatChoices.js';
import { withProficiencies, withExpertise } from '../src/entities/Proficiencies.js';
import { createCharacter } from '../src/entities/Character.js';

/** @param {{ classId: string, level: number }[]} classes */
function classed(classes) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  return { ...createCharacter('c1', 'Bron', { DEX: 16 }), classes, level };
}

/** @param {number} level @param {string[]} [skills] */
function rogue(level, skills = ['stealth', 'perception', 'acrobatics']) {
  return withProficiencies(classed([{ classId: 'rogue', level }]), { skills });
}

/** The one pending grant a level-1 Rogue has. */
function pendingExpertise(character) {
  const [grant] = pendingFeatureGrants(character);
  assert.ok(grant, 'a pending grant exists');
  return grant;
}

test('pendingFeatureGrants lists unclaimed structured features in unlock order', () => {
  assert.deepEqual(
    pendingFeatureGrants(rogue(6)).map((f) => featureKey(f)),
    ['rogue 1 Expertise', 'rogue 6 Expertise'],
  );
  assert.deepEqual(pendingFeatureGrants(classed([{ classId: 'fighter', level: 5 }])), []);
  assert.deepEqual(pendingFeatureGrants(createCharacter('c1', 'Nim')), []);
});

test('a claimed grant leaves pending and the same feature in another class stays', () => {
  const c = withProficiencies(
    classed([
      { classId: 'rogue', level: 1 },
      { classId: 'bard', level: 3 },
    ]),
    { skills: ['stealth', 'perception'] },
  );
  const stamp = buildFeatureStamp(pendingExpertise(c), { expertise: ['stealth'] });
  const claimed = applyFeatureGrant(c, stamp);
  assert.deepEqual(
    pendingFeatureGrants(claimed).map((f) => featureKey(f)),
    ['bard 3 Expertise'],
  );
});

test('buildFeatureStamp carries picks, fixed grants, and the rider', () => {
  const feature = {
    classId: 'rogue',
    classLevel: 1,
    name: 'Testing Ground',
    effects: [
      {
        kind: /** @type {const} */ ('proficiency'),
        skills: { choose: 1, from: [] },
        tools: ["thieves' tools"],
      },
      { kind: /** @type {const} */ ('rider'), rider: { rolls: ['attack'], flat: 1 } },
    ],
  };
  assert.deepEqual(buildFeatureStamp(feature, { skills: ['stealth'] }), {
    classId: 'rogue',
    classLevel: 1,
    name: 'Testing Ground',
    granted: {
      skills: ['stealth'],
      saves: [],
      expertise: [],
      armor: [],
      tools: ["thieves' tools"],
      languages: [],
    },
    rider: { rolls: ['attack'], flat: 1 },
  });
});

test('applyFeatureGrant stamps only what the merge added', () => {
  const c = withExpertise(rogue(1), ['stealth']);
  const stamp = buildFeatureStamp(pendingExpertise(c), { expertise: ['stealth', 'perception'] });
  const claimed = applyFeatureGrant(c, stamp);
  assert.deepEqual(claimed.proficiencies?.expertise, ['stealth', 'perception']);
  const choice = getFeatureChoices(claimed)['rogue 1 Expertise'];
  assert.deepEqual(
    choice.granted,
    { expertise: ['perception'] },
    'the GM-set stealth expertise is not part of the stamp',
  );
});

test('an expertise pick outside the proficient skills prunes and never stamps', () => {
  const c = rogue(1, ['stealth']);
  const stamp = buildFeatureStamp(pendingExpertise(c), { expertise: ['stealth', 'arcana'] });
  const claimed = applyFeatureGrant(c, stamp);
  assert.deepEqual(claimed.proficiencies?.expertise, ['stealth']);
  assert.deepEqual(getFeatureChoices(claimed)['rogue 1 Expertise'].granted, {
    expertise: ['stealth'],
  });
});

test('applyFeatureGrant refuses a grant that is not pending', () => {
  const c = rogue(1);
  const unknown = { classId: 'rogue', classLevel: 3, name: 'Nonesuch', granted: {} };
  assert.equal(applyFeatureGrant(c, unknown), c);
  const stamp = buildFeatureStamp(pendingExpertise(c), { expertise: ['stealth'] });
  const claimed = applyFeatureGrant(c, stamp);
  assert.equal(applyFeatureGrant(claimed, stamp), claimed, 'a second claim is a no-op');
});

test('undoFeatureGrant removes exactly the stamp and reopens the grant', () => {
  const c = withExpertise(rogue(1), ['stealth']);
  const stamp = buildFeatureStamp(pendingExpertise(c), { expertise: ['stealth', 'perception'] });
  const claimed = applyFeatureGrant(c, stamp);
  const undone = undoFeatureGrant(claimed, 'rogue 1 Expertise');
  assert.deepEqual(undone.proficiencies?.expertise, ['stealth'], 'the GM grant survives');
  assert.deepEqual(getFeatureChoices(undone), {});
  assert.equal(pendingFeatureGrants(undone).length, 1);
  assert.equal(undoFeatureGrant(c, 'rogue 1 Expertise'), c, 'an unknown key is a no-op');
});

test('a feature rider reaches riderSources beside chips and feat riders', () => {
  const c = rogue(1);
  const stamp = {
    classId: 'rogue',
    classLevel: 1,
    name: 'Expertise',
    granted: { expertise: ['stealth'] },
    rider: { rolls: ['check'], flat: 1 },
  };
  const claimed = applyFeatureGrant(c, stamp);
  assert.deepEqual(featureRiders(claimed), [
    { name: 'Expertise', rider: { rolls: ['check'], flat: 1 } },
  ]);
  assert.deepEqual(riderSources(claimed), [
    { name: 'Expertise', rider: { rolls: ['check'], flat: 1 } },
  ]);
  assert.deepEqual(featureRiders(c), []);
});
