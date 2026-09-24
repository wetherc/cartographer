import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meetsFeatRequirement,
  featOptions,
  normalizeFeatRequirement,
} from '../src/entities/FeatRequirement.js';
import { emptyProficiencies } from '../src/entities/Proficiencies.js';
import { createCharacter } from '../src/entities/Character.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';
import { normalizeFeat } from '../src/library/Library.js';

/** @param {string} id */
const feat = (id) => /** @type {any} */ (DEFAULT_FEATS.find((f) => f.id === id));

/** A STR 8 Wizard 4 with a spellbook and no armor training. */
const wizard = /** @type {any} */ ({
  ...createCharacter('w', 'Ilse', { STR: 8, INT: 16 }),
  classes: [{ classId: 'wizard', level: 4 }],
  spellbook: { cantrips: [], known: [], prepared: [] },
});

/** A STR 16 Fighter 4 trained in light and medium armor. */
const fighter = /** @type {any} */ ({
  ...createCharacter('f', 'Bron', { STR: 16 }),
  classes: [{ classId: 'fighter', level: 4 }],
  proficiencies: { ...emptyProficiencies(), armor: ['light', 'medium'] },
});

test('meetsFeatRequirement checks scores, armor, and spellcasting', () => {
  assert.equal(meetsFeatRequirement(wizard, feat('grappler')), false, 'STR 8 is under 13');
  assert.equal(meetsFeatRequirement(fighter, feat('grappler')), true);
  assert.equal(meetsFeatRequirement(wizard, feat('heavily-armored')), false);
  assert.equal(meetsFeatRequirement(fighter, feat('heavily-armored')), true);
  assert.equal(meetsFeatRequirement(fighter, feat('war-caster')), false);
  assert.equal(meetsFeatRequirement(wizard, feat('war-caster')), true);
  assert.equal(meetsFeatRequirement(wizard, feat('lucky')), true, 'no requirement is open');
  // A character with no stats reads as the neutral 10.
  const blank = /** @type {any} */ ({ ...wizard, stats: undefined });
  assert.equal(
    meetsFeatRequirement(blank, { ...feat('grappler'), requires: { abilities: { STR: 10 } } }),
    true,
  );
});

test('featOptions lists unmet feats last, disabled, with what they need', () => {
  const options = featOptions(wizard, [feat('grappler'), feat('lucky'), feat('war-caster')]);
  assert.deepEqual(options, [
    { value: 'lucky', label: 'Lucky' },
    { value: 'war-caster', label: 'War Caster (The ability to cast at least one spell)' },
    { value: 'grappler', label: 'Grappler: requires strength 13 or higher', disabled: true },
  ]);
  const unlabeled = featOptions(wizard, [{ ...feat('grappler'), prerequisite: undefined }]);
  assert.equal(unlabeled[0].label, 'Grappler: requires a requirement this character lacks');
});

test('normalizeFeatRequirement keeps valid parts and drops the rest', () => {
  assert.deepEqual(
    normalizeFeatRequirement({
      abilities: { str: 13, dex: 1.5, luck: 12, cha: 40 },
      armor: 'medium',
      spellcasting: true,
    }),
    { abilities: { STR: 13 }, armor: 'medium', spellcasting: true },
  );
  assert.deepEqual(normalizeFeatRequirement({ armor: 'mithral', spellcasting: 'yes' }), undefined);
  assert.equal(normalizeFeatRequirement({ abilities: 'STR 13' }), undefined);
  assert.equal(normalizeFeatRequirement(null), undefined);
  assert.equal(normalizeFeatRequirement('STR 13'), undefined);
});

test('a library feat keeps its checked requirement through normalizeFeat', () => {
  const kept = normalizeFeat({ ...feat('grappler') }, 'grappler');
  assert.deepEqual(kept.requires, { abilities: { STR: 13 } });
  const none = normalizeFeat({ name: 'Plain', effects: [], requires: { armor: 'mithral' } }, 'p');
  assert.equal('requires' in none, false);
});
