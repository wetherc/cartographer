import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUOTA_BYTES,
  RENOTIFY_GROWTH,
  footprintTooltip,
  footprintWarning,
  historyLoss,
  historyLossMessage,
  saveOutcome,
} from '../src/storage/SaveNotices.js';

test('a clean save says nothing', () => {
  assert.deepEqual(saveOutcome({ ok: true, assetsOk: true }), { landed: true, message: null });
});

test('a save that stored the campaign but not the images still counts as landed', () => {
  const outcome = saveOutcome({ ok: true, assetsOk: false });
  assert.equal(outcome.landed, true);
  assert.match(String(outcome.message), /handout pictures were not stored/);
});

test('a failed save reports failure so a reload flow can abort', () => {
  const outcome = saveOutcome({ ok: false, assetsOk: false });
  assert.equal(outcome.landed, false);
  assert.match(String(outcome.message), /Save failed/);
  // An unwritten campaign is a failure whatever became of the images.
  assert.equal(saveOutcome({ ok: false, assetsOk: true }).landed, false);
});

test('a write the log refused clears the history; one that evicted shortens it', () => {
  assert.equal(historyLoss({ ok: false, evictedAll: false }), 'cleared');
  assert.equal(historyLoss({ ok: false, evictedAll: true }), 'cleared');
  assert.equal(historyLoss({ ok: true, evictedAll: true }), 'shortened');
  assert.equal(historyLoss({ ok: true, evictedAll: false }), '');
});

test('a degradation is announced once, not on every autosave that repeats it', () => {
  assert.match(String(historyLossMessage('cleared', '')), /can no longer be undone/);
  assert.equal(historyLossMessage('cleared', 'cleared'), null);
  assert.match(String(historyLossMessage('shortened', '')), /oldest undo steps were dropped/);
  assert.equal(historyLossMessage('shortened', 'shortened'), null);
});

test('a worsening degradation is announced again', () => {
  assert.match(String(historyLossMessage('cleared', 'shortened')), /cleared/);
});

test('a healthy history says nothing whatever was reported before', () => {
  assert.equal(historyLossMessage('', ''), null);
  assert.equal(historyLossMessage('', 'cleared'), null);
});

test('the tooltip quotes the footprint in megabytes to one decimal', () => {
  assert.equal(footprintTooltip(0), 'Browser storage: 0.0 MB of about 5 MB used');
  assert.equal(footprintTooltip(2.5 * 1024 * 1024), 'Browser storage: 2.5 MB of about 5 MB used');
});

test('a footprint under the threshold warns nothing and forgets the last warning', () => {
  const warning = footprintWarning(1024, 4_000_000);
  assert.equal(warning.message, null);
  assert.equal(warning.warnedAt, 0);
});

const over = Math.ceil(QUOTA_BYTES * 0.95);

test('crossing the threshold warns and remembers the footprint it warned at', () => {
  const warning = footprintWarning(over, 0);
  assert.match(String(warning.message), /Export a backup and trim large images/);
  assert.equal(warning.warnedAt, over);
});

test('a footprint that has barely grown since the last warning stays quiet', () => {
  const warning = footprintWarning(over, over);
  assert.equal(warning.message, null);
  assert.equal(warning.warnedAt, over);
});

test('a footprint that has grown materially warns again', () => {
  const grown = Math.ceil(over * RENOTIFY_GROWTH);
  const warning = footprintWarning(grown, over);
  assert.notEqual(warning.message, null);
  assert.equal(warning.warnedAt, grown);
});
