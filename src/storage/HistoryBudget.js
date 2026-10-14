/**
 * The byte budget of the undo log, as pure arithmetic over record sizes.
 *
 * The log keeps two kinds of record. A delta record keeps the ops of one
 * edit, and all delta records share a fixed cap. A snapshot record keeps
 * the whole save string that a New, Load example, or Import replaced. One
 * snapshot of the example campaign is about 280 KB, more than half of the
 * delta cap, and a campaign with a few generated regions more passes the
 * whole cap. Counted against that cap, such a snapshot removes every older
 * step when it is written, and the next save then removes the snapshot
 * itself, so the undo of an Import lasts only until the next autosave.
 *
 * Snapshots therefore count against the room that the origin has left
 * instead. That budget does not count the newest snapshot, because its
 * write already succeeded and it is the step a GM needs after a replace by
 * mistake. An older snapshot stays only while it fits in the room that the save, the
 * other keys, the delta cap, and the newest snapshot leave.
 *
 * Records drop from the oldest end only, because undo walks the log in
 * order, and a record past a gap cannot be reached.
 */

/** @typedef {{ bytes: number, snapshot: boolean }} RecordSize */

/**
 * How many of the oldest records to drop so that the delta records fit in
 * `cap` and the older snapshots fit in `room`. The newest record always
 * stays. The function is pure.
 * @param {RecordSize[]} records oldest first
 * @param {number} cap bytes for all delta records
 * @param {number} room bytes for every snapshot record except the newest one
 * @returns {number}
 */
export function recordsToDrop(records, cap, room) {
  const newest = newestSnapshot(records);
  let deltaBytes = 0;
  let olderBytes = 0;
  records.forEach((record, i) => {
    if (!record.snapshot) deltaBytes += record.bytes;
    else if (i !== newest) olderBytes += record.bytes;
  });
  let drop = 0;
  while ((deltaBytes > cap || olderBytes > room) && drop < records.length - 1) {
    const record = records[drop];
    if (!record.snapshot) deltaBytes -= record.bytes;
    else if (drop !== newest) olderBytes -= record.bytes;
    drop += 1;
  }
  return drop;
}

/**
 * The position of the newest snapshot record, or -1 when there is none.
 * @param {RecordSize[]} records
 * @returns {number}
 */
export function newestSnapshot(records) {
  let at = records.length - 1;
  while (at >= 0 && !records[at].snapshot) at -= 1;
  return at;
}

/**
 * The room for snapshot records other than the newest one: the quota, less
 * the delta cap, the keys outside the log, and the newest snapshot. The
 * result can be negative, and then no older snapshot fits. The function is
 * pure.
 * @param {{ quota: number, cap: number, outside: number, newest: number }} bytes
 * @returns {number}
 */
export function olderSnapshotRoom({ quota, cap, outside, newest }) {
  return quota - cap - outside - newest;
}

/**
 * True when a snapshot of `snapshot` bytes fits beside everything outside
 * the log once a replace writes its save. The log itself can give up all of
 * its other records, so they do not count. The function is pure.
 * @param {{ quota: number, outside: number, snapshot: number }} bytes
 * @returns {boolean}
 */
export function snapshotFits({ quota, outside, snapshot }) {
  return snapshot + outside <= quota;
}
