import { promptModal, confirmDelete } from '../ui/Modal.js';
import { addXP, getHP, setMaxHP, setBonusHP, setBaseAC } from '../entities/Character.js';
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
 * The GM's roster controls: place one character, edit its HP and AC, grant XP
 * to one character or award it to the party, and add or delete a character.
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
    // The numbers a GM sets rather than a character earns: the maximum HP
    // The numbers a GM sets rather than a character earns: the maximum HP
    // override, bonus HP from an item or a boon, and the unarmored base AC
    // that an effect such as Mage Armor raises. Inline fields on the sheet
    // put three edit boxes in the middle of the numbers a player reads, so
    // one dialog per character keeps them together and keeps the sheet
    // read-only.
    onEditVitals: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const hp = getHP(character);
      // A character with no HP pool authored yet gets the AC field alone.
      // Max HP is the pool's own number, so there is nothing to override.
      /** @type {import('../types/modal.js').ModalField[]} */
      const fields = [];
      if (hp) {
        fields.push(
          { name: 'maxHP', label: 'Max HP', type: 'number', value: hp.max, min: 1 },
          {
            name: 'bonusHP',
            label: 'Bonus HP (temporary)',
            type: 'number',
            value: character.bonusHP ?? 0,
            min: 0,
          },
        );
      }
      fields.push({
        name: 'baseAC',
        label: 'Unarmored base AC',
        type: 'number',
        value: character.baseAC ?? 10,
        min: 1,
      });
      const values = await promptModal(`${character.name}: HP and AC`, fields, {
        submitLabel: 'Save',
      });
      if (!values) return;
      // The edit applies to the character as it is now, not to the copy the
      // dialog opened with. A heal or a cross-tab save while the dialog was
      // open must survive the write-back.
      const fresh = applyFresh(state.characters, id, (current) => {
        let next = current;
        const liveHP = getHP(current);
        if (hp && liveHP) {
          // Cutting the maximum takes current HP down with it, and bonus HP
          // is a separate pool that damage drains before the intrinsic one.
          next = setMaxHP(next, clampInt(values.maxHP, liveHP.max));
          next = setBonusHP(next, clampInt(values.bonusHP, 0));
        }
        // Base AC applies only while no body armor is worn. The sheet's AC
        // badge shows the derived result either way.
        return setBaseAC(next, clampInt(values.baseAC, 10));
      });
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
    // split needs no sums by hand.
    onAwardXP: async () => {
      const count = state.characters.length;
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
      const amount = award(values.mode, values.amount).each;
      if (amount <= 0) return;
      state.characters = state.characters.map((c) => addXP(c, amount));
      scope.reselect(); // refresh the sheet, inventory, and roster
      app.actions.markDirty();
      app.actions.logEvent('note', `The party is awarded ${amount} XP each.`);
      app.toasts.show(
        `Awarded ${amount} XP to ${state.characters.length} character${state.characters.length === 1 ? '' : 's'}.`,
      );
    },
  };
}
