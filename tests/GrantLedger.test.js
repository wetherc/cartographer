import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRANT_KEYS,
  compactGrants,
  grantRecords,
  mergeGrants,
  rebuildGrants,
  requestedGrants,
} from '../src/entities/GrantLedger.js';
import { takeFeat, undoLastChoice, listASIChoices } from '../src/entities/LevelUp.js';
import {
  applyFeatureGrant,
  buildFeatureStamp,
  pendingFeatureGrants,
  undoFeatureGrant,
} from '../src/entities/FeatureGrants.js';
import { createCharacter } from '../src/entities/Character.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';

/** A rogue with two feat slots, so two feats and one Expertise can land. */
function rogue(skills = ['stealth', 'perception']) {
  const c = {
    ...createCharacter('c1', 'Nyx', { DEX: 16 }),
    classes: [{ classId: 'rogue', level: 8 }],
  };
  return withProficiencies({ ...c, level: 8 }, { skills });
}

function fighter(level = 8) {
  return {
    ...createCharacter('c2', 'Bron', { STR: 16 }),
    classes: [{ classId: 'fighter', level }],
    level,
  };
}

test('compactGrants drops empty lists and reads null for no grants', () => {
  const empty = Object.fromEntries(GRANT_KEYS.map((key) => [key, []]));
  assert.equal(compactGrants(/** @type {any} */ (empty)), null);
  assert.deepEqual(compactGrants({ ...empty, skills: ['athletics'], tools: ['dice'] }), {
    skills: ['athletics'],
    tools: ['dice'],
  });
});

test('mergeGrants joins several requests and prunes expertise without its skill', () => {
  const before = requestedGrants({ skills: ['stealth'] });
  const merged = mergeGrants({ ...before, weapons: { categories: [], named: [] } }, [
    requestedGrants({ skills: ['athletics'], expertise: ['athletics', 'arcana'] }),
    requestedGrants({ saves: ['DEX'] }),
  ]);
  assert.deepEqual(merged.skills, ['stealth', 'athletics']);
  assert.deepEqual(merged.expertise, ['athletics']);
  assert.deepEqual(merged.saves, ['DEX']);
});

test('grantRecords lists feats and claimed features, not ability increases', () => {
  const c = {
    ...fighter(),
    asiChoices: {
      'fighter 4': {
        classId: 'fighter',
        classLevel: 4,
        order: 0,
        type: 'asi',
        increases: { STR: 2 },
      },
      'fighter 6': { classId: 'fighter', classLevel: 6, order: 1, type: 'feat', feat: 'Alert' },
    },
    featureChoices: {
      'rogue 1 Expertise': { classId: 'rogue', classLevel: 1, name: 'Expertise', order: 0 },
    },
  };
  const records = grantRecords(/** @type {any} */ (c));
  assert.equal(records.length, 2);
  assert.equal(records[0], c.asiChoices['fighter 6'], 'records come back by reference');
  assert.equal(records[1], c.featureChoices['rogue 1 Expertise']);
  assert.deepEqual(grantRecords(fighter()), []);
});

test('undoing a feat keeps a proficiency that a later feat also asked for', () => {
  const first = takeFeat(fighter(), { name: 'Skilled', granted: { skills: ['athletics'] } });
  const second = takeFeat(first, {
    name: 'Athlete',
    granted: { skills: ['athletics'], saves: ['DEX'] },
  });
  const [skilled, athlete] = listASIChoices(second);
  assert.deepEqual(skilled.granted, { skills: ['athletics'] });
  assert.deepEqual(athlete.granted, { saves: ['DEX'] }, 'the second feat added only the save');
  assert.deepEqual(athlete.requested, { skills: ['athletics'], saves: ['DEX'] });

  // Undo the first feat while the second still holds athletics. The second
  // record is stamped again as the one that now grants the skill.
  const withoutFirst = rebuildGrants(second, skilled);
  assert.deepEqual(withoutFirst.proficiencies?.skills, ['athletics']);
  assert.deepEqual(withoutFirst.proficiencies?.saves, ['DEX']);
  const [restamped] = listASIChoices(withoutFirst);
  assert.deepEqual(restamped.granted, { skills: ['athletics'], saves: ['DEX'] });
  assert.equal(withoutFirst.featureChoices, undefined, 'a map the character lacked stays absent');

  // Undo both in order: the skill leaves with the last record that asked for it.
  const undoneSecond = undoLastChoice(second);
  assert.deepEqual(undoneSecond.proficiencies?.skills, ['athletics']);
  assert.deepEqual(undoneSecond.proficiencies?.saves, []);
  const undoneBoth = undoLastChoice(undoneSecond);
  assert.deepEqual(undoneBoth.proficiencies?.skills, []);
});

test('undoing a feat keeps an expertise a class feature also picked', () => {
  const feated = takeFeat(rogue(), { name: 'Skill Expert', granted: { expertise: ['stealth'] } });
  const [pending] = pendingFeatureGrants(feated);
  const claimed = applyFeatureGrant(
    feated,
    buildFeatureStamp(pending, { expertise: ['stealth', 'perception'] }),
  );
  assert.deepEqual(claimed.featureChoices?.['rogue 1 Expertise'].granted, {
    expertise: ['perception'],
  });
  assert.deepEqual(claimed.featureChoices?.['rogue 1 Expertise'].requested, {
    expertise: ['stealth', 'perception'],
  });

  const undoneFeat = undoLastChoice(claimed);
  assert.deepEqual(
    undoneFeat.proficiencies?.expertise,
    ['stealth', 'perception'],
    'the feature holds stealth',
  );
  const undoneBoth = undoFeatureGrant(undoneFeat, 'rogue 1 Expertise');
  assert.deepEqual(undoneBoth.proficiencies?.expertise, []);
});

test('undoing a feature keeps an expertise a feat also picked', () => {
  const [pending] = pendingFeatureGrants(rogue());
  const claimed = applyFeatureGrant(
    rogue(),
    buildFeatureStamp(pending, { expertise: ['stealth'] }),
  );
  const feated = takeFeat(claimed, { name: 'Skill Expert', granted: { expertise: ['stealth'] } });
  assert.equal(listASIChoices(feated)[0].granted, undefined, 'the feat added nothing');
  const undone = undoFeatureGrant(feated, 'rogue 1 Expertise');
  assert.deepEqual(undone.proficiencies?.expertise, ['stealth']);
});

test('a proficiency the class gave survives every undo', () => {
  const c = rogue(['stealth']);
  const feated = takeFeat(c, { name: 'Skilled', granted: { skills: ['stealth', 'athletics'] } });
  assert.deepEqual(listASIChoices(feated)[0].granted, { skills: ['athletics'] });
  const undone = undoLastChoice(feated);
  assert.deepEqual(undone.proficiencies?.skills, ['stealth']);
});

test('a record without a requested list reads its granted list as the request and keeps it', () => {
  const base = withProficiencies(fighter(), { skills: ['athletics', 'stealth'] });
  const c = {
    ...base,
    asiChoices: {
      'fighter 4': {
        classId: 'fighter',
        classLevel: 4,
        order: 0,
        type: 'feat',
        feat: 'Old',
        granted: { skills: ['athletics'] },
      },
      'fighter 6': {
        classId: 'fighter',
        classLevel: 6,
        order: 1,
        type: 'feat',
        feat: 'Older',
        granted: { skills: ['stealth'] },
      },
      'fighter 8': {
        classId: 'fighter',
        classLevel: 8,
        order: 2,
        type: 'asi',
        increases: { STR: 2 },
      },
      'fighter 12': { classId: 'fighter', classLevel: 12, order: 3, type: 'feat', feat: 'Alert' },
    },
  };
  const rebuilt = rebuildGrants(/** @type {any} */ (c), c.asiChoices['fighter 6']);
  assert.deepEqual(rebuilt.proficiencies?.skills, ['athletics']);
  const [kept] = listASIChoices(rebuilt);
  assert.deepEqual(kept.requested, { skills: ['athletics'] }, 'the old diff becomes the request');
  assert.deepEqual(kept.granted, { skills: ['athletics'] });
  const [, asi, plain] = listASIChoices(rebuilt);
  assert.equal(asi, c.asiChoices['fighter 8'], 'an ability increase passes through untouched');
  assert.deepEqual(plain, c.asiChoices['fighter 12'], 'a feat with no grants stays bare');
  assert.equal(Object.keys(rebuilt.asiChoices ?? {}).length, 3);
});

test('undoing a feature that added nothing only drops its record', () => {
  const c = rogue();
  const [pending] = pendingFeatureGrants(c);
  const claimed = applyFeatureGrant(c, buildFeatureStamp(pending, { expertise: ['arcana'] }));
  assert.equal(claimed.featureChoices?.['rogue 1 Expertise'].granted, undefined);
  const undone = undoFeatureGrant(claimed, 'rogue 1 Expertise');
  assert.deepEqual(undone.featureChoices, {});
  assert.equal(undone.proficiencies, claimed.proficiencies, 'the lists are not rebuilt');
});
