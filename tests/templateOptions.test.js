import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateOptions } from '../src/entities/CreatureTemplate.js';

const t = (/** @type {string} */ id, /** @type {string} */ name, disposition = 'hostile') =>
  /** @type {any} */ ({ id, name, maxHP: 7, disposition });
const campaign = [t('w', 'Wolf'), t('b', 'Bandit'), t('s', 'Sage', 'neutral')];
const library = [t('w', 'Dire Wolf'), t('g', 'Goblin'), t('i', 'Innkeeper', 'friendly')];

test('templateOptions groups by disposition, then campaign before library', () => {
  assert.deepEqual(
    templateOptions(campaign, library).map((o) => [o.value, o.group]),
    [
      ['campaign:b', 'Hostile, this campaign'],
      ['campaign:w', 'Hostile, this campaign'],
      ['library:w', 'Hostile, library'],
      ['library:g', 'Hostile, library'],
      ['library:i', 'Friendly, library'],
      ['campaign:s', 'Neutral, this campaign'],
    ],
  );
  assert.equal(templateOptions(campaign, [])[0].label, 'Bandit (7 HP)');
});

test('templateOptions puts the preferred disposition first', () => {
  assert.deepEqual(
    templateOptions(campaign, library, '', 'neutral').map((o) => o.value),
    ['campaign:s', 'library:i', 'campaign:b', 'campaign:w', 'library:w', 'library:g'],
  );
});

test('templateOptions reads a template with no known disposition as hostile', () => {
  const odd = [/** @type {any} */ ({ id: 'x', name: 'Odd', maxHP: 1 })];
  assert.equal(templateOptions(odd, [])[0].group, 'Hostile, this campaign');
});

test('templateOptions keeps names that contain the query, ignoring case', () => {
  assert.deepEqual(
    templateOptions(campaign, library, '  WOLF ').map((o) => o.value),
    ['campaign:w', 'library:w'],
  );
  assert.deepEqual(templateOptions(campaign, library, 'zzz'), []);
});

test('templateOptions does not reorder its inputs', () => {
  templateOptions(campaign, library);
  assert.equal(campaign[0].name, 'Wolf');
});
