/**
 * Campaign-wide search for the header search box. This module is pure. It
 * takes the campaign records and the viewer, and returns the matches grouped
 * by kind, each with the place that a click on it opens. The widget in
 * `ui/CampaignSearchBox.js` draws the list, and `app/searchWiring.js` turns a
 * chosen match into a jump.
 *
 * A Player tab finds only what its role can read elsewhere in the app:
 * revealed quests and their shown objectives, revealed handouts in its
 * audience, creatures the party met, the travelogue lines a player reads,
 * and the maps where the fog has cleared at least one tile. Quest notes,
 * creature notes, and tile notes are GM-only, so a Player tab never matches
 * their text.
 */

import { inAudience } from '../handout/Handouts.js';
import { entriesFor } from '../log/LogVisibility.js';
import { describeTile } from '../map/TileCoords.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/** @typedef {'quest' | 'creature' | 'handout' | 'tileNote' | 'creatureNote' | 'log' | 'map'} SearchKind */

/**
 * Where a chosen match leads. A `panel` target names a sidebar list and the
 * record's id in it. A `tile` target names a tile of a map to center.
 * @typedef {{ type: 'panel', panel: 'quest' | 'npc' | 'handout' | 'log', id: string }
 *   | { type: 'tile', nodeId: string, tileId: string }} SearchTarget
 */

/**
 * One match. `title` names the record and `detail` is a short line of
 * context, often the text around the match.
 * @typedef {{ key: string, kind: SearchKind, title: string, detail: string, target: SearchTarget }} SearchResult
 */

/** @typedef {{ kind: SearchKind, label: string, results: SearchResult[] }} SearchGroup */

/**
 * @typedef {{
 *   quests: Quest[],
 *   creatures: Creature[],
 *   handouts: Handout[],
 *   travelog: LogEntry[],
 *   nodes: MapNode[],
 * }} SearchSources
 */

/** @typedef {{ gm: boolean, boundCharacterId: string | null }} SearchViewer */

/** The kinds in the order the list shows them, with their group headings. */
export const SEARCH_KINDS = /** @type {const} */ ([
  ['map', 'Maps'],
  ['quest', 'Quests'],
  ['creature', 'NPCs and creatures'],
  ['handout', 'Handouts'],
  ['tileNote', 'Tile notes'],
  ['creatureNote', 'Creature notes'],
  ['log', 'Travelogue'],
]);

/** The most matches one group lists. A longer list hides the rest. */
export const GROUP_LIMIT = 5;

/** Characters of context on each side of a match in a detail line. */
const CONTEXT = 32;

/**
 * Lower case with accents removed, so "Æ" and "é" match plain letters.
 * @param {string} text
 * @returns {string}
 */
export function fold(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * The search words of a query: folded, split on white space, empty words
 * dropped.
 * @param {string} query
 * @returns {string[]}
 */
export function queryTerms(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

/**
 * Whether every term occurs in one of the texts. The terms may be spread
 * over the texts, so "wolf den" finds a creature named "Wolf" in a note
 * about its den.
 * @param {string[]} texts
 * @param {string[]} terms
 * @returns {boolean}
 */
function matchesAll(texts, terms) {
  const folded = texts.map(fold);
  return terms.every((term) => folded.some((text) => text.includes(term)));
}

/**
 * The folded text with the same length as the input, one folded character
 * for each character. A character that folds to more than one, such as the
 * ellipsis or a ligature, stays as it is. Positions in the
 * result are positions in the input, which `excerpt` and `highlight` need.
 * @param {string} text
 * @returns {string}
 */
function foldInPlace(text) {
  return [...text]
    .map((c) => {
      const folded = fold(c);
      return folded.length === c.length ? folded : c;
    })
    .join('');
}

/**
 * A short excerpt of `text` around the first term it contains, with an
 * ellipsis where it cuts. A cut moves to the next word break, so the
 * excerpt does not start inside a word. Returns the start of the text when
 * no term occurs in it.
 * @param {string} text
 * @param {string[]} terms
 * @returns {string}
 */
export function excerpt(text, terms) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const folded = foldInPlace(flat);
  const hits = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  let start = Math.max(0, at - CONTEXT);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  const end = Math.min(flat.length, at + CONTEXT * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/**
 * The text split into runs that match a term and runs that do not, so the
 * widget can mark the matched words without building HTML from a string.
 * @param {string} text
 * @param {string[]} terms
 * @returns {{ text: string, hit: boolean }[]}
 */
export function highlight(text, terms) {
  const folded = foldInPlace(text);
  if (terms.length === 0) return [{ text, hit: false }];
  const marks = new Array(text.length).fill(false);
  for (const term of terms) {
    for (let i = folded.indexOf(term); i >= 0; i = folded.indexOf(term, i + 1)) {
      marks.fill(true, i, i + term.length);
    }
  }
  /** @type {{ text: string, hit: boolean }[]} */
  const runs = [];
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else runs.push({ text: text[i], hit: marks[i] });
  }
  return runs;
}

/**
 * Whether a Player tab knows a creature: one the party met, or a friendly
 * or neutral one with no place on the map, which every map lists.
 * @param {Creature} creature
 * @returns {boolean}
 */
function knownToPlayers(creature) {
  return (
    creature.met === true || (creature.location === null && creature.disposition !== 'hostile')
  );
}

/**
 * The detail line of a creature: its role, or its disposition when it has
 * none, and the map it stands on. Two foes of one name then read apart.
 * @param {Creature} creature
 * @param {MapNode[]} nodes
 * @returns {string}
 */
function creatureDetail(creature, nodes) {
  const what = creature.role || capitalize(creature.disposition);
  const where = nodes.find((n) => n.id === creature.location?.nodeId)?.name;
  return where ? `${what} · ${where}` : what;
}

/**
 * Where a creature result leads: its tile when it has one, else the NPC list.
 * @param {Creature} creature
 * @returns {SearchTarget}
 */
function creatureTarget(creature) {
  return creature.location
    ? { type: 'tile', nodeId: creature.location.nodeId, tileId: creature.location.tileId }
    : { type: 'panel', panel: 'npc', id: creature.id };
}

/**
 * The tile a map result centers: the first revealed tile for a Player tab,
 * and the middle of the map for the GM.
 * @param {MapNode} node
 * @param {boolean} gm
 * @returns {string | null}
 */
function mapCenter(node, gm) {
  if (!gm) return node.tiles.find((t) => t.revealed)?.id ?? null;
  return `${Math.floor(node.width / 2)},${Math.floor(node.height / 2)}`;
}

/**
 * Every match of one kind, before the group limit.
 * @param {SearchKind} kind
 * @param {SearchSources} sources
 * @param {string[]} terms
 * @param {SearchViewer} viewer
 * @returns {SearchResult[]}
 */
function matchesOf(kind, sources, terms, viewer) {
  const { gm } = viewer;
  /** @type {SearchResult[]} */
  const out = [];
  /** @param {string} id @param {string} title @param {string} detail @param {SearchTarget} target */
  const add = (id, title, detail, target) =>
    out.push({ key: `${kind}:${id}`, kind, title, detail, target });

  if (kind === 'map') {
    for (const node of sources.nodes) {
      const tileId = mapCenter(node, gm);
      if (tileId === null || !matchesAll([node.name], terms)) continue;
      const parent = sources.nodes.find((n) => n.id === node.parentId);
      add(node.id, node.name, parent ? `In ${parent.name}` : 'Top map', {
        type: 'tile',
        nodeId: node.id,
        tileId,
      });
    }
  } else if (kind === 'quest') {
    for (const quest of sources.quests) {
      if (!gm && !quest.revealed) continue;
      const steps = quest.objectives.filter((o) => gm || !o.hidden).map((o) => o.text);
      const texts = [quest.title, ...steps, ...(gm ? [quest.notes] : [])];
      if (!matchesAll(texts, terms)) continue;
      // A title match shows the status. A match in a step or the notes shows
      // the text around it, so the GM sees why the quest is listed.
      const status = quest.status === 'completed' ? 'Completed' : 'Active';
      const inText = texts.slice(1).find((t) => terms.some((term) => fold(t).includes(term)));
      const detail = matchesAll([quest.title], terms) || !inText ? status : excerpt(inText, terms);
      add(quest.id, quest.title, detail, { type: 'panel', panel: 'quest', id: quest.id });
    }
  } else if (kind === 'creature') {
    for (const c of sources.creatures) {
      if (!gm && !knownToPlayers(c)) continue;
      if (!matchesAll([c.name, c.role ?? ''], terms)) continue;
      add(c.id, c.name, creatureDetail(c, sources.nodes), creatureTarget(c));
    }
  } else if (kind === 'creatureNote') {
    if (!gm) return out;
    for (const c of sources.creatures) {
      if (!c.notes || !matchesAll([c.notes], terms)) continue;
      add(c.id, c.name, excerpt(c.notes, terms), creatureTarget(c));
    }
  } else if (kind === 'handout') {
    for (const h of sources.handouts) {
      if (!gm && !(h.revealed && inAudience(h, viewer.boundCharacterId))) continue;
      if (!matchesAll([h.title, h.body], terms)) continue;
      const detail = matchesAll([h.title], terms) ? excerpt(h.body, []) : excerpt(h.body, terms);
      add(h.id, h.title, detail, { type: 'panel', panel: 'handout', id: h.id });
    }
  } else if (kind === 'tileNote') {
    if (!gm) return out;
    for (const node of sources.nodes) {
      for (const tile of node.tiles) {
        const { notes } = tile.metadata;
        if (!notes || !matchesAll([notes], terms)) continue;
        add(
          `${node.id}/${tile.id}`,
          `${node.name}, ${describeTile(tile.id)}`,
          excerpt(notes, terms),
          {
            type: 'tile',
            nodeId: node.id,
            tileId: tile.id,
          },
        );
      }
    }
  } else {
    const entries = entriesFor(sources.travelog, gm ? 'gm' : 'player');
    // The newest line comes first, as a GM looking for a recent event expects.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!matchesAll([entry.message], terms)) continue;
      add(entry.id, excerpt(entry.message, terms), capitalize(entry.kind), {
        type: 'panel',
        panel: 'log',
        id: entry.id,
      });
    }
  }
  return out;
}

/**
 * Whether a result's title starts with the first term, which ranks it
 * above a match inside the text.
 * @param {SearchResult} result
 * @param {string[]} terms
 * @returns {boolean}
 */
function leads(result, terms) {
  return fold(result.title).startsWith(terms[0]);
}

/**
 * The matches of a query, grouped by kind in `SEARCH_KINDS` order. Each
 * group lists at most `GROUP_LIMIT` results, those whose title starts with
 * the first word first (the travelogue stays newest first), and keeps the full count in `total`. An empty query
 * returns no groups.
 * @param {SearchSources} sources
 * @param {string} query
 * @param {SearchViewer} viewer
 * @returns {(SearchGroup & { total: number })[]}
 */
export function searchCampaign(sources, query, viewer) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  return SEARCH_KINDS.flatMap(([kind, label]) => {
    const all = matchesOf(kind, sources, terms, viewer);
    if (all.length === 0) return [];
    // The travelogue keeps its newest-first order, because a log line has no
    // name to rank by.
    const ranked =
      kind === 'log'
        ? all
        : [...all.filter((r) => leads(r, terms)), ...all.filter((r) => !leads(r, terms))];
    return [{ kind, label, results: ranked.slice(0, GROUP_LIMIT), total: all.length }];
  });
}
