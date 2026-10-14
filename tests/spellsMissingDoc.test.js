import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/** The built-in spells that come from the Player's Handbook, not the SRD. */
const NOT_SRD = ['Witch Bolt', 'Ray of Sickness', 'Destructive Wave'];
const SRD_SPELL_COUNT = 319;
const LEVELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** The rows of the table under "SRD spells not built in". */
function missingRows() {
  const doc = readFileSync(new URL('../docs/spells-missing.md', import.meta.url), 'utf8');
  const section = doc.split('## SRD spells not built in')[1].split('\n## ')[0];
  return section
    .split('\n')
    .filter((line) => /^\| (Cantrip|\d)/.test(line))
    .map((line) => {
      const [level, count, names] = line
        .split('|')
        .slice(1, 4)
        .map((s) => s.trim());
      return { level, count: Number(count), names: names.split(', ') };
    });
}

test('the missing-spell table and the built-in list name every SRD spell once', () => {
  const rows = missingRows();
  assert.deepEqual(
    rows.map((r) => r.level),
    LEVELS,
  );
  for (const row of rows) assert.equal(row.names.length, row.count, `${row.level} count`);
  const missing = rows.flatMap((r) => r.names);
  assert.equal(new Set(missing).size, missing.length, 'no name repeats');
  const shipped = new Set(DEFAULT_SPELLS.map((s) => s.name));
  assert.deepEqual(
    missing.filter((n) => shipped.has(n)),
    [],
    'a built-in spell is not listed as missing',
  );
  const srdShipped = DEFAULT_SPELLS.filter((s) => !NOT_SRD.includes(s.name)).length;
  assert.equal(missing.length + srdShipped, SRD_SPELL_COUNT);
});
