/**
 * Display labels for combatants that share a name. Two Roadside Bandits in
 * one fight read the same in every list, and the GM can tell them apart only
 * by their order. This module numbers them: "Roadside Bandit 1" and
 * "Roadside Bandit 2". The number is a label only, and the stored name stays
 * as the GM typed it.
 *
 * The caller passes the entries in a stable order, the order of the
 * campaign's own lists, so the same creature gets the same number in the
 * setup dialog, the encounter rows, and the fight.
 */

/**
 * The label of each entry, keyed by id. A name that appears once keeps its
 * label unchanged. Each repeat of a name gets a number after it, counting up
 * from 1 in the order given.
 * @param {readonly { id: string, name: string }[]} entries
 * @returns {Map<string, string>}
 */
export function numberedNames(entries) {
  /** @type {Map<string, number>} */
  const totals = new Map();
  for (const { name } of entries) totals.set(name, (totals.get(name) ?? 0) + 1);
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Map<string, string>} */
  const labels = new Map();
  for (const { id, name } of entries) {
    if ((totals.get(name) ?? 0) < 2) {
      labels.set(id, name);
      continue;
    }
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    labels.set(id, `${name} ${n}`);
  }
  return labels;
}

/**
 * The labels of the entries whose id is in `ids`, numbered in the order of
 * `ordered`. The fight and the setup dialog pass the characters and then the
 * creatures in campaign order, so the numbers do not follow initiative.
 * @param {readonly { id: string, name: string }[]} ordered
 * @param {Iterable<string>} ids
 * @returns {Map<string, string>}
 */
export function labelsFor(ordered, ids) {
  const wanted = new Set(ids);
  return numberedNames(ordered.filter((entry) => wanted.has(entry.id)));
}

/**
 * Labels for the lists of the Encounters panel, which show the foes of one
 * fight beside other hostiles nearby. A foe of the fight gets its fight
 * label, from `labelsFor` over `fightIds`, so it reads the same in the
 * panel, the setup dialog, and the fight. Every other id counts on after
 * the fight's own numbers, so two wolves never both read "Wolf 1". A lone
 * wolf in the fight reads "Wolf", and a second wolf nearby reads "Wolf 2".
 * The other ids count through the groups in the order given, and through
 * `ordered` inside each group. The map keeps only the ids in `groups`.
 * @param {readonly { id: string, name: string }[]} ordered
 * @param {Iterable<string>} fightIds
 * @param {readonly Iterable<string>[]} groups
 * @returns {Map<string, string>}
 */
export function encounterLabels(ordered, fightIds, groups) {
  const fight = labelsFor(ordered, fightIds);
  /** @type {Set<string>} */
  const listed = new Set();
  /** @type {{ id: string, name: string }[]} */
  const others = [];
  for (const group of groups) {
    const wanted = new Set(group);
    for (const entry of ordered) {
      if (!wanted.has(entry.id) || listed.has(entry.id)) continue;
      listed.add(entry.id);
      if (!fight.has(entry.id)) others.push(entry);
    }
  }
  const namesOf = (/** @type {{ name: string }[]} */ list) => list.map((e) => e.name);
  const fought = namesOf(ordered.filter((e) => fight.has(e.id)));
  const all = [...fought, ...namesOf(others)];
  /** @type {Map<string, string>} */
  const labels = new Map([...fight].filter(([id]) => listed.has(id)));
  others.forEach(({ id, name }, i) => {
    const total = all.filter((n) => n === name).length;
    const n = all.slice(0, fought.length + i + 1).filter((m) => m === name).length;
    labels.set(id, total < 2 ? name : `${name} ${n}`);
  });
  return labels;
}
