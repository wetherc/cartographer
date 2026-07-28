import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal, confirmDelete } from '../ui/Modal.js';
import { mountTravelogPanel } from '../ui/TravelogPanel.js';
import { appendEntry, createEntry } from '../log/Travelogue.js';
import { mountNPCPanel } from '../ui/NPCPanel.js';
import { npcsAt, knownNpcsAt, formatLocation } from '../entities/NPC.js';
import { isGM } from '../view/ViewRole.js';
import { mountQuestPanel } from '../ui/QuestPanel.js';
import { createQuest, toggleQuestStatus } from '../quest/Quests.js';
import { mountHandoutPanel } from '../ui/HandoutPanel.js';
import { createHandout, toggleRevealed, handoutsAt } from '../handout/Handouts.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
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

  app.views.questPanel = mountQuestPanel(mustGetElement('quest-container'), {
    getQuests: () => state.quests,
    onToggle: (quest) => {
      state.quests = replaceById(state.quests, toggleQuestStatus(quest));
      app.actions.markDirty();
    },
    onAdd: async () => {
      const values = await promptModal('New quest', [
        { name: 'title', label: 'Title', value: '' },
        { name: 'notes', label: 'Notes', value: '' },
      ]);
      const title = values?.title.trim();
      if (!values || !title) return null;
      const created = createQuest(
        slugId(
          title,
          state.quests.map((q) => q.id),
        ),
        title,
        values.notes.trim(),
      );
      state.quests = [...state.quests, created];
      app.actions.markDirty();
      return created;
    },
    onEdit: async (quest) => {
      const values = await promptModal('Edit quest', [
        { name: 'title', label: 'Title', value: quest.title },
        { name: 'notes', label: 'Notes', value: quest.notes },
      ]);
      const title = values?.title.trim();
      if (!values || !title) return false;
      state.quests = replaceById(state.quests, { ...quest, title, notes: values.notes.trim() });
      app.actions.markDirty();
      return true;
    },
    onDelete: async (id) => {
      const quest = state.quests.find((q) => q.id === id);
      if (!quest) return false;
      const ok = await confirmDelete(quest.title);
      if (ok) {
        state.quests = removeById(state.quests, id);
        app.actions.markDirty();
      }
      return ok;
    },
    getRole: () => state.role,
  });

  app.views.handoutPanel = mountHandoutPanel(mustGetElement('handout-container'), {
    getHandouts: () => handoutsAt(state.handouts, app.partyTracker.getPosition().nodeId),
    onToggle: (handout) => {
      state.handouts = replaceById(state.handouts, toggleRevealed(handout));
      app.actions.markDirty();
    },
    onAdd: async () => {
      const values = await promptModal('New handout', [
        { name: 'title', label: 'Title', value: '' },
        { name: 'body', label: 'Read-aloud / lore', value: '' },
        { name: 'image', label: 'Image (optional)', type: 'file' },
      ]);
      const title = values?.title.trim();
      if (!values || !title) return null;
      // Bound to the node the party stands in, so it surfaces at that location.
      const created = createHandout(
        slugId(
          title,
          state.handouts.map((h) => h.id),
        ),
        title,
        values.body.trim(),
        app.partyTracker.getPosition().nodeId,
        false,
        values.image || null,
      );
      state.handouts = [...state.handouts, created];
      app.actions.markDirty();
      return created;
    },
    onEdit: async (handout) => {
      const values = await promptModal(
        'Edit handout',
        [
          { name: 'title', label: 'Title', value: handout.title },
          { name: 'body', label: 'Read-aloud / lore', value: handout.body },
          {
            name: 'image',
            label: 'Image (leave empty to keep)',
            type: 'file',
            value: handout.image ?? '',
          },
        ],
        { submitLabel: 'Save' },
      );
      const title = values?.title.trim();
      if (!values || !title) return false;
      state.handouts = replaceById(state.handouts, {
        ...handout,
        title,
        body: values.body.trim(),
        image: values.image || null,
      });
      app.actions.markDirty();
      return true;
    },
    onDelete: async (id) => {
      const handout = state.handouts.find((h) => h.id === id);
      if (!handout) return false;
      const ok = await confirmDelete(handout.title);
      if (ok) {
        state.handouts = removeById(state.handouts, id);
        app.actions.markDirty();
      }
      return ok;
    },
    getRole: () => state.role,
  });
}
