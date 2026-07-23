import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal } from '../ui/Modal.js';
import { createCharacter, withHP, shortRest, longRest, addXP } from '../entities/Character.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { mountCharacterRoster } from '../ui/CharacterRoster.js';
import { mountCharacterSheet } from '../ui/CharacterSheet.js';
import { mountInventoryPanel } from '../ui/InventoryPanel.js';
import { mountTimePanel } from '../ui/TimePanel.js';
import { advanceWatches, advanceToDawn, formatClock } from '../time/GameClock.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The party's panels — roster, character sheet, inventory — and the Time panel
 * (rests restore the same character resources). Owns the selected-character
 * scope; registers `selectCharacter` on `app.actions` so other modules (e.g.
 * condition ticks at a new combat round) can refresh the sheet.
 * @param {AppContext} app
 */
export function wireParty(app) {
  const { state } = app;

  /** @type {string | null} id of the character the sheet/inventory are scoped to */
  let selectedCharacterId = state.characters[0]?.id ?? null;

  /** @returns {Character | null} */
  function selectedCharacter() {
    return state.characters.find((c) => c.id === selectedCharacterId) ?? null;
  }

  /**
   * Point the sheet and inventory at a character (or null) and refresh the roster.
   * @param {string | null} id
   */
  function selectCharacter(id) {
    selectedCharacterId = id;
    const character = selectedCharacter();
    characterSheet.setCharacter(character);
    inventoryPanel.setCharacter(character);
    characterRoster.update();
  }
  app.actions.refreshSelectedCharacter = () => selectCharacter(selectedCharacterId);

  /**
   * Write an edited character back into the roster by id.
   * @param {Character} next
   */
  function commitCharacter(next) {
    state.characters = replaceById(state.characters, next);
    characterRoster.update();
    app.actions.markDirty();
  }

  const characterRoster = mountCharacterRoster(mustGetElement('party-container'), {
    getCharacters: () => state.characters,
    getSelectedId: () => selectedCharacterId,
    onSelect: selectCharacter,
    onAdd: async () => {
      const values = await promptModal('New character', [
        { name: 'name', label: 'Name', value: '' },
        { name: 'race', label: 'Race', value: '' },
        { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
        {
          name: 'caster',
          label: 'Spellcaster',
          type: 'select',
          value: 'no',
          options: [
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes (spell slots by level)' },
          ],
        },
      ]);
      const name = values?.name.trim();
      if (!values || !name) return;
      const maxHP = Math.max(1, Number(values.maxHP) || 1);
      let created = withHP(
        createCharacter(slugId(name, state.characters.map((c) => c.id)), name, {}, values.race.trim()),
        maxHP,
      );
      if (values.caster === 'yes') created = withSpellSlots(created);
      state.characters = [...state.characters, created];
      selectCharacter(state.characters[state.characters.length - 1].id);
      app.actions.markDirty();
    },
    onDelete: async (id) => {
      const character = state.characters.find((c) => c.id === id);
      if (!character) return;
      const ok = await confirmModal(`Delete "${character.name}"? Their inventory is lost too.`, {
        danger: true,
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      state.characters = removeById(state.characters, id);
      selectCharacter(id === selectedCharacterId ? (state.characters[0]?.id ?? null) : selectedCharacterId);
      app.actions.markDirty();
    },
    // Grant the same XP to the whole party at once — the common post-encounter
    // case — instead of opening each sheet in turn. Levels (and the HP growth
    // and spell-slot progression addXP applies) land per character as usual.
    onAwardXP: async () => {
      const values = await promptModal(
        'Award XP to the party',
        [{ name: 'amount', label: 'XP per character', type: 'number', value: 100, min: 1 }],
        { submitLabel: 'Award' },
      );
      const amount = Math.floor(Number(values?.amount) || 0);
      if (!values || amount <= 0) return;
      state.characters = state.characters.map((c) => addXP(c, amount));
      selectCharacter(selectedCharacterId); // refresh sheet/inventory/roster
      app.actions.markDirty();
      app.actions.logEvent('note', `The party is awarded ${amount} XP each.`);
      app.toasts.show(
        `Awarded ${amount} XP to ${state.characters.length} character${state.characters.length === 1 ? '' : 's'}.`,
      );
    },
  });

  const characterSheet = mountCharacterSheet(
    mustGetElement('character-sheet-container'),
    selectedCharacter(),
    (next) => {
      commitCharacter(next);
      inventoryPanel.setCharacter(next);
    },
  );

  const inventoryPanel = mountInventoryPanel(
    mustGetElement('inventory-container'),
    selectedCharacter(),
    (next) => {
      commitCharacter(next);
      characterSheet.setCharacter(next);
    },
  );

  mountTimePanel(mustGetElement('time-container'), {
    getClock: () => state.clock,
    onAdvance: () => {
      state.clock = advanceWatches(state.clock, 1);
      app.actions.markDirty();
    },
    onShortRest: () => {
      state.characters = state.characters.map(shortRest);
      state.clock = advanceWatches(state.clock, 1);
      selectCharacter(selectedCharacterId);
      app.actions.logEvent('rest', `The party takes a short rest. Now ${formatClock(state.clock)}.`);
    },
    onLongRest: () => {
      state.characters = state.characters.map(longRest);
      state.clock = advanceToDawn(state.clock);
      selectCharacter(selectedCharacterId);
      app.actions.logEvent('rest', `The party takes a long rest. Now ${formatClock(state.clock)}.`);
    },
  });
}
