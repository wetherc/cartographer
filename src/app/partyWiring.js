import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmDelete } from '../ui/Modal.js';
import {
  shortRest,
  longRest,
  addXP,
  transferItem,
  getHP,
  setMaxHP,
  setBonusHP,
  setBaseAC,
} from '../entities/Character.js';
import { learnableSpells as spellsLearnableBy } from '../entities/SpellLearning.js';
import { characterFields, characterFormChange, buildCharacter } from './characterCreate.js';
import { activeSpells, resolveSpellIds, getActiveLibrary } from '../library/Library.js';
import { castSpellOutOfCombat } from './spellCast.js';
import { endSpellEffects, rosterIds } from './combatants.js';
import { rollCheck } from './checkRolls.js';
import { rollDeathSaveFor, stabilizeCharacter } from './deathSaves.js';
import { setCombatantExhaustion } from './exhaustion.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { applyFresh, removeById } from '../entities/Roster.js';
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
import { describeTile } from '../map/TileCoords.js';
import { wireSplitParty } from './splitParty.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * This module builds the party's panels: the roster, character sheet,
 * inventory, and Time panel. A rest restores the same character resources
 * through the Time panel. The module owns the selected-character scope. The
 * sheet, inventory, and spellbook register into this scope. The module
 * registers `refreshSelectedCharacter` on `app.actions`, so other modules,
 * for example condition ticks at a new combat round, can refresh those
 * panels. Two controls sit above the roster but come from elsewhere: the
 * character claim from `view/CharacterClaim.js`, and the split switch from
 * `splitParty.js`.
 * @param {AppContext} app
 */
export function wireParty(app) {
  const { state } = app;

  // This tab's claim on one party member, for Player view only, with the
  // "Playing as" picker. Its three callbacks reach the character scope and
  // the roster declared below. None of the callbacks can run before those
  // are mounted. The picker runs only on a GM's pick. The claim mounts only
  // here.
  const claim = createCharacterClaim({
    container: mustGetElement('party-container'),
    getCharacters: () => state.characters,
    bind: (id) => selectCharacter(id),
    spectate: () => scope.reselect(),
    toast: (message, options) => app.toasts.show(message, options),
  });
  app.actions.getBoundCharacterId = claim.getBoundId;

  /**
   * The selected character, the roster write-back, and the fan-out to the
   * character panels. The panels and the roster are declared below this
   * scope. The `select` function must not run until all of them are
   * mounted. The function is handed to the roster and the binding picker.
   * Neither one runs its callback during mounting.
   */
  const scope = createCharacterScope({
    getCharacters: () => state.characters,
    setCharacters: (characters) => {
      state.characters = characters;
    },
    onCommit: () => {
      characterRoster.update();
      // A mid-combat equipment change, for example a weapon swap on the turn
      // a haste potion gives a second action, must reach the initiative
      // panel's attack strip. The panel otherwise rebuilds the strip only on
      // turn advance. The panel reads the character live, but it builds its
      // buttons only when it rebuilds itself.
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

  /** What this tab can do to the character currently on the sheet or inventory.
   * @returns {import('../types/view.js').SheetPermissions} */
  function selectedPermissions() {
    const character = selectedCharacter();
    return partyPermissions(state.role, claim.getBoundId(), character?.id ?? '');
  }

  /**
   * Follow a character that the roster just picked. While the party is
   * split, a character can stand anywhere, so the map jumps to the node the
   * character stands in and centers on the character's tile. When splitting
   * is off, every character rides the party marker, so the view stays where
   * the GM left it.
   * @param {string | null} id
   */
  function followCharacter(id) {
    if (!state.splitParty) return;
    const character = state.characters.find((c) => c.id === id);
    if (!character) return;
    app.actions.centerOnLocation(characterPosition(character, app.partyTracker.getPosition()));
  }

  // GM-only, hidden from players through CSS. This controls whether
  // characters can stand apart from the party marker. The roster's
  // per-character place buttons follow this setting, so a change here
  // rebuilds the roster mounted below.
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
    // override, bonus HP from an item or a boon, and the unarmored base AC
    // that an effect such as Mage Armor raises. These used to be inline
    // fields on the sheet, which put three edit boxes in the middle of the
    // numbers a player reads. One dialog per character keeps them together
    // and keeps the sheet read-only.
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
    onAwardXP: async () => {
      const values = await promptModal(
        'Award XP to the party',
        [{ name: 'amount', label: 'XP per character', type: 'number', value: 100, min: 1 }],
        { submitLabel: 'Award' },
      );
      const amount = clampInt(values?.amount, 0);
      if (!values || amount <= 0) return;
      state.characters = state.characters.map((c) => addXP(c, amount));
      scope.reselect(); // refresh the sheet, inventory, and roster
      app.actions.markDirty();
      app.actions.logEvent('note', `The party is awarded ${amount} XP each.`);
      app.toasts.show(
        `Awarded ${amount} XP to ${state.characters.length} character${state.characters.length === 1 ? '' : 's'}.`,
      );
    },
  });

  // Resolve a spellbook's stored ids through the memoized active-library index.
  const resolveSpells = resolveSpellIds;
  // Every spell that the character's classes can learn: cantrips, and leveled
  // spells up to the level each class reaches on its own. This makes sure
  // that the Spellbook never offers a spell the character has no class to
  // learn it with. The rule lives in `SpellLearning.js`.
  /** @param {Character} character @returns {import('../types/spell.js').Spell[]} */
  const learnableSpells = (character) => spellsLearnableBy(character, activeSpells());

  // The three character tabs join the scope instead of naming each other
  // directly. Each tab's edits go back through its own commit handle. The
  // commit handle writes the character into the roster and updates the
  // other panels. The panel the edit came from has already rebuilt itself.
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
      // The active library object is replaced as a whole on every library
      // change. Its identity is therefore the catalog's revision number.
      catalogStamp: getActiveLibrary,
      // A caster that stops holding a spell stops affecting its target.
      // This reaches collections that the sheet cannot see.
      onConcentrationEnd: (character, held) => endSpellEffects(app, character.id, held.spellId),
    },
    (message) => app.toasts.show(message),
    // A save or skill row rolls through the dice tray and lands in the log.
    // The handler outlives the render that built it, so it reads the selected
    // character when it fires rather than closing over the one on screen.
    (event) => {
      const character = selectedCharacter();
      if (character) rollCheck(app, character, event);
    },
    // A death save also rolls through the tray and lands in the log, so it
    // goes through the app rather than through the sheet's own commit path.
    // Both handlers read the selected character when they fire.
    {
      onRoll: () => {
        const character = selectedCharacter();
        if (character) rollDeathSaveFor(app, character.id);
      },
      onStabilize: () => {
        const character = selectedCharacter();
        if (character) stabilizeCharacter(app, character.id);
      },
    },
    // The exhaustion pips go through the app for the same reason: the sixth
    // level kills the character and logs it, which the sheet cannot do.
    {
      onSet: (level) => {
        const character = selectedCharacter();
        if (character) setCombatantExhaustion(app, character.id, level);
      },
    },
  );

  // The Spellbook tab manages learn, prepare, and forget actions for the
  // selected character. It writes edits back through the shared commit
  // path, so the sheet's castable-spell view stays in sync.
  const spellbookPanel = mountSpellbookPanel(
    mustGetElement('spellbook-container'),
    selectedCharacter(),
    commitFromSpellbook,
    () => ({ play: selectedPermissions().play }),
    // The active library object is replaced as a whole on every library
    // change. Its identity is therefore the catalog's revision number.
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
        // The receiver is off screen, so it needs only the write-back. The
        // giver reaches every panel, including this one, because the
        // transfer ran outside its own commit path. Its copy is still the
        // pre-transfer one.
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

  // This is one entry point for "the campaign under these panels was
  // replaced". A tab that follows another tab's saves needs this update. It
  // refreshes the clock, the split toggle's own checkbox, and, through the
  // character scope, the roster, sheet, equipment, inventory, spellbook,
  // and binding picker. The selection falls back to the first character,
  // because the roster this tab showed can no longer hold the character it
  // had selected.
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
