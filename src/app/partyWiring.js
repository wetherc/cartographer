import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmDelete } from '../ui/Modal.js';
import { shortRest, longRest, addXP, transferItem } from '../entities/Character.js';
import { highestSlotLevel } from '../entities/SpellSlots.js';
import { casterClassRefs } from '../entities/Classes.js';
import { characterFields, characterFormChange, buildCharacter } from './characterCreate.js';
import { activeSpells, resolveSpellIds, getActiveLibrary } from '../library/Library.js';
import { castSpellOutOfCombat } from './spellCast.js';
import { endSpellEffects } from './combatants.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { removeById } from '../entities/Roster.js';
import { createCharacterScope } from './characterScope.js';
import { clampInt } from '../util/num.js';
import { mountCharacterRoster } from '../ui/CharacterRoster.js';
import { mountCharacterSheet } from '../ui/CharacterSheet.js';
import { mountSpellbookPanel } from '../ui/SpellbookPanel.js';
import { mountInventoryPanel } from '../ui/InventoryPanel.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountTimePanel } from '../ui/TimePanel.js';
import { advanceWatches, advanceToDawn, formatClock } from '../time/GameClock.js';
import { isGM } from '../view/ViewRole.js';
import { partyPermissions } from '../view/CharacterBinding.js';
import { createCharacterClaim } from '../view/CharacterClaim.js';
import { characterPosition, moveCharacter } from '../party/CharacterTokens.js';
import { locationFields, readLocation } from './locationFields.js';
import { wireSplitParty } from './splitParty.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The party's panels — roster, character sheet, inventory — and the Time panel
 * (rests restore the same character resources). Owns the selected-character
 * scope the sheet, inventory, and spellbook register into; registers
 * `refreshSelectedCharacter` on `app.actions` so other modules (e.g. condition
 * ticks at a new combat round) can refresh those panels. The two controls above
 * the roster come from elsewhere: the character claim from
 * `view/CharacterClaim.js`, the split switch from `splitParty.js`.
 * @param {AppContext} app
 */
export function wireParty(app) {
  const { state } = app;

  // This tab's claim on one party member (Player view only), with the "Playing
  // as" picker. Its three callbacks reach the character scope and the roster
  // declared below, so none of them may run before those are mounted; the picker
  // fires only on a GM's pick and the claim only mounts here.
  const claim = createCharacterClaim({
    container: mustGetElement('party-container'),
    getCharacters: () => state.characters,
    bind: (id) => selectCharacter(id),
    spectate: () => scope.reselect(),
    toast: (message) => app.toasts.show(message),
  });
  app.actions.getBoundCharacterId = claim.getBoundId;

  /**
   * The selected character, the roster write-back, and the fan-out to the
   * character panels. The panels and the roster it reaches are declared below
   * it, so `select` must not run until they are all mounted: it is handed to
   * the roster and the binding picker, and neither fires its callback while
   * mounting.
   */
  const scope = createCharacterScope({
    getCharacters: () => state.characters,
    setCharacters: (characters) => {
      state.characters = characters;
    },
    onCommit: () => {
      characterRoster.update();
      // A mid-combat equipment change (swapping a weapon on the turn a haste
      // potion bought a second action) must reach the initiative panel's attack
      // strip, which is otherwise only redrawn on turn advance — the panel reads
      // the character live, but its buttons are built at render time.
      app.views.initiativePanel.update();
      app.actions.markDirty();
    },
    onSelect: () => {
      characterRoster.update();
      claim.updatePicker();
    },
    selectedId: claim.getBoundId() ?? state.characters[0]?.id ?? null,
  });
  const selectCharacter = scope.select;
  const selectedCharacter = scope.getSelected;
  app.actions.refreshSelectedCharacter = scope.reselect;
  app.actions.getSelectedCharacterId = scope.getSelectedId;

  /** What this tab may do to the character currently on the sheet/inventory.
   * @returns {import('../types/view.js').SheetPermissions} */
  function selectedPermissions() {
    const character = selectedCharacter();
    return partyPermissions(state.role, claim.getBoundId(), character?.id ?? '');
  }

  /**
   * Follow a character the roster just picked: while the party is split they
   * can be anywhere, so the map jumps to the node they stand in and centres on
   * their tile. With splitting off everyone rides the party marker, so the
   * view stays where the GM left it.
   * @param {string | null} id
   */
  function followCharacter(id) {
    if (!state.splitParty) return;
    const character = state.characters.find((c) => c.id === id);
    if (!character) return;
    app.actions.centerOnLocation(characterPosition(character, app.partyTracker.getPosition()));
  }

  // GM-only (hidden from players via CSS): whether characters may stand apart
  // from the party marker. The roster's per-character place buttons follow it,
  // which is why it redraws the roster mounted below.
  const splitParty = wireSplitParty(app, {
    container: mustGetElement('party-container'),
    refreshRoster: () => characterRoster.update(),
  });

  const characterRoster = mountCharacterRoster(mustGetElement('party-container'), {
    getCharacters: () => state.characters,
    getSelectedId: scope.getSelectedId,
    canManage: () => isGM(state.role),
    // The place action only exists while the GM allows splitting the party.
    canPlace: () => state.splitParty,
    onSelect: (id) => {
      selectCharacter(id);
      followCharacter(id);
    },
    // GM-only individual movement: place one character at any node/tile — or
    // back "with the party" — without moving anyone else. Map clicks move the
    // selected character across the viewed node; this reaches any node.
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
        app.actions.logEvent(
          'travel',
          `${character.name} moves to ${node?.name ?? location.nodeId} (tile ${location.tileId}).`,
        );
        app.actions.maybeTriggerEncounter(location, character.name);
      } else {
        app.actions.logEvent('travel', `${character.name} rejoins the party.`);
      }
    },
    onAdd: async () => {
      const values = await promptModal('New character', characterFields(), {
        wide: true,
        onChange: characterFormChange,
      });
      if (!values || !values.name.trim()) return;
      const created = buildCharacter(
        values,
        state.characters.map((c) => c.id),
      );
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
      // A deleted character can't keep a slot in a running fight: nothing
      // resolves the id any more, so the row would render as an unknown
      // combatant whose turn can't be played.
      app.actions.removeCombatant(id);
      if (id === scope.getSelectedId()) selectCharacter(state.characters[0]?.id ?? null);
      else scope.reselect();
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
      const amount = clampInt(values?.amount, 0);
      if (!values || amount <= 0) return;
      state.characters = state.characters.map((c) => addXP(c, amount));
      scope.reselect(); // refresh sheet/inventory/roster
      app.actions.markDirty();
      app.actions.logEvent('note', `The party is awarded ${amount} XP each.`);
      app.toasts.show(
        `Awarded ${amount} XP to ${state.characters.length} character${state.characters.length === 1 ? '' : 's'}.`,
      );
    },
  });

  // Resolve a spellbook's stored ids through the memoized active-library index.
  const resolveSpells = resolveSpellIds;
  // Every spell the character's classes may learn: cantrips and leveled spells
  // up to its highest available slot level, so the Spellbook can't offer a
  // spell it could never cast.
  /** @param {Character} character @returns {import('../types/spell.js').Spell[]} */
  const learnableSpells = (character) => {
    const maxSlot = highestSlotLevel(character);
    const casterIds = casterClassRefs(character).map((ref) => ref.classId);
    return activeSpells().filter(
      (spell) =>
        casterIds.some((id) => spell.classes.includes(id)) &&
        (spell.level === 0 || spell.level <= maxSlot),
    );
  };

  // The three character tabs join the scope instead of naming each other: each
  // one's edits go back through its own commit handle, which writes the
  // character into the roster and updates the panels other than the one the edit
  // came from (that one has already re-rendered itself).
  const commitFromSheet = scope.register(() => characterSheet).commit;
  const commitFromSpellbook = scope.register(() => spellbookPanel).commit;
  const commitFromInventory = scope.register(() => inventoryPanel).commit;

  const characterSheet = mountCharacterSheet(
    mustGetElement('character-sheet-container'),
    selectedCharacter(),
    commitFromSheet,
    selectedPermissions,
    {
      resolveSpells,
      onCast: (character, spell) => castSpellOutOfCombat(app, character, spell),
      // The active library object is replaced whole on every library change, so
      // its identity is the catalog's revision.
      catalogStamp: getActiveLibrary,
      // A caster who stops holding a spell stops affecting whoever it was on,
      // which reaches collections the sheet cannot see.
      onConcentrationEnd: (character, held) => endSpellEffects(app, character.id, held.spellId),
    },
    (message) => app.toasts.show(message),
  );

  // The Spellbook tab: learn/prepare/forget management for the selected
  // character, writing edits back through the shared commit path so the sheet's
  // castable-spell view stays in sync.
  const spellbookPanel = mountSpellbookPanel(
    mustGetElement('spellbook-container'),
    selectedCharacter(),
    commitFromSpellbook,
    () => ({ play: selectedPermissions().play }),
    // The active library object is replaced whole on every library change, so
    // its identity is the catalog's revision.
    { learnable: learnableSpells, resolveSpells, catalogStamp: getActiveLibrary },
  );

  const inventoryPanel = mountInventoryPanel(
    mustGetElement('equipment-container'),
    mustGetElement('inventory-container'),
    selectedCharacter(),
    commitFromInventory,
    (event, character) => {
      const node = app.grid.getNode(app.partyTracker.getPosition().nodeId);
      app.actions.logEvent(
        'note',
        formatInventoryEvent(character.name, event, {
          region: node?.name,
          time: formatClock(state.clock),
        }),
      );
    },
    () => selectedPermissions().play,
    () => selectedPermissions().editBase,
    {
      recipients: () => state.characters.map((c) => ({ id: c.id, name: c.name })),
      send: (item, count, recipientId) => {
        const giver = selectedCharacter();
        const receiver = state.characters.find((c) => c.id === recipientId);
        if (!giver || !receiver) return;
        const next = transferItem(giver, receiver, item.id, count);
        // The receiver is off screen, so it only needs the write-back; the giver
        // reaches every panel, this panel included, since the transfer ran
        // outside its own commit path and its copy is the pre-transfer one.
        scope.commit(next.receiver);
        scope.set(next.giver);
        app.actions.logEvent(
          'note',
          formatInventoryEvent(
            giver.name,
            { verb: 'give', itemName: item.name, count, target: receiver.name },
            { time: formatClock(state.clock) },
          ),
        );
      },
    },
  );

  wireTabs(mustGetElement('sheet-tabs'));

  const timePanel = mountTimePanel(mustGetElement('time-container'), {
    getClock: () => state.clock,
    onAdvance: () => {
      state.clock = advanceWatches(state.clock, 1);
      app.actions.markDirty();
    },
    onShortRest: () => {
      state.characters = state.characters.map(shortRest);
      state.clock = advanceWatches(state.clock, 1);
      scope.reselect();
      app.actions.logEvent(
        'rest',
        `The party takes a short rest. Now ${formatClock(state.clock)}.`,
      );
    },
    onLongRest: () => {
      state.characters = state.characters.map(longRest);
      state.clock = advanceToDawn(state.clock);
      scope.reselect();
      app.actions.logEvent('rest', `The party takes a long rest. Now ${formatClock(state.clock)}.`);
    },
  });

  // One entry point for "the campaign under these panels was replaced", which is
  // what a tab following another tab's saves needs: the clock, the split toggle's
  // own checkbox, and — through the character scope — the roster, sheet,
  // equipment, inventory, spellbook, and binding picker. The selection falls back
  // to the first character, since the roster this tab was showing may no longer
  // hold the one it had selected.
  app.views.partyPanels = {
    update: () => {
      timePanel.update();
      splitParty.update();
      const selectedId = scope.getSelectedId();
      const stillThere = state.characters.some((c) => c.id === selectedId);
      if (stillThere) scope.reselect();
      else selectCharacter(state.characters[0]?.id ?? null);
    },
  };
}
