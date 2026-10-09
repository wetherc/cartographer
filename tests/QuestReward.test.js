import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readReward } from '../src/quest/QuestReward.js';

test('readReward keeps whole positive counts and reads any other per as each', () => {
  assert.deepEqual(readReward({ gp: '50', xp: 12.8, per: 'total' }), {
    gp: 50,
    xp: 12,
    per: 'total',
  });
  assert.deepEqual(readReward({ gp: 5, xp: -3, per: 'party' }), { gp: 5, xp: 0, per: 'each' });
});

test('readReward gives undefined for a reward that pays nothing or is not a record', () => {
  assert.equal(readReward({ gp: 0, xp: 'x' }), undefined);
  assert.equal(readReward(null), undefined);
  assert.equal(readReward('50 gp'), undefined);
});

test('payReward pays each living character and skips the dead', async () => {
  const { payReward } = await import('../src/quest/QuestReward.js');
  const { createCharacter } = await import('../src/entities/Character.js');
  const hero = createCharacter('hero', 'Hero');
  const sage = createCharacter('sage', 'Sage');
  const dead = { ...createCharacter('dead', 'Dead'), deathSaves: { successes: 0, failures: 3 } };
  const each = payReward([hero, sage, dead], { gp: 50, xp: 300, per: 'each' });
  assert.deepEqual([each.gp, each.xp, each.count], [50, 300, 2]);
  assert.equal(each.characters[0].xp, 300);
  assert.equal(each.characters[1].purse?.gp, 50);
  assert.equal(each.characters[2], dead);
  const split = payReward([hero, sage, dead], { gp: 25, xp: 0, per: 'total' });
  assert.deepEqual([split.gp, split.xp], [12, 0]);
  assert.equal(split.characters[0].xp, 0);
  const tiny = payReward([hero, sage], { gp: 1, xp: 0, per: 'total' });
  assert.equal(tiny.characters[0], hero, 'a share that rounds to nothing pays nothing');
  assert.deepEqual(payReward([dead], { gp: 5, xp: 5, per: 'each' }).count, 0);
  const xpOnly = payReward([hero], { gp: 0, xp: 10, per: 'each' });
  assert.equal(xpOnly.characters[0].purse, hero.purse);
});

test('rewardLine names what each character got, or gives null', async () => {
  const { rewardLine } = await import('../src/quest/QuestReward.js');
  assert.equal(rewardLine(50, 300), 'The party receives 50 gp and 300 XP each.');
  assert.equal(rewardLine(0, 300), 'The party receives 300 XP each.');
  assert.equal(rewardLine(0, 0), null);
});

test('an XP-only total split among the living leaves the dead out of the count', async () => {
  // The party Award XP dialog pays through payReward with no gold.
  const { payReward } = await import('../src/quest/QuestReward.js');
  const { createCharacter } = await import('../src/entities/Character.js');
  const hero = createCharacter('hero', 'Hero');
  const sage = createCharacter('sage', 'Sage');
  const dead = { ...createCharacter('dead', 'Dead'), deathSaves: { successes: 0, failures: 3 } };
  const paid = payReward([hero, sage, dead], { gp: 0, xp: 300, per: 'total' });
  assert.deepEqual([paid.xp, paid.count], [150, 2]);
  assert.deepEqual(
    paid.characters.map((c) => c.xp),
    [150, 150, 0],
  );
  assert.equal(paid.characters[2], dead);
});
