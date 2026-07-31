import { mustGetElement } from '../ui/dom.js';
import { confirmModal, confirmDelete } from '../ui/Modal.js';
import { mountTravelogPanel } from '../ui/TravelogPanel.js';
import { appendEntry, createEntry } from '../log/Travelogue.js';
import { mountNPCPanel } from '../ui/NPCPanel.js';
import { npcsAt, knownNpcsAt, formatLocation } from '../entities/NPC.js';
import { isGM } from '../view/ViewRole.js';
import { mountQuestPanel } from '../ui/QuestPanel.js';
import { createQuest, toggleQuestStatus } from '../quest/Quests.js';
import { mountHandoutPanel } from '../ui/HandoutPanel.js';
import { createHandout, toggleRevealed, handoutsAt } from '../handout/Handouts.js';
import { replaceById, removeById } from '../entities/Roster.js';
import { wireEntityList } from './entityList.js';
import { npcForm } from './npcForm.js';
import { commitNPCs } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The Story tab's panels — travelogue, NPCs, quests, handouts — plus the
 * `logEvent` action every module records travelogue entries through.
 * @param {AppContext} app
 */
export function wireStory(app) {
  const { state } = app;

  /** Monotonic counter making travelogue entry ids unique within a session. */
  let logSeq = 0;

  /**
   * Record a travelogue event and refresh the panel. Ids combine the clock with
   * a session counter so two events in the same millisecond never collide.
   * @param {import('../types/log.js').LogEntryKind} kind
   * @param {string} message
   */
  app.actions.logEvent = (kind, message) => {
    const now = Date.now();
    state.travelog = appendEntry(
      state.travelog,
      createEntry(`log-${now}-${logSeq++}`, kind, message, now),
    );
    app.views.travelogPanel.update();
    // The combat screen's log column shows the same entries; without this a
    // line that changes no combatant (a missed attack, a plain roll) never
    // reached it. Outside a fight the screen is empty and the call is a no-op.
    app.views.combatScreen.update();
    app.actions.markDirty();
  };

  app.views.travelogPanel = mountTravelogPanel(mustGetElement('travelog-container'), {
    getEntries: () => state.travelog,
    onClear: async () => {
      if (state.travelog.length === 0) return false;
      const ok = await confirmModal('Clear the travelogue? Its recorded events are lost.', {
        danger: true,
        confirmLabel: 'Clear',
      });
      if (ok) {
        state.travelog = [];
        app.actions.markDirty();
      }
      return ok;
    },
  });

  /** Confirm-and-delete shared by both NPC lists. */
  const deleteNPC = (/** @type {string} */ id) => {
    state.npcs = removeById(state.npcs, id);
    commitNPCs(app);
  };
  const confirmDeleteNPC = (/** @type {import('../types/npc.js').NPC} */ npc) =>
    confirmDelete(npc.name);

  app.views.npcPanel = mountNPCPanel(mustGetElement('npc-container'), {
    // Players only learn of a placed NPC once the party has landed on its
    // tile; the GM sees the whole node's roster, with unmet ones flagged.
    getNPCs: () =>
      isGM(state.role)
        ? npcsAt(state.npcs, app.partyTracker.getPosition())
        : knownNpcsAt(state.npcs, app.partyTracker.getPosition()),
    getLocationLabel: (npc) => {
      const label = formatLocation(npc.location, (id) => app.grid.getNode(id)?.name);
      return npc.location && !npc.met ? `${label} — not yet met` : label;
    },
    onDelete: deleteNPC,
    // New NPCs from the Story tab default to where the party stands.
    onAdd: () => npcForm(app, null, { ...app.partyTracker.getPosition() }),
    onEdit: (npc) => npcForm(app, npc, null),
    confirmDelete: confirmDeleteNPC,
    getRole: () => state.role,
  });

  // The Build rail's NPC authoring list (the NPCs subtab beside the mob
  // roster): the NPCs placed in whatever node the GM is looking at, plus
  // unplaced ones, editable without moving the party there. New NPCs default
  // onto the Build-mode selected tile of the viewed node.
  app.views.buildNPCs = mountNPCPanel(mustGetElement('build-npcs-container'), {
    getNPCs: () => npcsAt(state.npcs, { nodeId: app.navigator.getCurrentNode().id }),
    getLocationLabel: (npc) => formatLocation(npc.location, (id) => app.grid.getNode(id)?.name),
    onDelete: deleteNPC,
    onAdd: () =>
      npcForm(app, null, {
        nodeId: app.navigator.getCurrentNode().id,
        tileId: app.actions.getSelectedTileId() ?? '0,0',
      }),
    onEdit: (npc) => npcForm(app, npc, null),
    confirmDelete: confirmDeleteNPC,
    getRole: () => state.role,
    pinAdd: true, // lead with "New NPC", matching the Mobs subtab
  });

  const questList = wireEntityList(app, {
    key: 'quests',
    noun: 'quest',
    fields: (quest) => [
      { name: 'title', label: 'Title', value: quest?.title ?? '' },
      { name: 'notes', label: 'Notes', value: quest?.notes ?? '' },
    ],
    create: (id, title, values) => createQuest(id, title, values.notes.trim()),
    patch: (quest, title, values) => ({ ...quest, title, notes: values.notes.trim() }),
  });

  app.views.questPanel = mountQuestPanel(mustGetElement('quest-container'), {
    getQuests: () => state.quests,
    onToggle: (quest) => {
      state.quests = replaceById(state.quests, toggleQuestStatus(quest));
      app.actions.markDirty();
    },
    ...questList,
    getRole: () => state.role,
  });

  const handoutList = wireEntityList(app, {
    key: 'handouts',
    noun: 'handout',
    fields: (handout) => [
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
    ],
    // A new handout is bound to the node the party stands in, so it surfaces at
    // that location.
    create: (id, title, values) =>
      createHandout(
        id,
        title,
        values.body.trim(),
        app.partyTracker.getPosition().nodeId,
        false,
        values.image || null,
      ),
    patch: (handout, title, values) => ({
      ...handout,
      title,
      body: values.body.trim(),
      image: values.image || null,
    }),
    editOptions: { submitLabel: 'Save' },
  });

  app.views.handoutPanel = mountHandoutPanel(mustGetElement('handout-container'), {
    getHandouts: () => handoutsAt(state.handouts, app.partyTracker.getPosition().nodeId),
    onToggle: (handout) => {
      state.handouts = replaceById(state.handouts, toggleRevealed(handout));
      app.actions.markDirty();
    },
    ...handoutList,
    getRole: () => state.role,
  });
}
