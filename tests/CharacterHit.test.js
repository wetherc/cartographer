import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healCharacter, hitCharacter } from '../src/entities/CharacterHit.js';
import { createCharacter, getHP, setBonusHP, withHP } from '../src/entities/Character.js';
import { isDead, isDying, killOutright, stabilize } from '../src/entities/DeathSaves.js';
import { begin as beginConcentration } from '../src/entities/Concentration.js';

const hero = () => withHP(createCharacter('hero', 'Hero'), 12);
const HOLD = /** @type {any} */ ({
  id: 'hold-person',
  name: 'Hold Person',
  duration: { kind: 'minutes', amount: 1 },
});
const kinds = (/** @type {{ events: { kind: string }[] }} */ r) => r.events.map((e) => e.kind);

test('a hit that drops a character to 0 HP starts the tracker', () => {
  const result = hitCharacter(hero(), 12);
  assert.deepEqual(kinds(result), ['downed']);
  assert.equal(isDying(result.character), true);
  assert.equal(result.character.deathSaves?.failures, 0);
});

test('damage past 0 HP of at least the HP maximum kills outright', () => {
  // 12 HP and a 24-point hit: 12 left over past 0, equal to the maximum.
  const result = hitCharacter(hero(), 24);
  assert.deepEqual(kinds(result), ['massive']);
  assert.equal(isDead(result.character), true);
  assert.equal(kinds(hitCharacter(hero(), 23)).join(), 'downed', 'one short of it only drops');
});

test('bonus HP soaks damage before the massive damage rule counts it', () => {
  const shielded = setBonusHP(hero(), 5);
  assert.deepEqual(kinds(hitCharacter(shielded, 28)), ['downed']);
  assert.deepEqual(kinds(hitCharacter(shielded, 29)), ['massive']);
});

test('a hit on a character at 0 HP costs failures, or kills when massive', () => {
  const down = hitCharacter(hero(), 12).character;
  const hit = hitCharacter(down, 3);
  assert.deepEqual(hit.events, [{ kind: 'failures', count: 1, dead: false }]);
  const crit = hitCharacter(down, 3, { crit: true });
  assert.deepEqual(crit.events, [{ kind: 'failures', count: 2, dead: false }]);
  const massive = hitCharacter(down, 12);
  assert.deepEqual(kinds(massive), ['massive']);
  assert.equal(isDead(massive.character), true);
  // A stable character starts its saves again.
  const stable = hitCharacter(stabilize(down), 1);
  assert.equal(stable.character.deathSaves?.stable, false);
});

test('a hit on a dead character counts nothing', () => {
  const dead = killOutright(hitCharacter(hero(), 12).character);
  assert.deepEqual(hitCharacter(dead, 50).events, []);
  // Exhaustion kills with HP left, and the hit that then empties it starts nothing.
  const tired = killOutright(hero());
  assert.deepEqual(hitCharacter(tired, 12).events, []);
});

test('a drop to 0 HP ends concentration, and a lighter hit calls for the save', () => {
  const holding = beginConcentration(hero(), HOLD, 2).character;
  const fell = hitCharacter(holding, 12);
  assert.deepEqual(kinds(fell), ['downed', 'fell']);
  assert.equal(fell.character.concentration, null);
  assert.equal(fell.ended, 'hold-person');
  const died = hitCharacter(holding, 24);
  assert.deepEqual(kinds(died), ['massive', 'fell']);
  // A d20 of 20 always holds against DC 10.
  const held = hitCharacter(holding, 2, { rng: () => 0.99 });
  assert.equal(held.events[0].kind, 'concentration');
  assert.equal(/** @type {any} */ (held.events[0]).kept, true);
  assert.equal(held.ended, null);
  // A d20 of 1 drops the spell.
  const lost = hitCharacter(holding, 2, { rng: () => 0 });
  assert.equal(/** @type {any} */ (lost.events[0]).kept, false);
  assert.equal(lost.ended, 'hold-person');
});

test('a character with no HP pool takes the hit with no events', () => {
  const bare = createCharacter('bare', 'Bare');
  assert.deepEqual(hitCharacter(bare, 5), { character: bare, events: [], ended: null });
});

test('a heal above 0 HP revives a dying character and says so', () => {
  const down = hitCharacter(hero(), 12).character;
  const healed = healCharacter(down, 3);
  assert.deepEqual(kinds(healed), ['revived']);
  assert.equal(getHP(healed.character).current, 3);
  assert.deepEqual(
    healCharacter(hero(), 3).events,
    [],
    'a heal on a standing character says nothing',
  );
});
