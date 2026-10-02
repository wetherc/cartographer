/**
 * The callbacks behind the expanded GM row of the quest log: the objective
 * edits, the link dialogs, and the link chips (see `ui/QuestDetail.js`).
 * The dialog function can be injected, so tests can run the logic with no
 * DOM, the same as `entityList.js`.
 */

import { confirmModal, promptModal } from '../ui/Modal.js';
import { applyFresh } from '../entities/Roster.js';
import {
  addObjective,
  allObjectivesDone,
  editObjective,
  toggleObjectiveDone,
  toggleObjectiveHidden,
} from '../quest/Objectives.js';
import { askCompletion, completeQuest } from './questCompletion.js';
import { addLink, creatureLink, linkKey, liveLinks, placeLink } from '../quest/QuestLinks.js';
import { displayCoords, tileIdFromDisplay } from '../map/TileCoords.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestLink} QuestLink */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The link to a place from the submitted place dialog, or null when the
 * chosen map is gone. Blank column and row fields link the whole map. A
 * typed position is clamped to the map's bounds, and a position with only
 * one of the two fields filled takes 1 for the other.
 * @param {MapNode | undefined} node
 * @param {Record<string, string>} values
 * @returns {QuestLink | null}
 */
export function readPlaceLink(node, values) {
  if (!node) return null;
  const column = values.tileX?.trim() ?? '';
  const row = values.tileY?.trim() ?? '';
  if (column === '' && row === '') return placeLink(node.id);
  return placeLink(
    node.id,
    tileIdFromDisplay(clampInt(column, 1, node.width, 1), clampInt(row, 1, node.height, 1)),
  );
}

/**
 * @param {AppContext} app
 * @param {{ prompt?: typeof promptModal, confirm?: typeof confirmModal }} [options]
 * @returns {import('../ui/QuestDetail.js').QuestDetailCallbacks & { linkTargets: () => unknown }}
 */
export function questDetailCallbacks(app, { prompt = promptModal, confirm = confirmModal } = {}) {
  const { state } = app;

  /** The current copy of a quest, or undefined once it is gone. @param {string} id */
  const current = (id) => state.quests.find((q) => q.id === id);

  /**
   * The questions that follow a checked objective. A GM-only objective of a
   * revealed quest can be revealed now, because the party usually learns a
   * step when it finishes it. The last open objective offers to complete the
   * quest. Each question reads the quest again, since the dialog before it
   * waits on the GM while another tab can save.
   * @param {Quest} quest
   * @param {string} id
   */
  async function afterDone(quest, id) {
    const objective = quest.objectives.find((o) => o.id === id);
    if (!objective?.done) return;
    if (
      quest.revealed &&
      objective.hidden &&
      (await confirm(`Players do not see "${objective.text}". Reveal it to them now?`, {
        title: 'Objective done',
        confirmLabel: 'Reveal to players',
        cancelLabel: 'Keep GM only',
      }))
    ) {
      write(quest, (q) =>
        q.objectives.find((o) => o.id === id)?.hidden ? toggleObjectiveHidden(q, id) : q,
      );
    }
    const latest = current(quest.id);
    if (latest?.status !== 'active' || !allObjectivesDone(latest.objectives)) return;
    const message = `Every objective of ${latest.title} is done. Complete the quest?`;
    const done = await askCompletion(app, latest, message, { prompt, confirm });
    if (done) completeQuest(app, latest, done);
  }

  /**
   * Apply `change` to the current copy of a quest. The copy the row drew
   * from can be stale: another tab may have changed or deleted the quest.
   * @param {Quest} quest
   * @param {(quest: Quest) => Quest} change
   * @returns {boolean} whether the quest changed
   */
  function write(quest, change) {
    const fresh = applyFresh(state.quests, quest.id, change);
    const before = state.quests.find((q) => q.id === quest.id);
    if (!fresh.entity) {
      app.toasts.show('That quest was deleted.');
      return false;
    }
    if (fresh.entity === before) return false;
    state.quests = fresh.list;
    app.actions.markDirty();
    return true;
  }

  /** The dialog fields of one objective. @param {{ text: string, hidden: boolean } | null} objective */
  const objectiveFields = (objective) => [
    { name: 'text', label: 'Objective', value: objective?.text ?? '' },
    {
      name: 'hidden',
      label: 'GM only (players do not see it)',
      type: /** @type {'checkbox'} */ ('checkbox'),
      value: objective?.hidden ?? false,
    },
  ];

  /** Every map, labelled by its breadcrumb path. */
  const nodeOptions = () =>
    [...app.grid.nodes.values()].map((n) => ({
      value: n.id,
      label: app.grid
        .getBreadcrumb(n.id)
        .map((b) => b.name)
        .join(' / '),
    }));

  /** @param {Quest} quest @returns {Promise<QuestLink | null>} */
  async function pickPlace(quest) {
    const values = await prompt(`Link a place to ${quest.title}`, [
      {
        name: 'nodeId',
        label: 'Map',
        type: 'select',
        value: app.navigator.getCurrentNode().id,
        options: nodeOptions(),
      },
      { name: 'tileX', label: 'Column (blank for the whole map)', type: 'number', min: 1 },
      { name: 'tileY', label: 'Row (blank for the whole map)', type: 'number', min: 1 },
    ]);
    return values ? readPlaceLink(app.grid.getNode(values.nodeId), values) : null;
  }

  /** @param {Quest} quest @returns {Promise<QuestLink | null>} */
  async function pickCreature(quest) {
    if (state.creatures.length === 0) {
      app.toasts.show('There are no creatures to link yet.');
      return null;
    }
    const options = [...state.creatures]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name }));
    const values = await prompt(`Link a creature to ${quest.title}`, [
      { name: 'creatureId', label: 'Creature', type: 'select', options },
    ]);
    const id = values?.creatureId;
    return id && state.creatures.some((c) => c.id === id) ? creatureLink(id) : null;
  }

  /**
   * The chip label and the open action of one live link. `liveLinks` has
   * already checked that its node or creature exists.
   * @param {QuestLink} link
   * @returns {import('../ui/QuestDetail.js').LinkChip}
   */
  function chipFor(link) {
    if (link.kind === 'place') {
      const node = /** @type {MapNode} */ (app.grid.getNode(link.nodeId));
      const shown = link.tileId ? displayCoords(link.tileId) : null;
      const middle = tileIdAt(Math.floor(node.width / 2), Math.floor(node.height / 2));
      return {
        key: linkKey(link),
        label: shown ? `${node.name} (${shown.column}, ${shown.row})` : node.name,
        onOpen: () =>
          app.actions.centerOnLocation({ nodeId: node.id, tileId: link.tileId ?? middle }),
      };
    }
    const creature = /** @type {import('../types/creature.js').Creature} */ (
      state.creatures.find((c) => c.id === link.creatureId)
    );
    const location = creature.location ?? null;
    return {
      key: linkKey(link),
      label: creature.name,
      onOpen:
        location && app.grid.getNode(location.nodeId)
          ? () => app.actions.centerOnLocation(location)
          : null,
    };
  }

  return {
    onChange: (quest, change) => write(quest, change),
    onToggleObjective: async (quest, id) => {
      if (!write(quest, (q) => toggleObjectiveDone(q, id))) return false;
      const fresh = /** @type {Quest} */ (current(quest.id));
      await afterDone(fresh, id);
      return true;
    },
    onAddObjective: async (quest) => {
      const values = await prompt(`New objective for ${quest.title}`, objectiveFields(null));
      const text = values?.text.trim();
      if (!values || !text) return false;
      return write(quest, (q) => addObjective(q, text, values.hidden === '1'));
    },
    onEditObjective: async (quest, objective) => {
      const values = await prompt('Edit objective', objectiveFields(objective), {
        submitLabel: 'Save',
      });
      const text = values?.text.trim();
      if (!values || !text) return false;
      return write(quest, (q) =>
        editObjective(q, objective.id, { text, hidden: values.hidden === '1' }),
      );
    },
    onAddLink: async (quest, kind) => {
      const link = await (kind === 'place' ? pickPlace(quest) : pickCreature(quest));
      return link ? write(quest, (q) => addLink(q, link)) : false;
    },
    describeLinks: (quest) =>
      liveLinks(
        quest.links,
        (id) => app.grid.getNode(id) !== undefined,
        (id) => state.creatures.some((c) => c.id === id),
      ).map(chipFor),
    linkTargets: () => state.creatures,
  };
}
