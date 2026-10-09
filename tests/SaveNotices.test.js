import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUOTA_BYTES,
  RENOTIFY_GROWTH,
  footprintTooltip,
  footprintWarning,
  historyLoss,
  historyLossMessage,
  loadFailedMessage,
  NO_UNDO_ROOM,
  replacePrompt,
  saveOutcome,
  shortenedBootMessage,
  shortenedImportMessage,
  truncationSummary,
} from '../src/storage/SaveNotices.js';

test('a clean save says nothing', () => {
  assert.deepEqual(saveOutcome({ ok: true, assetsOk: true }), { landed: true, message: null });
});

test('a save that stored the campaign but not the images still counts as landed', () => {
  const outcome = saveOutcome({ ok: true, assetsOk: false });
  assert.equal(outcome.landed, true);
  assert.match(String(outcome.message), /handout pictures were not stored/);
});

test('with the images in IndexedDB, no notice tells the GM to trim images', () => {
  const failed = String(saveOutcome({ ok: false, assetsOk: true }, true).message);
  assert.match(failed, /Save failed/);
  assert.doesNotMatch(failed, /images/);
  assert.match(
    String(saveOutcome({ ok: true, assetsOk: false }, true).message),
    /browser did not store the images/,
  );
  assert.equal(
    footprintTooltip(2.5 * 1024 * 1024, true),
    'Browser storage: 2.5 MB of about 5 MB used, not counting images',
  );
  const warning = footprintWarning(3.5 * 1024 * 1024, 0, true);
  assert.match(String(warning.message), /Export a backup\.$/);
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

test('the load-failure notice promises Undo only when Undo can restore the save', () => {
  assert.match(loadFailedMessage(true), /press Undo to restore/);
  assert.doesNotMatch(loadFailedMessage(false), /press Undo/);
  assert.match(loadFailedMessage(false), /Undo cannot restore it/);
  assert.match(loadFailedMessage(false), /next save overwrites it/);
});

test('a shortened load names what it left out, and each limit', () => {
  assert.equal(
    truncationSummary({ dropped: 1, emptied: 0 }),
    'This campaign is larger than the app can load: 1 map area past the first 10,000 did not load.',
  );
  assert.equal(
    truncationSummary({ dropped: 0, emptied: 2 }),
    'This campaign is larger than the app can load: 2 map areas loaded with no tiles, because the campaign has more than 2,000,000 tiles.',
  );
  const both = truncationSummary({ dropped: 3, emptied: 1 });
  assert.match(both, /3 map areas past the first 10,000 did not load, and 1 map area loaded/);
  const boot = shortenedBootMessage({ dropped: 3, emptied: 1 });
  assert.ok(boot.startsWith(both));
  assert.match(boot, /Saving is paused/);
  const imported = shortenedImportMessage({ dropped: 3, emptied: 1 });
  assert.ok(imported.startsWith(both));
  assert.match(imported, /Importing stores the shortened map/);
});

test('a replace confirm adds the undo note only when the step is undoable', () => {
  assert.equal(replacePrompt('Replace?', true), 'Replace?');
  assert.equal(replacePrompt('Replace?', true, 'Undo restores it.'), 'Replace? Undo restores it.');
  assert.equal(replacePrompt('Replace?', false, 'Undo restores it.'), `Replace? ${NO_UNDO_ROOM}`);
  assert.equal(replacePrompt('Replace?', false), `Replace? ${NO_UNDO_ROOM}`);
});
