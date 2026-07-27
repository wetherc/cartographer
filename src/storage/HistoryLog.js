/**
 * Undo and redo as a log of invertible deltas against the persisted campaign,
 * replacing the ring of whole-campaign snapshots this module was written to
 * retire.
 *
 * The ring stored up to ten complete serialized saves beside the canonical one,
 * so a history step cost a whole campaign and every save wrote twice the
 * campaign's bytes synchronously — and it offered no redo at all, because a
 * stack of past states cannot describe a future one. A log of deltas costs the
 * size of the edit instead, and redo falls out of the same structure: an op
 * records both its old and its new value, so `invertOps` is a swap and undo and
 * redo are the same walk in opposite directions.
 *
 * Storage layout, one key per record so a push is one small write:
 *
 * - `campaign-builder:history` — the index, `{ version, deltas, cursor }`, where
 *   `deltas` is the ordered sequence numbers and `cursor` is how many of them the
 *   persisted save currently reflects. Deltas past the cursor are the redo tail.
 * - `campaign-builder:history:d<seq>` — one delta, a `JSON.stringify`d op list.
 *
 * There is deliberately no base snapshot. The plan this implements called for
 * one — a packed campaign the log applies onto — but the canonical save already
 * is that state, and undo and redo only ever apply a delta to the *current*
 * state, never to a stored base. So the base's only remaining job would have been
 * to let the oldest deltas be folded into it at the byte cap, and dropping those
 * deltas outright does the same thing: it costs undo depth either way, and it
 * avoids rewriting a multi-megabyte base synchronously on every cap hit. The
 * deferred idea the base does serve — replaying base plus log at load, so the
 * canonical save need not be written at all — is out of scope here, and is what
 * would bring it back.
 *
 * `version` on the index is what makes an upgrade safe. A delta is never
 * migrated: it was written against a specific `CampaignState` shape by a specific
 * app version, so a log stamped with anything but the current schema version is
 * discarded rather than applied. One upgrade costs undo depth, which pre-GA save
 * compatibility allows.
 *
 * The one property of the ring worth keeping — that a push moves strings around
 * rather than parsing and re-stringifying a campaign — a diff cannot keep, since
 * it needs the previous state as a value. The cost is paid once: the last
 * persisted state is cached in memory, stamped with the raw string it came from,
 * so the steady state costs one `getItem` and one string compare. The stamp is
 * also the correctness guard, since a tab that declines the cross-tab reload
 * prompt keeps editing against a save another tab replaced; comparing the raw
 * string catches that where a bare cache would have diffed against a state that
 * is no longer stored.
 *
 * Every write here goes after the campaign write, never before: the index must
 * never describe a state that was not stored. A quota failure costs depth rather
 * than the whole log, and reports it, because Undo silently becoming single-step
 * is the defect that reporting contract exists for.
 */

import { applyOps, diffState, invertOps } from './StateDiff.js';
import { CURRENT_VERSION } from './Migrations.js';
import { STORAGE_KEY, deserialize, trySaveToLocalStorage } from './SaveManager.js';
import { loadAssetTable } from './AssetStore.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {{ version: number, deltas: number[], cursor: number }} HistoryIndex */
/** @typedef {{ ok: boolean, evictedAll: boolean }} HistoryResult */

/** The localStorage key the history index lives under. */
export const HISTORY_KEY = 'campaign-builder:history';

/**
 * How many bytes of deltas to keep. The ring it replaces cost ten whole
 * campaigns — 0.73 MB for the example campaign — so this is both more depth and
 * less storage for any realistic edit, while still bounding a log that a handout
 * insertion can add 250,000 characters to in one step.
 */
export const HISTORY_BYTE_CAP = 512 * 1024;

/** @type {HistoryIndex} */
const EMPTY_INDEX = { version: CURRENT_VERSION, deltas: [], cursor: 0 };

/**
 * The last persisted campaign as a value, stamped with the raw string it was
 * parsed from so a save made by another tab invalidates it.
 * @type {{ raw: string, state: CampaignState } | null}
 */
let cached = null;

/**
 * @param {number} seq
 * @returns {string}
 */
function deltaKey(seq) {
  return `${HISTORY_KEY}:d${seq}`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Remove the index and every record under it. The scan is by key prefix rather
 * than by walking the index, so it also reclaims the previous ring's
 * `<key>:<seq>` snapshots — the upgrade path drops them rather than converting
 * them, since a whole-campaign snapshot is not a delta and cannot become one.
 */
export function clearHistoryLog() {
  /** @type {string[]} */
  const doomed = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === HISTORY_KEY || key?.startsWith(`${HISTORY_KEY}:`)) doomed.push(key);
  }
  for (const key of doomed) localStorage.removeItem(key);
}

/**
 * The stored index, or an empty one. Anything unreadable — a corrupt record, the
 * previous ring's array of sequence numbers, or a log written under an older
 * schema version — clears the whole log rather than being partially trusted,
 * since a delta that does not describe this app's state shape would corrupt the
 * campaign it was applied to.
 * @returns {HistoryIndex}
 */
function readIndex() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return { ...EMPTY_INDEX };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearHistoryLog();
    return { ...EMPTY_INDEX };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (!isRecord(parsed) || record.version !== CURRENT_VERSION) {
    clearHistoryLog();
    return { ...EMPTY_INDEX };
  }
  const deltas = Array.isArray(record.deltas)
    ? record.deltas.filter((seq) => typeof seq === 'number' && Number.isFinite(seq))
    : [];
  const stored = record.cursor;
  const cursor =
    typeof stored === 'number' && Number.isFinite(stored)
      ? Math.min(Math.max(0, Math.trunc(stored)), deltas.length)
      : deltas.length;
  return { version: CURRENT_VERSION, deltas, cursor };
}

/**
 * @param {HistoryIndex} index
 * @returns {boolean} whether the write landed
 */
function writeIndex(index) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/**
 * One stored delta, or null when its key is missing or unreadable. A missing key
 * is tolerated rather than thrown on: the previous ring already skipped one, and
 * a throw on a load or undo path is a campaign the GM cannot get back to.
 * @param {number} seq
 * @returns {DiffOp[] | null}
 */
function readDelta(seq) {
  const raw = localStorage.getItem(deltaKey(seq));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The persisted campaign as a value, or null when nothing is stored or what is
 * stored cannot be read. Reuses the cache only when the stored string is still
 * the one it was built from.
 * @returns {CampaignState | null}
 */
function lastPersisted() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  if (cached && cached.raw === raw) return cached.state;
  try {
    const state = deserialize(raw, loadAssetTable());
    cached = { raw, state };
    return state;
  } catch {
    return null;
  }
}

/**
 * Drop the oldest deltas until the log fits the byte cap. Returns the surviving
 * sequence numbers; the dropped keys are removed. Hitting the cap is the design
 * rather than a failure, so it is not reported as lost depth — the alternative,
 * an unbounded log, is what puts the origin over quota.
 * @param {number[]} deltas
 * @returns {number[]}
 */
function trimToCap(deltas) {
  const sizes = deltas.map((seq) => (localStorage.getItem(deltaKey(seq))?.length ?? 0) * 2);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  let drop = 0;
  while (total > HISTORY_BYTE_CAP && drop < deltas.length - 1) {
    total -= sizes[drop];
    drop += 1;
  }
  for (const seq of deltas.slice(0, drop)) localStorage.removeItem(deltaKey(seq));
  return deltas.slice(drop);
}

/**
 * Append one delta describing `before` -> `after`, dropping any redo tail the
 * new edit invalidates. Reports as the ring did: `ok` is whether this step is
 * undoable, `evictedAll` whether a full origin cost the GM depth beyond the
 * ordinary cap.
 * @param {CampaignState | null} before
 * @param {CampaignState} after
 * @returns {HistoryResult}
 */
function recordDelta(before, after) {
  const index = readIndex();
  // Nothing stored to diff against — a first save, or a stored save this app
  // cannot read. Either way the campaign is now the oldest state there is.
  if (!before) return { ok: true, evictedAll: false };
  const ops = diffState(before, after);
  // An unchanged campaign saved again is not a history step, which also replaces
  // the ring's skip-if-identical-to-the-newest check.
  if (!ops.length) return { ok: true, evictedAll: false };
  const json = JSON.stringify(ops);
  const seq = Math.max(-1, ...index.deltas) + 1;
  const tail = index.deltas.slice(index.cursor);
  // One edit larger than the whole cap (generating a node inserts every one of
  // its tiles as one op) cannot be stored without leaving no room for anything
  // else. Drop the log rather than the campaign, and say so.
  if (json.length * 2 > HISTORY_BYTE_CAP) {
    clearHistoryLog();
    return { ok: false, evictedAll: true };
  }
  const deltas = [...index.deltas.slice(0, index.cursor), seq];
  let evictedAll = false;
  for (;;) {
    try {
      localStorage.setItem(deltaKey(seq), json);
      break;
    } catch {
      // A full origin degrades depth-first: give up the oldest step and retry,
      // rather than losing the whole log for one write.
      if (deltas.length < 2) {
        clearHistoryLog();
        return { ok: false, evictedAll: true };
      }
      const oldest = /** @type {number} */ (deltas.shift());
      localStorage.removeItem(deltaKey(oldest));
      evictedAll = true;
    }
  }
  const kept = trimToCap(deltas);
  // The index goes last: an index naming a key that was never written is a
  // history step that cannot be applied, where an unnamed key is merely garbage.
  if (!writeIndex({ version: CURRENT_VERSION, deltas: kept, cursor: kept.length })) {
    clearHistoryLog();
    return { ok: false, evictedAll: true };
  }
  for (const dropped of tail) localStorage.removeItem(deltaKey(dropped));
  return { ok: true, evictedAll };
}

/**
 * Persist a campaign and record the step that produced it. This is the one save
 * path: the delta is written after the campaign, so a failed campaign write
 * leaves the log describing exactly what is stored.
 * @param {CampaignState} state
 * @returns {ReturnType<typeof trySaveToLocalStorage> & { history: HistoryResult }}
 */
export function saveCampaign(state) {
  const before = lastPersisted();
  const save = trySaveToLocalStorage(state);
  if (!save.ok) return { ...save, history: { ok: true, evictedAll: false } };
  cached = { raw: save.json, state };
  return { ...save, history: recordDelta(before, state) };
}

/**
 * Step the cursor by one delta, persisting the state it names. Shared by undo
 * and redo, which differ only in which delta they read and which way they apply
 * it. Returns null when there is nothing in that direction.
 * @param {number} direction -1 to undo, 1 to redo
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
function step(direction) {
  const index = readIndex();
  const at = direction < 0 ? index.cursor - 1 : index.cursor;
  if (at < 0 || at >= index.deltas.length) return null;
  const current = lastPersisted();
  if (!current) return null;
  const ops = readDelta(index.deltas[at]);
  if (!ops) {
    // The step's own record is gone, so neither direction of the log can be
    // trusted to describe the campaign any more.
    clearHistoryLog();
    return null;
  }
  /** @type {CampaignState} */
  let restored;
  try {
    restored = applyOps(current, direction < 0 ? invertOps(ops) : ops);
  } catch {
    clearHistoryLog();
    return null;
  }
  const save = trySaveToLocalStorage(restored);
  // Campaign first, index second, for the same reason a save records after
  // writing: never leave the cursor claiming a state that was not stored.
  if (!save.ok) return { save, state: restored };
  cached = { raw: save.json, state: restored };
  writeIndex({ version: CURRENT_VERSION, deltas: index.deltas, cursor: index.cursor + direction });
  return { save, state: restored };
}

/**
 * Restore the state before the most recent recorded edit, persisting it. Null
 * when there is nothing to undo.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function undoCampaign() {
  return step(-1);
}

/**
 * Re-apply the edit the last undo reversed, persisting the result. Null when the
 * cursor is already at the head.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function redoCampaign() {
  return step(1);
}

/**
 * How many steps each direction currently offers, for enabling the header
 * controls.
 * @returns {{ undo: number, redo: number }}
 */
export function historyDepth() {
  const index = readIndex();
  return { undo: index.cursor, redo: index.deltas.length - index.cursor };
}
