import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal } from '../ui/Modal.js';
import { createCharacter, withHP, shortRest, longRest, addXP } from '../entities/Character.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { mountCharacterRoster } from '../ui/CharacterRoster.js';
import { mountCharacterSheet } from '../ui/CharacterSheet.js';
import { mountInventoryPanel } from '../ui/InventoryPanel.js';
import { mountTimePanel } from '../ui/TimePanel.js';
import { advanceWatches, advanceToDawn, formatClock } from '../time/GameClock.js';
import { isGM } from '../view/ViewRole.js';
import {
  BOUND_CHARACTER_SESSION_KEY,
  characterLockKey,
  initialBinding,
  partyPermissions,
} from '../view/CharacterBinding.js';
import {
  GM_LOCK_HEARTBEAT,
  claimLock,
  isHeldByOther,
  loadLock,
  saveLock,
  releaseLock,
} from '../storage/GMLock.js';
import { moveCharacter, isSplit, characterPosition, recallAll } from '../party/CharacterTokens.js';
import { locationFields, readLocation } from './locationFields.js';

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

  // This tab's bound character (Player view only): the one character this tab
  // may play. Bound via ?character=<id> or the "Playing as" picker below.
  /** @type {string | null} */
  let boundCharacterId = null;
  app.actions.getBoundCharacterId = () => boundCharacterId;

  // Bindings are exclusive across tabs: claiming a character takes a
  // heartbeat lock in localStorage (same machinery as the GM lock), so two
  // player tabs can never both play "Hero". A failed claim leaves the tab a
  // spectator with a toast explaining who has it.
  const bindingTabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  /** @type {ReturnType<typeof setInterval> | null} */
  let bindingHeartbeat = null;

  /** @param {string} characterId @returns {boolean} whether the claim stuck */
  function tryClaimCharacter(characterId) {
    const key = characterLockKey(characterId);
    const next = claimLock(loadLock(key), bindingTabId, Date.now());
    if (!next) return false;
    saveLock(next, key);
    if (bindingHeartbeat === null) {
      bindingHeartbeat = setInterval(() => {
        if (boundCharacterId) saveLock({ id: bindingTabId, at: Date.now() }, characterLockKey(boundCharacterId));
      }, GM_LOCK_HEARTBEAT);
    }
    return true;
  }

  function dropCharacterClaim() {
    if (bindingHeartbeat !== null) clearInterval(bindingHeartbeat);
    bindingHeartbeat = null;
    if (boundCharacterId) releaseLock(bindingTabId, characterLockKey(boundCharacterId));
  }

  /**
   * Bind this tab to a character (or null for spectator), enforcing the
   * cross-tab claim. Returns the binding that actually took effect.
   * @param {string | null} id
   * @returns {string | null}
   */
  function setBinding(id) {
    if (id === boundCharacterId) return boundCharacterId;
    dropCharacterClaim();
    if (id !== null && !tryClaimCharacter(id)) {
      const name = state.characters.find((c) => c.id === id)?.name ?? id;
      app.toasts.show(`Another tab is already playing ${name}; this tab stays a spectator.`);
      id = null;
    }
    boundCharacterId = id;
    if (id) sessionStorage.setItem(BOUND_CHARACTER_SESSION_KEY, id);
    else sessionStorage.removeItem(BOUND_CHARACTER_SESSION_KEY);
    return id;
  }

  setBinding(initialBinding(
    location.search,
    sessionStorage.getItem(BOUND_CHARACTER_SESSION_KEY),
    state.characters,
  ));

  // Free the claim when the tab goes away so another tab can pick the
  // character up without waiting out the TTL.
  window.addEventListener('pagehide', dropCharacterClaim);

  // Belt and braces, mirroring the GM lock: if another tab takes over our
  // character's lock (e.g. this tab was frozen past the TTL), yield to it.
  window.addEventListener('storage', (event) => {
    if (!boundCharacterId || event.key !== characterLockKey(boundCharacterId)) return;
    if (isHeldByOther(loadLock(event.key), bindingTabId, Date.now())) {
      const name = state.characters.find((c) => c.id === boundCharacterId)?.name ?? boundCharacterId;
      if (bindingHeartbeat !== null) clearInterval(bindingHeartbeat);
      bindingHeartbeat = null;
      boundCharacterId = null;
      sessionStorage.removeItem(BOUND_CHARACTER_SESSION_KEY);
      app.toasts.show(`Another tab took over ${name}; this tab is now a spectator.`);
      selectCharacter(selectedCharacterId);
    }
  });

  /** What this tab may do to the character currently on the sheet/inventory.
   * @returns {{ editBase: boolean, play: boolean }} */
  function selectedPermissions() {
    const character = selectedCharacter();
    return partyPermissions(state.role, boundCharacterId, character?.id ?? '');
  }

  /** @type {string | null} id of the character the sheet/inventory are scoped to */
  let selectedCharacterId = boundCharacterId ?? state.characters[0]?.id ?? null;

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
    updateBindingPicker();
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

  // "Playing as" picker, Player view only (hidden for the GM via CSS): binds
  // this tab to one character, or to none for a spectator tab. The URL form
  // (?character=<id>) survives reloads; the picker is per-tab session state.
  const binding = document.createElement('label');
  binding.className = 'party-binding';
  const bindingLabel = document.createElement('span');
  bindingLabel.className = 'party-binding__label';
  bindingLabel.textContent = 'Playing as';
  const bindingSelect = document.createElement('select');
  bindingSelect.className = 'field';
  bindingSelect.setAttribute('aria-label', 'Character this tab plays as');
  binding.append(bindingLabel, bindingSelect);
  mustGetElement('party-container').appendChild(binding);
  bindingSelect.addEventListener('change', () => {
    const took = setBinding(bindingSelect.value === '' ? null : bindingSelect.value);
    selectCharacter(took ?? selectedCharacterId);
  });

  function updateBindingPicker() {
    // A binding whose character left the roster silently resolves to spectator.
    if (boundCharacterId && !state.characters.some((c) => c.id === boundCharacterId)) {
      setBinding(null);
    }
    bindingSelect.innerHTML = '';
    const spectator = document.createElement('option');
    spectator.value = '';
    spectator.textContent = 'Spectator (view only)';
    bindingSelect.appendChild(spectator);
    for (const character of state.characters) {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = character.name;
      bindingSelect.appendChild(option);
    }
    bindingSelect.value = boundCharacterId ?? '';
  }
  updateBindingPicker();

  // GM-only (hidden from players via CSS) switch governing whether the party
  // may split up. Off by default: no individual tokens or name labels, and
  // everyone moves simultaneously with the party marker. Turning it off while
  // characters stand apart first regroups the whole party at one member's
  // position, chosen by the GM.
  const split = document.createElement('label');
  split.className = 'party-split';
  const splitInput = document.createElement('input');
  splitInput.type = 'checkbox';
  splitInput.checked = state.splitParty;
  splitInput.setAttribute('aria-label', 'Allow splitting the party');
  const splitLabel = document.createElement('span');
  splitLabel.textContent = 'Allow splitting the party';
  split.append(splitInput, splitLabel);
  mustGetElement('party-container').appendChild(split);

  /** Refresh everything the toggle changes: tokens/labels, roster place buttons. */
  function syncSplitViews() {
    app.actions.syncPartyMarker();
    characterRoster.update();
    app.actions.markDirty();
  }

  /**
   * Gather the whole party at one member's position before disallowing the
   * split: the GM picks the character, everyone teleports to where they stand
   * (a member still with the party means the current party tile). Resolves
   * false when the GM cancels, leaving the toggle on.
   * @returns {Promise<boolean>}
   */
  async function regroupParty() {
    if (!isSplit(state.characters)) return true;
    const values = await promptModal(
      'Regroup the party',
      [
        {
          name: 'at',
          label: 'Teleport everyone to',
          type: 'select',
          options: state.characters.map((c) => {
            const at = characterPosition(c, app.partyTracker.getPosition());
            const node = app.grid.getNode(at.nodeId);
            return {
              value: c.id,
              label: c.location
                ? `${c.name} — ${node?.name ?? at.nodeId} (tile ${at.tileId})`
                : `${c.name} — with the party`,
            };
          }),
        },
      ],
      { submitLabel: 'Regroup' },
    );
    if (!values) return false;
    const chosen = state.characters.find((c) => c.id === values.at);
    if (!chosen) return false;
    const target = characterPosition(chosen, app.partyTracker.getPosition());
    app.partyTracker.moveTo(target.nodeId, target.tileId);
    state.characters = recallAll(state.characters);
    app.views.mapCanvas.refreshNode(app.navigator.getCurrentNode());
    app.views.regionTree.update();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
    const node = app.grid.getNode(target.nodeId);
    app.actions.logEvent(
      'travel',
      `The party regroups at ${chosen.name}'s position in ${node?.name ?? target.nodeId} (tile ${target.tileId}).`,
    );
    app.actions.maybeTriggerEncounter();
    return true;
  }

  splitInput.addEventListener('change', async () => {
    if (splitInput.checked) {
      state.splitParty = true;
      app.actions.logEvent('note', 'The GM allows the party to split up.');
      syncSplitViews();
      return;
    }
    const regrouped = await regroupParty();
    if (!regrouped) {
      splitInput.checked = true; // cancelled: the party stays split
      return;
    }
    state.splitParty = false;
    app.actions.logEvent('note', 'The GM gathers the party; splitting up is no longer allowed.');
    syncSplitViews();
  });

  const characterRoster = mountCharacterRoster(mustGetElement('party-container'), {
    getCharacters: () => state.characters,
    getSelectedId: () => selectedCharacterId,
    canManage: () => isGM(state.role),
    // The place action only exists while the GM allows splitting the party.
    canPlace: () => state.splitParty,
    onSelect: selectCharacter,
    // GM-only individual movement: place one character at any node/tile — or
    // back "with the party" — without moving anyone else. The map click stays
    // the whole-party move; this is the split-the-party tool.
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
        app.actions.logEvent('travel', `${character.name} moves to ${node?.name ?? location.nodeId} (tile ${location.tileId}).`);
        app.actions.maybeTriggerEncounter(location, character.name);
      } else {
        app.actions.logEvent('travel', `${character.name} rejoins the party.`);
      }
    },
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
    selectedPermissions,
  );

  const inventoryPanel = mountInventoryPanel(
    mustGetElement('inventory-container'),
    selectedCharacter(),
    (next) => {
      commitCharacter(next);
      characterSheet.setCharacter(next);
    },
    (event, character) => {
      const node = app.grid.getNode(app.partyTracker.getPosition().nodeId);
      app.actions.logEvent(
        'note',
        formatInventoryEvent(character.name, event, { region: node?.name, time: formatClock(state.clock) }),
      );
    },
    () => selectedPermissions().play,
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
