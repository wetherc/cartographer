import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  footprintBytes,
  recordExternalWrite,
  removeStored,
  storageFootprint,
  storedLength,
  tryWriteStored,
  writeStored,
} from '../src/storage/Footprint.js';
import { installLocalStorage, installQuotaStorage } from './helpers/env.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bytes of one key and value pair, as localStorage charges them. */
const cost = (/** @type {string} */ key, /** @type {string} */ value) =>
  (key.length + value.length) * 2;

/** Wrap `getItem` so a test can count the values the ledger reads. */
function countGets() {
  const real = localStorage.getItem;
  let reads = 0;
  localStorage.getItem = (/** @type {string} */ key) => {
    reads += 1;
    return real(key);
  };
  return () => reads;
}

beforeEach(installLocalStorage);

test('footprintBytes charges for keys and values, two bytes per code unit', () => {
  assert.equal(footprintBytes([]), 0);
  assert.equal(footprintBytes([['ab', 'cd']]), 8);
  assert.equal(
    footprintBytes([
      ['a', ''],
      ['', 'bb'],
    ]),
    6,
  );
});

test('the footprint reads the origin once and then follows recorded writes', () => {
  localStorage.setItem('a', 'xxxx');
  const reads = countGets();
  assert.equal(storageFootprint(), cost('a', 'xxxx'));
  assert.equal(reads(), 1, 'the first call reads every key');
  writeStored('b', 'yy');
  writeStored('a', 'x');
  assert.equal(storageFootprint(), cost('a', 'x') + cost('b', 'yy'));
  removeStored('b');
  assert.equal(storageFootprint(), cost('a', 'x'));
  assert.equal(reads(), 1, 'recorded writes need no further reads');
});

test('a key count that disagrees with the ledger forces a re-read', () => {
  assert.equal(storageFootprint(), 0);
  localStorage.setItem('campaign-builder:save', 'x'.repeat(10));
  localStorage.setItem('campaign-builder:library', 'y'.repeat(20));
  assert.equal(
    storageFootprint(),
    cost('campaign-builder:save', 'x'.repeat(10)) +
      cost('campaign-builder:library', 'y'.repeat(20)),
  );
});

test("another tab's storage event updates the ledger without a re-read", () => {
  writeStored('a', 'x');
  assert.equal(storageFootprint(), cost('a', 'x'));
  const reads = countGets();
  // The stub fires no events, so the test applies what the browser would
  // deliver and mirrors the write into the store by hand.
  localStorage.setItem('a', 'xxxxx');
  recordExternalWrite({ key: 'a', newValue: 'xxxxx' });
  assert.equal(storageFootprint(), cost('a', 'xxxxx'));
  localStorage.removeItem('a');
  recordExternalWrite({ key: 'a', newValue: null });
  assert.equal(storageFootprint(), 0);
  assert.equal(reads(), 0);
  localStorage.setItem('z', 'q');
  recordExternalWrite({ key: null, newValue: null });
  assert.equal(storageFootprint(), cost('z', 'q'), 'a clear event drops the ledger for a re-read');
});

test('an external event before any ledger exists is ignored safely', () => {
  installLocalStorage();
  recordExternalWrite({ key: 'a', newValue: 'x' });
  assert.equal(storageFootprint(), 0);
});

test('storedLength answers from the ledger and re-reads the origin for an unknown key', () => {
  writeStored('campaign-builder:history:d1', 'x'.repeat(7));
  assert.equal(storageFootprint(), cost('campaign-builder:history:d1', 'x'.repeat(7)));
  const reads = countGets();
  assert.equal(storedLength('campaign-builder:history:d1'), 7);
  assert.equal(storedLength('missing'), 0);
  assert.equal(reads(), 1, 'the unknown key re-read the one stored value');
  // A key written behind the ledger's back, with another removed so the
  // count still matches, is found by one re-read and then remembered.
  localStorage.removeItem('campaign-builder:history:d1');
  localStorage.setItem('other', 'yyy');
  assert.equal(storedLength('other'), 3);
  assert.equal(storedLength('other'), 3);
  assert.equal(reads(), 2);
});

test('a write that throws records nothing and rethrows', () => {
  writeStored('a', 'x');
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(() => writeStored('b', 'yy'));
  assert.equal(storageFootprint(), cost('a', 'x'));
});

test('a flag rewrite with the same key count updates the footprint', () => {
  const key = 'campaign-builder:theme';
  writeStored(key, 'light');
  assert.equal(storageFootprint(), cost(key, 'light'));
  writeStored(key, 'dark');
  assert.equal(storageFootprint(), cost(key, 'dark'));
  removeStored(key);
  assert.equal(storageFootprint(), 0);
});

test('no code outside src/storage/ writes localStorage directly', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  // A write through any handle counts, so `storage?.setItem(...)` on a
  // passed-in localStorage fails the test too. Lines that name
  // sessionStorage are exempt, because sessionStorage has its own quota.
  // ReloadView.js takes sessionStorage as a parameter, so its lines do not
  // name it.
  const direct = /localStorage\s*\.\s*clear\b|\??\.\s*(setItem|removeItem)\s*\(/;
  const sessionOnly = new Set([join('view', 'ReloadView.js')]);
  const writesLocal = (/** @type {string} */ text) =>
    text.split('\n').some((line) => direct.test(line) && !line.includes('sessionStorage'));
  const offenders = readdirSync(root, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('.js') && !path.startsWith(`storage${sep}`))
    .filter((path) => !sessionOnly.has(path))
    .filter((path) => writesLocal(readFileSync(join(root, path), 'utf8')));
  assert.deepEqual(offenders, [], 'use writeStored and removeStored from storage/Footprint.js');
});

test('tryWriteStored reports a quota failure instead of throwing', () => {
  installQuotaStorage(10);
  assert.equal(tryWriteStored('a', '1'), true);
  assert.equal(localStorage.getItem('a'), '1');
  assert.equal(tryWriteStored('b', 'x'.repeat(20)), false);
  assert.equal(localStorage.getItem('b'), null);
});
