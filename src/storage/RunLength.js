/**
 * The run-length streams of the tile codec (`TileCodec.js`). An index stream
 * stores one palette index per grid position in row-major order, and a fog
 * stream stores one bit per position. Both drop their trailing default run,
 * and both readers stop at the first unreadable run instead of throwing an
 * error. This module is pure.
 */

/**
 * The run length at which `[index, count]` becomes shorter than the same run
 * written as bare numbers. `[3,2]` is six characters. `3,3` is four
 * characters. A run of two makes a randomly varied terrain field larger. A
 * run of three is the point where the pair form stops losing.
 */
const RUN_MIN = 3;

/** The reserved index that means nothing is at this position. */
export const EMPTY = -1;

/**
 * Palette indices as a run-length stream. A bare number is one position, and
 * `[index, count]` is a run. The stream drops a trailing run of `EMPTY`,
 * which is most of the stream for a sparse interior, because the reader
 * fills every position past the end with `EMPTY`.
 * @param {ArrayLike<number>} indices one index per position
 * @returns {(number | [number, number])[]}
 */
export function indexRuns(indices) {
  /** @type {(number | [number, number])[]} */
  const runs = [];
  const flush = (/** @type {number} */ index, /** @type {number} */ count) => {
    if (count >= RUN_MIN) runs.push([index, count]);
    else for (let n = 0; n < count; n += 1) runs.push(index);
  };
  let runIndex = EMPTY;
  let runCount = 0;
  for (let pos = 0; pos < indices.length; pos += 1) {
    const index = indices[pos];
    if (runCount && index === runIndex) {
      runCount += 1;
      continue;
    }
    if (runCount) flush(runIndex, runCount);
    runIndex = index;
    runCount = 1;
  }
  if (runCount && runIndex !== EMPTY) flush(runIndex, runCount);
  return runs;
}

/**
 * One stream element as an index and a run length, or null when the element
 * is neither a bare index nor an `[index, count]` pair.
 * @param {unknown} element
 * @returns {{ index: number, count: number } | null}
 */
function readRun(element) {
  if (typeof element === 'number' && Number.isFinite(element)) {
    return { index: Math.trunc(element), count: 1 };
  }
  if (!Array.isArray(element)) return null;
  const [index, count] = element;
  if (typeof index !== 'number' || !Number.isFinite(index)) return null;
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return { index: Math.trunc(index), count: Math.max(0, Math.trunc(count)) };
}

/**
 * The index at each position, read from a stream that `indexRuns` wrote.
 * Positions past the end of the stream, or past an unreadable run, read as
 * `EMPTY`. A stream longer than `size` stops at the last position.
 * @param {unknown} stream
 * @param {number} size
 * @returns {Int32Array}
 */
export function expandIndexRuns(stream, size) {
  const indices = new Int32Array(size).fill(EMPTY);
  if (!Array.isArray(stream)) return indices;
  let pos = 0;
  for (const element of stream) {
    const run = readRun(element);
    if (!run) break;
    const end = Math.min(size, pos + run.count);
    // An index past the 32-bit range would wrap to a real palette slot.
    if (run.index >= 0 && run.index <= 0x7fffffff) indices.fill(run.index, pos, end);
    pos = end;
    if (pos >= size) break;
  }
  return indices;
}

/**
 * The `revealed` bits as alternating run lengths, starting with an
 * unrevealed run, or an empty list when nothing is revealed. The stream
 * drops a trailing unrevealed run, and the reader defaults every unstated
 * position to fogged.
 * @param {Iterable<boolean>} bits one bit per position
 * @returns {number[]}
 */
export function fogRuns(bits) {
  /** @type {number[]} */
  const runs = [];
  let value = false;
  let count = 0;
  let any = false;
  for (const bit of bits) {
    if (bit === value) {
      count += 1;
    } else {
      runs.push(count);
      value = bit;
      count = 1;
    }
    if (bit) any = true;
  }
  if (!any) return [];
  if (value) runs.push(count);
  return runs;
}

/**
 * The revealed bit for each position, read from a stream that `fogRuns`
 * wrote. A corrupt fog stream costs the GM some revealed ground, not the
 * entire load.
 * @param {unknown} fog
 * @param {number} size
 * @returns {Uint8Array}
 */
export function expandFog(fog, size) {
  const bits = new Uint8Array(size);
  if (!Array.isArray(fog)) return bits;
  let pos = 0;
  let revealed = false;
  for (const run of fog) {
    if (typeof run !== 'number' || !Number.isFinite(run) || run < 0) break;
    const end = Math.min(size, pos + Math.floor(run));
    if (revealed) bits.fill(1, pos, end);
    pos = end;
    revealed = !revealed;
    if (pos >= size) break;
  }
  return bits;
}
