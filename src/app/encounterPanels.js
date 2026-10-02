import { viewedPlacement } from './locationFields.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmDelete, confirmModal, alertModal } from '../ui/Modal.js';
import { openContextMenu } from '../ui/ContextMenu.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountBuildEncounterPanel } from '../ui/BuildEncounterPanel.js';
import { toTemplate } from '../entities/CreatureTemplate.js';
import {
  clearableDefeated,
  creaturesAt,
  creaturesNear,
  creaturesOnTile,
  discoveredHostiles,
  hostileGroup,
} from '../entities/CreatureMap.js';
import { isDefeated } from '../entities/Creature.js';
import { difficultyLine } from '../entities/EncounterDifficulty.js';
import { arrivalAlert } from '../combat/Arrival.js';
import { encounterLabels } from '../combat/DisplayNames.js';
import {
  combatRoster,
  creatureParticipant,
  initiativeLine,
  nearbyRadius,
} from '../combat/CombatRoster.js';
import { rollInitiative } from '../combat/InitiativeRoll.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM } from '../view/ViewRole.js';
import { addLethargy } from './lethargy.js';
import {
  creatureForm,
  deleteCreature,
  addFromLibrary,
  clearDefeated,
  removeTemplate,
} from './creatureForm.js';
import { commitCreatures } from './combatants.js';
import { logDefeatTransition, storeCreature } from './combatantWrites.js';
import { setCombatantExhaustion } from './exhaustion.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the panels that list creatures by place: the Encounters
 * panel of the Play sidebar, the Build rail's foe list, and the Build-mode
 * right-click menu of a tile. It also registers `maybeTriggerEncounter`, the
 * alert when the party walks into a threat. The running fight is in
 * `encounterWiring.js`, which calls this function and passes the start of a
 * fight in as `onStartCombat`.
 * @param {AppContext} app
 * @param {{ onStartCombat: () => Promise<void> }} fight
 */
export function wireEncounterPanels(app, { onStartCombat }) {
  const { state } = app;

  /**
   * If a threat stands at the party's tile or next to it, show it in a
   * modal over the map. A threat is an undefeated hostile creature of the
   * encounter group (see `hostileGroup`), so foes staged on neighbouring
   * tiles show in one alert. A friendly or neutral creature is not a
   * threat: it lists in the NPCs panel and the travelogue announces meeting
   * it, but no modal opens. The first-meeting travelogue line lives in
   * `meetCreaturesHere` (mapTravel.js), on the same arrival path.
   *
   * The threat stays in place: a party that flees or ignores it still sees it
   * in the sidebar for that node. The readout follows the viewer role. The
   * GM sees exact HP and, with no fight running, a Set up combat button that
   * opens the combat setup at once, next to Not now. A player sees the
   * coarse status band and one Continue button, because only the GM starts
   * a fight. The app calls this after a real move, not on the initial
   * render, so a fresh load does not show a popup. It defaults to the whole
   * party at its shared position. A player who moves their own token passes
   * that character's tile and name instead.
   * @param {import('../types/map.js').PartyPosition} [position]
   * @param {string} [subject]
   */
  async function encounterAlert(position = app.partyTracker.getPosition(), subject = 'The party') {
    const here = hostileGroup(state.creatures, position);
    if (here.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    const gm = isGM(state.role);
    const alert = arrivalAlert(here, { gm, subject, region });
    if (!alert) return;
    // The combat setup draws its roster from the party's shared position, so
    // an alert for one character's token elsewhere offers no setup.
    const party = app.partyTracker.getPosition();
    const atParty = position.nodeId === party.nodeId && position.tileId === party.tileId;
    if (!gm || !atParty || !canStartCombat()) {
      await alertModal(alert.message, { title: alert.title, label: 'Continue' });
      return;
    }
    const fight = await confirmModal(alert.message, {
      title: alert.title,
      confirmLabel: 'Set up combat',
      cancelLabel: 'Not now',
    });
    if (fight) await onStartCombat();
  }

  // The handout cue waits for the encounter dialog, so the two never stack.
  app.actions.maybeTriggerEncounter = async (position, subject) => {
    await encounterAlert(position, subject);
    app.actions.cueHandouts();
  };

  // The two tabs share one numbering of the foes that share a name, so two
  // wolves never both read "Wolf 1". A foe of the fight takes the label the
  // fight gives it. With no fight running, the fight is the one Start combat
  // would begin here, so the setup dialog shows the same labels. A defeated
  // foe leaves the Active tab but stays in a running fight's count.
  /** @type {Map<string, string>} */
  let labels = new Map();

  /**
   * The hostiles of both tabs, and their labels. The Active tab lists the
   * encounter group, and the Nearby tab lists the other hostiles in range.
   */
  function encounterLists() {
    const position = app.partyTracker.getPosition();
    const group = hostileGroup(state.creatures, position);
    const hereIds = new Set(group.map((c) => c.id));
    const list = isGM(state.role)
      ? creaturesNear(
          state.creatures,
          position,
          nearbyRadius(app.partyTracker.revealRadius),
        ).filter((c) => c.disposition === 'hostile')
      : // A player needs no record of a fallen foe, so a defeated one
        // leaves the players' list.
        discoveredHostiles(
          state.creatures,
          position,
          app.grid.getNode(position.nodeId) ?? null,
        ).filter((c) => !isDefeated(c));
    const nearby = list.filter((c) => !hereIds.has(c.id));
    const fight = state.combat?.order ?? combatRoster(state.characters, state.creatures, position);
    labels = encounterLabels(
      [...state.characters, ...state.creatures],
      fight.map((p) => p.id),
      [hereIds, nearby.map((c) => c.id)],
    );
    return { group, nearby };
  }

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what is relevant to the party's current position,
    // split into two tabs. The Active tab lists the undefeated hostiles of
    // the encounter group: the party's tile and the tiles around it. These
    // raised the arrival alert, and they are the foes a fight started here
    // draws in. A friendly or neutral creature stays in the NPCs panel. The
    // Nearby tab lists the remaining hostiles within range. For the GM, this
    // means hostile creatures within four times the fog reveal radius of the
    // party, plus unplaced ones. For a player, this means only discovered
    // hostiles that still stand: one on a tile the fog has revealed, or an
    // unplaced one the party walked into.
    getActiveEncounters: () => encounterLists().group,
    getLabel: (c) => labels.get(c.id) ?? c.name,
    // The hint rates the same list the Active tab shows, so what the GM reads
    // is the fight the Start combat button would begin.
    getDifficulty: () =>
      difficultyLine(
        state.characters,
        hostileGroup(state.creatures, app.partyTracker.getPosition()),
      ),
    getNearbyEncounters: () => encounterLists().nearby,
    getPosition: () => app.partyTracker.getPosition(),
    onUpdate: (edited) => {
      // Log the transition into defeat exactly once. Compare against the
      // pre-update creature so damage that keeps it down does not log again.
      const prev = state.creatures.find((c) => c.id === edited.id);
      // A hand edit that removes Haste leaves lethargy, as any other end does.
      const next = prev ? addLethargy(app, prev, edited) : edited;
      if (prev) logDefeatTransition(app, prev, next);
      // An HP or chip edit can also break the spell the creature holds.
      storeCreature(app, prev ?? next, next, (c) => {
        state.creatures = replaceById(state.creatures, c);
      });
      // The panel re-renders its own rows once this call resolves. It skips
      // that part of the refresh.
      commitCreatures(app, { panel: false });
    },
    onDelete: (id) => {
      state.creatures = removeById(state.creatures, id);
      app.actions.removeCombatant(id);
      commitCreatures(app, { panel: false });
    },
    // Exhaustion goes through the app write, not through onUpdate, because the
    // sixth level takes the creature to 0 HP and logs both facts.
    onSetExhaustion: (encounter, level) => setCombatantExhaustion(app, encounter.id, level),
    // Authoring, including new foes and spawning from the bestiary, lives
    // in the Build rail. The Play panel edits an existing creature's HP and
    // placement, and saves one as a template mid-session.
    onEdit: (creature) => creatureForm(app, creature, null),
    // Save a creature's blueprint (name, max HP, stat block) to the
    // bestiary. This avoids typing the next Goblin from scratch. Saves with
    // the same name stack as separate templates, because a template is a
    // snapshot, not a live link.
    onSaveTemplate: (creature) => {
      state.bestiary = [
        ...state.bestiary,
        toTemplate(
          slugId(
            creature.name,
            state.bestiary.map((t) => t.id),
          ),
          creature,
        ),
      ];
      app.actions.markDirty();
      app.toasts.show(`Saved "${creature.name}" to the bestiary.`);
    },
    confirmDelete: (creature) => confirmDelete(creature.name),
    canStartCombat,
    onStartCombat,
    getRole: () => state.role,
    // A hostile on the Nearby tab can join a running fight it is not part
    // of. It rolls initiative as it joins and takes its place in the order.
    canAddToFight: (c) =>
      isGM(state.role) &&
      state.combat !== null &&
      c.disposition === 'hostile' &&
      !isDefeated(c) &&
      !state.combat.order.some((p) => p.id === c.id),
    onAddToFight: (c) => {
      const participant = creatureParticipant(c);
      const { value, note } = rollInitiative(participant, c);
      app.actions.logEvent(
        'roll',
        initiativeLine([{ name: labels.get(c.id) ?? c.name, value, note }]),
      );
      app.actions.addCombatant({ ...participant, initiative: value });
      app.views.encounterPanel.update();
    },
  });

  // This is the Build rail's foe authoring list. It lists the hostile
  // creatures staged in the node the GM is viewing, plus unplaced ones, and
  // lets the GM edit them without moving the party there. A new foe
  // defaults to the Build-mode selected tile of the viewed node, so the GM
  // can select a tile and add a foe there directly.
  app.views.buildFoes = mountBuildEncounterPanel(mustGetElement('build-encounters-container'), {
    getEncounters: () =>
      creaturesAt(state.creatures, {
        nodeId: app.navigator.getCurrentNode().id,
      }).filter((c) => c.disposition === 'hostile'),
    onAdd: () =>
      creatureForm(app, null, viewedPlacement(app), { disposition: 'hostile', level: 1 }),
    onAddFromTemplate: () => addFromLibrary(app),
    onRemoveTemplate: async () => {
      if (await removeTemplate(app)) app.views.buildFoes.update();
    },
    templateCount: () => state.bestiary.length,
    onClearDefeated: () => clearDefeated(app, app.navigator.getCurrentNode().id),
    defeatedCount: () =>
      clearableDefeated(state.creatures, state.combat, app.navigator.getCurrentNode().id).length,
    onEdit: (creature) => creatureForm(app, creature, null),
    onDelete: (creature) => deleteCreature(app, creature),
    // Persist base stat edits from the Build rail's chips. The Play panel
    // shows the same creature and picks up the change.
    onUpdate: (edited) => {
      const prev = state.creatures.find((c) => c.id === edited.id);
      const next = prev ? addLethargy(app, prev, edited) : edited;
      storeCreature(app, prev ?? next, next, (c) => {
        state.creatures = replaceById(state.creatures, c);
      });
      app.views.encounterPanel.update();
      app.actions.markDirty();
    },
    // Selecting a placed creature moves the map view to its staged location.
    onFocus: (creature) => {
      if (creature.location) app.actions.focusLocation(creature.location);
    },
  });

  /**
   * This is the Build-mode right-click menu for a tile of the viewed node.
   * It opens at the pointer. It can create a new foe or NPC on that tile,
   * or edit one already staged there. Every choice opens the one shared
   * creature dialog. The two "New" items differ only in their seed: a foe
   * starts as a level-1 hostile, and an NPC starts as an unleveled neutral.
   * @param {number} x
   * @param {number} y
   * @param {number} clientX
   * @param {number} clientY
   */
  app.actions.openEncounterContextMenu = (x, y, clientX, clientY) => {
    const location = {
      nodeId: app.navigator.getCurrentNode().id,
      tileId: tileIdAt(x, y),
    };
    const here = creaturesOnTile(state.creatures, location);
    openContextMenu(
      [
        {
          label: 'New foe here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'hostile', level: 1 }),
        },
        {
          label: 'New NPC here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'neutral' }),
        },
        ...here.map((c) => ({
          label: `Edit ${c.name}`,
          onSelect: () => creatureForm(app, c, null),
        })),
      ],
      { clientX, clientY },
    );
  };

  // Only the GM can start combat. The button shows only to the GM, and only
  // while an undefeated hostile stands in the encounter group of the party,
  // with no fight running. To fight a friendly or neutral creature, the GM
  // first sets its disposition to hostile.
  function canStartCombat() {
    return (
      isGM(state.role) &&
      state.combat === null &&
      hostileGroup(state.creatures, app.partyTracker.getPosition()).length > 0
    );
  }
}
