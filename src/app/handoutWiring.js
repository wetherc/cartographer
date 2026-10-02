import { mustGetElement } from '../ui/dom.js';
import { mountHandoutPanel } from '../ui/HandoutPanel.js';
import {
  createHandout,
  toggleRevealed,
  handoutsFor,
  handoutRevealLine,
  revealedFor,
} from '../handout/Handouts.js';
import {
  describeHandout,
  parseAudience,
  parsePlace,
  placeOptions,
  placeValue,
} from '../handout/HandoutForm.js';
import { replaceById } from '../entities/Roster.js';
import { isGM } from '../view/ViewRole.js';
import { wireEntityList } from './entityList.js';
import { wireHandoutCue } from './handoutCue.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('./../handout/HandoutForm.js').HandoutPlace} HandoutPlace */

/**
 * The handout dialog's fields. `preset` is the tile a new handout starts
 * on when the GM adds it from the tile inspector.
 * @param {AppContext} app
 * @param {Handout | null} handout
 * @param {HandoutPlace | null} preset
 * @returns {import('../types/modal.js').ModalField[]}
 */
export function handoutFields(app, handout, preset) {
  const party = app.partyTracker.getPosition();
  /** @type {HandoutPlace[]} */
  const places = [
    { nodeId: null, tileId: null },
    { nodeId: party.nodeId, tileId: null },
    { nodeId: party.nodeId, tileId: party.tileId },
  ];
  for (const place of [handout, preset]) {
    if (place?.nodeId) places.push({ nodeId: place.nodeId, tileId: null }, place);
  }
  const start = handout ?? preset ?? { nodeId: party.nodeId, tileId: null };
  return [
    { name: 'title', label: 'Title', value: handout?.title ?? '' },
    { name: 'body', label: 'Read-aloud / lore', value: handout?.body ?? '' },
    handout
      ? {
          name: 'image',
          label: 'Image (leave empty to keep)',
          type: 'file',
          value: handout.image ?? '',
        }
      : { name: 'image', label: 'Image (optional)', type: 'file' },
    {
      name: 'where',
      label: 'Shows at',
      type: 'select',
      value: placeValue(start),
      options: placeOptions(places, (id) => app.grid.getNode(id)?.name ?? id, party),
    },
    {
      name: 'audience',
      label: 'Only for (none checked: every player)',
      type: 'multiselect',
      value: handout?.audience?.join(',') ?? '',
      options: app.state.characters.map((c) => ({ value: c.id, label: c.name })),
      emptyText: 'The party has no characters yet.',
    },
  ];
}

/**
 * Fold the submitted dialog into a handout. The reveal flag stays as it
 * was, so a new handout starts hidden.
 * @param {Handout} handout
 * @param {string} title the trimmed title
 * @param {Record<string, string>} values the submitted dialog
 * @returns {Handout}
 */
export function patchHandout(handout, title, values) {
  const place = parsePlace(values.where);
  return {
    ...handout,
    title,
    body: values.body.trim(),
    image: values.image || null,
    nodeId: place.nodeId,
    tileId: place.tileId,
    audience: parseAudience(values.audience),
  };
}

/**
 * Wires the Story tab's handouts panel, its add and edit dialog, and the
 * `addHandoutAt` action that the tile inspector calls. The panel lists what
 * `handoutsFor` or `revealedFor` returns for this tab. A GM gets every handout of the
 * party's node. A player tab gets every revealed handout for the tab's own
 * character, with the ones of the party's spot first.
 * @param {AppContext} app
 */
export function wireHandouts(app) {
  const { state } = app;
  /** The tile the next new handout starts on, set only while the inspector's
   * dialog is open. @type {HandoutPlace | null} */
  let preset = null;
  /** The ids of the rows in the "Revealed earlier" group. @type {Set<string>} */
  let earlierIds = new Set();

  /**
   * Reveal or hide a handout, and log it. The map badge of a hidden handout
   * follows the change.
   * @param {Handout} handout
   */
  function toggle(handout) {
    const next = toggleRevealed(handout);
    state.handouts = replaceById(state.handouts, next);
    // logEvent saves the change.
    app.actions.logEvent('note', ...handoutRevealLine(next));
    app.actions.syncCreatureMarkers();
  }
  wireHandoutCue(app, (id) => {
    const handout = state.handouts.find((h) => h.id === id);
    if (!handout || handout.revealed) return;
    toggle(handout);
    app.views.handoutPanel.update();
  });

  const handoutList = markersAfter(
    wireEntityList(app, {
      key: 'handouts',
      noun: 'handout',
      fields: (handout) => handoutFields(app, handout, preset),
      create: (id, title, values) => patchHandout(createHandout(id, title), title, values),
      patch: patchHandout,
      editOptions: { submitLabel: 'Save' },
    }),
    () => app.actions.syncCreatureMarkers(),
  );

  app.views.handoutPanel = mountHandoutPanel(mustGetElement('handout-container'), {
    getHandouts: () => {
      const gm = isGM(state.role);
      const boundCharacterId = gm ? null : (app.actions.getBoundCharacterId?.() ?? null);
      const position = app.partyTracker.getPosition();
      if (gm) return handoutsFor(state.handouts, position, { gm, boundCharacterId });
      const { here, earlier } = revealedFor(state.handouts, position, boundCharacterId);
      earlierIds = new Set(earlier.map((h) => h.id));
      return [...here, ...earlier];
    },
    groupOf: (handout) => (earlierIds.has(handout.id) ? 'Revealed earlier' : null),
    describe: (handout) =>
      describeHandout(handout, (id) => state.characters.find((c) => c.id === id)?.name),
    // The notes name characters, which the handout rows do not change with.
    dependsOn: () => state.characters,
    onToggle: toggle,
    ...handoutList,
    getRole: () => state.role,
  });

  app.actions.addHandoutAt = async (nodeId, tileId) => {
    preset = { nodeId, tileId };
    try {
      const created = await handoutList.onAdd();
      if (!created) return;
      app.views.handoutPanel.update();
      // The panel lists the party's node, so a handout placed elsewhere does
      // not appear there yet.
      const where = created.nodeId;
      if (where !== null && where !== app.partyTracker.getPosition().nodeId) {
        const node = app.grid.getNode(where)?.name ?? where;
        app.toasts.show(
          `Added "${created.title}". It lists under Handouts while the party is in ${node}.`,
        );
      }
    } finally {
      preset = null;
    }
  };
}

/**
 * The list callbacks, each followed by a redraw of the map badges, because
 * an add, an edit, or a delete can change which tiles have a hidden handout.
 * @param {ReturnType<typeof wireEntityList<'handouts'>>} list
 * @param {() => void} sync
 */
function markersAfter(list, sync) {
  return {
    onAdd: async () => {
      const created = await list.onAdd();
      sync();
      return created;
    },
    /** @param {Handout} handout */
    onEdit: async (handout) => {
      const saved = await list.onEdit(handout);
      sync();
      return saved;
    },
    /** @param {string} id */
    onDelete: async (id) => {
      const deleted = await list.onDelete(id);
      sync();
      return deleted;
    },
  };
}
