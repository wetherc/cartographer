import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMaxHP, vitalsFields, applyVitals } from '../src/app/characterEdit.js';
import {
  createCharacter,
  withHP,
  getHP,
  setMaxHP,
  clearMaxHPOverride,
} from '../src/entities/Character.js';
import { classMaxHP, withHitDice } from '../src/entities/HitDice.js';
import { withClasses } from '../src/entities/Progression.js';

/** A level-1 fighter with CON 14 (12 HP), at XP for level 2. */
function fighter() {
  const base = {
    ...createCharacter('c1', 'Bron', { CON: 14 }),
    classes: [{ classId: 'fighter', level: 1 }],
    level: 2,
  };
  return withHitDice(withHP(base, classMaxHP(base) ?? 10));
}

/** @param {Record<string, string>} over */
function values(over = {}) {
  return { maxHP: '12', bonusHP: '0', baseAC: '10', ...over };
}

test('saving the dialog with the shown maximum leaves HP on the class rule', () => {
  const edited = applyVitals(fighter(), values({ baseAC: '13' }));
  assert.equal(edited.hpOverride, undefined);
  assert.equal(edited.baseAC, 13);
  const levelled = withClasses(edited, [{ classId: 'fighter', level: 2 }]);
  assert.equal(getHP(levelled)?.max, 20, 'a level-up still grows the maximum');
});

test('a typed maximum that differs sets the override', () => {
  const edited = applyVitals(fighter(), values({ maxHP: '30' }));
  assert.equal(edited.hpOverride, true);
  assert.equal(getHP(edited)?.max, 30);
});

test('the typed maximum leaves out a chip raise and keeps it on top', () => {
  const aided = { ...setMaxHP(fighter(), 17), hpOverride: undefined, hpBoost: 5 };
  assert.equal(baseMaxHP(aided), 12);
  assert.equal(vitalsFields(aided)[0].value, 12);
  assert.equal(applyVitals(aided, values()).hpOverride, undefined, 'the shown 12 pins nothing');
  assert.equal(getHP(applyVitals(aided, values({ maxHP: '20' })))?.max, 25);
});

test('a maximum that moved in another tab is not read as a typed change', () => {
  const live = withClasses(fighter(), [{ classId: 'fighter', level: 2 }]);
  const edited = applyVitals(live, values(), 12);
  assert.equal(edited.hpOverride, undefined);
  assert.equal(getHP(edited)?.max, 20);
});

test('Use class HP appears only with an override, and clears it', () => {
  assert.equal(
    vitalsFields(fighter()).some((f) => f.name === 'useClassHP'),
    false,
  );
  const pinned = setMaxHP(fighter(), 30);
  const box = vitalsFields(pinned).find((f) => f.name === 'useClassHP');
  assert.equal(box?.label, 'Use class HP (12)');
  const freed = applyVitals(pinned, values({ maxHP: '30', useClassHP: '1' }));
  assert.equal(freed.hpOverride, undefined);
  assert.equal(getHP(freed)?.max, 12);
});

test('a character with no HP pool gets the AC field alone', () => {
  const bare = createCharacter('c2', 'Ash', {});
  const fields = vitalsFields(bare);
  assert.deepEqual(
    fields.map((f) => f.name),
    ['baseAC'],
  );
  assert.equal(baseMaxHP(bare), null);
  assert.equal(applyVitals(bare, { baseAC: '12' }).baseAC, 12);
});

test('bonus HP changes only when the typed amount differs', () => {
  const granted = { ...fighter(), bonusHP: 5, bonusHPFrom: 'false-life' };
  assert.equal(applyVitals(granted, values({ bonusHP: '5' })).bonusHPFrom, 'false-life');
  const typed = applyVitals(granted, values({ bonusHP: '3' }));
  assert.equal(typed.bonusHP, 3);
  assert.equal(typed.bonusHPFrom, undefined);
});

test('clearMaxHPOverride returns a character without the flag unchanged', () => {
  const plain = fighter();
  assert.equal(clearMaxHPOverride(plain), plain);
});
