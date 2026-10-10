import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterClaim } from '../src/view/CharacterClaim.js';
import { BOUND_CHARACTER_SESSION_KEY, characterLockKey } from '../src/view/CharacterBinding.js';
import { installLocalStorage, installWindow } from './helpers/env.js';

/** @type {Map<string, string>} */
let store;
/** @type {(type: string, event: any) => void} */
let fire;

/** An in-memory sessionStorage and a location with the given query string. */
function installTab(search = '') {
  const session = new Map();
  globalThis.sessionStorage = /** @type {any} */ ({
    getItem: (k) => session.get(k) ?? null,
    setItem: (k, v) => session.set(k, String(v)),
    removeItem: (k) => session.delete(k),
  });
  globalThis.location = /** @type {any} */ ({ search });
  return session;
}

/** Claims to release after each test, so no heartbeat timer stops the run from ending. */
const claims = /** @type {any[]} */ ([]);
afterEach(() => claims.splice(0).forEach((c) => c.setBinding(null)));

beforeEach(() => {
  store = installLocalStorage();
  fire = installWindow();
});

const hero = /** @type {any} */ ({ id: 'h', name: 'Hero' });
const mage = /** @type {any} */ ({ id: 'm', name: 'Mage' });

/** Build a claim over a stub picker, and record every callback. */
function setup(characters = [hero, mage]) {
  const log = /** @type {any[]} */ ([]);
  /** @type {(id: string | null) => void} */
  let pick = () => {};
  const picker = {
    locked: false,
    /** @type {any} */ painted: null,
    setLocked(/** @type {boolean} */ locked) {
      this.locked = locked;
    },
    paint(/** @type {any} */ options, /** @type {string} */ value) {
      this.painted = { options, value };
    },
  };
  const claim = createCharacterClaim({
    mountPicker: (onPick) => {
      pick = onPick;
      return picker;
    },
    getCharacters: () => characters,
    bind: (id) => log.push(['bind', id]),
    spectate: () => log.push(['spectate']),
    toast: (message) => log.push(['toast', message]),
  });
  claims.push(claim);
  return { claim, picker, log, pick: (/** @type {string | null} */ id) => pick(id) };
}

test('a URL character binds at start and locks the picker', () => {
  const session = installTab('?character=h');
  const { claim, picker } = setup();
  assert.equal(claim.getBoundId(), 'h');
  assert.equal(session.get(BOUND_CHARACTER_SESSION_KEY), 'h');
  assert.equal(picker.locked, true);
  assert.equal(picker.painted.value, 'h');
  assert.deepEqual(
    picker.painted.options.map((/** @type {any} */ o) => o.value),
    ['', 'h', 'm'],
  );
});

test('a pick binds the character, and a cleared pick spectates', () => {
  const session = installTab();
  const { claim, picker, log, pick } = setup();
  assert.equal(claim.getBoundId(), null);
  assert.equal(picker.locked, false);
  pick('m');
  assert.equal(claim.getBoundId(), 'm');
  assert.equal(session.get(BOUND_CHARACTER_SESSION_KEY), 'm');
  pick(null);
  assert.equal(claim.getBoundId(), null);
  assert.equal(session.has(BOUND_CHARACTER_SESSION_KEY), false);
  assert.deepEqual(log, [['bind', 'm'], ['spectate']]);
  assert.equal(claim.setBinding(null), null, 'an unchanged binding returns at once');
});

test('a character that another tab holds is refused with a toast', () => {
  installTab();
  store.set(characterLockKey('h'), JSON.stringify({ id: 'other', at: Date.now() }));
  const { claim, log, pick } = setup();
  pick('h');
  assert.equal(claim.getBoundId(), null);
  assert.deepEqual(log, [
    ['toast', 'Another tab is already playing Hero; this tab stays a spectator.'],
    ['spectate'],
  ]);
});

test('a takeover by another tab drops the tab to spectator', () => {
  installTab('?character=h');
  const { claim, picker, log } = setup();
  store.set(characterLockKey('h'), JSON.stringify({ id: 'other', at: Date.now() }));
  fire('storage', { key: characterLockKey('h') });
  assert.equal(claim.getBoundId(), null);
  assert.equal(picker.locked, false);
  assert.deepEqual(log, [
    ['toast', 'Another tab took over Hero; this tab is now a spectator.'],
    ['spectate'],
  ]);
});

test('updatePicker unbinds a character that left the roster', () => {
  installTab('?character=h');
  const characters = [hero, mage];
  const { claim, picker } = setup(characters);
  characters.shift();
  claim.updatePicker();
  assert.equal(claim.getBoundId(), null);
  assert.equal(picker.painted.value, '');
  claim.updatePicker();
  assert.equal(claim.getBoundId(), null);
});
