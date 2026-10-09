import { promptModal, confirmDelete } from '../ui/Modal.js';
import { addXP } from '../entities/Character.js';
import { isDead } from '../entities/DeathSaves.js';
import { payReward } from '../quest/QuestReward.js';
import {
  baseMaxHP,
  vitalsFields,
  applyVitals,
  basicsFields,
  applyBasics,
} from './characterEdit.js';
import { applyFresh, removeById } from '../entities/Roster.js';
import { moveCharacter } from '../party/CharacterTokens.js';
import { describeTile } from '../map/TileCoords.js';
import { clampInt } from '../util/num.js';
import { characterFields, characterFormChange, buildCharacter } from './characterCreate.js';
import { rosterIds } from './combatants.js';
import { partyAward } from '../combat/FightEnd.js';
import { locationFields, readLocation } from './locationFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The GM's roster controls: place one character, edit its name, scores,
 * proficiencies, HP, and AC, grant XP to one character or award it to the
 * party, and add or delete a character.
 * `partyWiring.js` passes these handlers to the roster panel, and each one
 * writes through the character scope that `partyWiring.js` owns.
 * @param {AppContext} app
 * @param {{
 *   scope: import('./characterScope.js').CharacterScope,
 *   selectCharacter: (id: string | null) => void,
 * }} party
 * @returns {Required<Pick<Parameters<typeof import('../ui/CharacterRoster.js').mountCharacterRoster>[1], 'onPlace' | 'onEditVitals' | 'onGrantXP' | 'onAdd' | 'onDelete' | 'onAwardXP'>>}
 */
export function rosterActions(app, { scope, selectCharacter }) {
  const { state } = app;
  return {
    // GM-only individual movement. Place one character at any node or tile,
    // or move the character back "with the party", without moving anyone
    // else. A map click moves the selected character across the node in
    // view. This function reaches any node.
    onPlace: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const values = await promptModal(
        `Move ${character.name}`,
        locationFields(app, character.location ?? { ...app.partyTracker.getPosition() }, {
          unplacedLabel: 'With the party',
        }),
        { submitLabel: 'Move' },
      );
      if (!values) return;
      const location = readLocation(app, values);
      state.characters = moveCharacter(state.characters, id, location);
      app.actions.syncPartyMarker();
      app.actions.markDirty();
      if (location) {
        const node = app.grid.getNode(location.nodeId);
        // A placed character sees around the tile, the same as a character
        // that walks there.
        if (node) {
          app.grid.updateNode(app.partyTracker.reveal(node, [location.tileId]));
          app.views.mapCanvas.refreshNode(app.navigator.getCurrentNode());
          app.views.regionTree.update();
        }
        app.actions.logEvent(
          'travel',
          `${character.name} moves to ${node?.name ?? location.nodeId} (${describeTile(location.tileId)}).`,
        );
        app.actions.maybeTriggerEncounter(location, character.name);
      } else {
        app.actions.logEvent('travel', `${character.name} rejoins the party.`);
      }
    },
    // The parts of a character a GM sets rather than earns: the name, the
    // ability scores, the proficiency lists, the maximum HP override, bonus
    // HP from an item or a boon, and the unarmored base AC that an effect
    // such as Mage Armor raises. Inline fields on the sheet would put edit
    // boxes in the middle of the numbers a player reads, so one dialog per
    // character keeps them together and keeps the sheet read-only.
    // `characterEdit.js` defines the fields and their rules.
    onEditVitals: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const shownMax = baseMaxHP(character);
      const [firstVital, ...restVitals] = vitalsFields(character);
      const values = await promptModal(
        `Edit ${character.name}`,
        [
          ...basicsFields(character),
          { ...firstVital, section: 'Hit points and AC' },
          ...restVitals,
        ],
        { submitLabel: 'Save', wide: true, submitRequires: ['name'] },
      );
      if (!values) return;
      // The edit applies to the character as it is now, not to the copy the
      // dialog opened with. A heal or a cross-tab save while the dialog was
      // open must survive the write-back. The scores go first, so a CON
      // edit moves a class-derived maximum before the HP fields apply.
      const fresh = applyFresh(state.characters, id, (current) =>
        applyVitals(applyBasics(current, values), values, shownMax),
      );
      if (!fresh.entity) {
        app.toasts.show(`${character.name} was removed while the dialog was open.`);
        return;
      }
      scope.commit(fresh.entity);
      scope.reselect();
    },
    // A one-off boon for one character, beside the party-wide award below.
    // The XP goes through addXP, so a level, its HP growth, and its spell
    // slots all follow as they do for the whole party.
    onGrantXP: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const values = await promptModal(
        `Grant XP to ${character.name}`,
        [{ name: 'amount', label: 'XP', type: 'number', value: 100, min: 1 }],
        { submitLabel: 'Grant' },
      );
      const amount = clampInt(values?.amount, 0);
      if (!values || amount <= 0) return;
      // The XP lands on the character as it is now. The pre-await copy may
      // miss a heal or a level that arrived while the dialog was open.
      const fresh = applyFresh(state.characters, id, (current) => addXP(current, amount));
      if (!fresh.entity) {
        app.toasts.show(`${character.name} was removed while the dialog was open.`);
        return;
      }
      scope.commit(fresh.entity);
      scope.reselect();
      app.actions.logEvent('note', `${character.name} is awarded ${amount} XP.`);
      app.toasts.show(`Awarded ${amount} XP to ${character.name}.`);
    },
    onAdd: async () => {
      const values = await promptModal('New character', characterFields(), {
        wide: true,
        onChange: characterFormChange,
      });
      if (!values || !values.name.trim()) return;
      const created = buildCharacter(values, rosterIds(state));
      state.characters = [...state.characters, created];
      selectCharacter(created.id);
      app.actions.markDirty();
    },
    onDelete: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const ok = await confirmDelete(character.name, 'Their inventory is lost too.');
      if (!ok) return;
      state.characters = removeById(state.characters, id);
      // A deleted character cannot keep a slot in a running fight: nothing
      // resolves the id any more. Without this, the row renders as an
      // unknown combatant whose turn cannot be played.
      app.actions.removeCombatant(id);
      if (id === scope.getSelectedId()) selectCharacter(state.characters[0]?.id ?? null);
      else scope.reselect();
      app.actions.markDirty();
    },
    // Grant the same XP to the whole party at once. This is the common case
    // after an encounter, instead of opening each sheet in turn. Levels, HP
    // growth, and spell-slot progression from addXP still apply per
    // character as usual.
    // The GM can type the XP each character gets, or a total for the app to
    // split. The amount's caption restates the result on every edit, so a
    // split needs no sums by hand. A dead character gets no share and does
    // not count toward the split, as with fight and quest rewards.
    onAwardXP: async () => {
      const count = state.characters.filter((c) => !isDead(c)).length;
      /** @param {string} mode @param {string} amount */
      const award = (mode, amount) =>
        partyAward(mode === 'total' ? 'total' : 'each', Number(amount) || 0, count);
      const values = await promptModal(
        'Award XP to the party',
        [
          {
            name: 'mode',
            label: 'Award',
            type: 'select',
            options: [
              { value: 'each', label: 'The same XP to each character' },
              { value: 'total', label: 'A total, split evenly' },
            ],
            value: 'each',
          },
          {
            name: 'amount',
            label: award('each', '100').caption,
            type: 'number',
            value: 100,
            min: 1,
          },
        ],
        {
          submitLabel: 'Award',
          onChange: (_name, form) =>
            form.setLabel('amount', award(form.get('mode'), form.get('amount')).caption),
        },
      );
      if (!values) return;
      const per = values.mode === 'total' ? 'total' : 'each';
      const paid = payReward(state.characters, { per, gp: 0, xp: Number(values.amount) || 0 });
      if (paid.xp <= 0) return;
      state.characters = paid.characters;
      scope.reselect(); // refresh the sheet, inventory, and roster
      app.actions.markDirty();
      app.actions.logEvent('note', `The party is awarded ${paid.xp} XP each.`);
      app.toasts.show(
        `Awarded ${paid.xp} XP to ${paid.count} character${paid.count === 1 ? '' : 's'}.`,
      );
    },
  };
}
