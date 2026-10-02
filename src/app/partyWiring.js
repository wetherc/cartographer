import { mustGetElement } from '../ui/dom.js';
import { shortRest, longRest, transferItem } from '../entities/Character.js';
import { restoreAllResistance } from '../combat/LegendaryResistance.js';
import { learnableSpells as spellsLearnableBy } from '../entities/SpellLearning.js';
import { activeSpells, resolveSpellIds, getActiveLibrary } from '../library/Library.js';
import { castSpellOutOfCombat } from './spellCast.js';
import { applyToTarget, endSpellEffects } from './combatantWrites.js';
import { addLethargy } from './lethargy.js';
import { rollCheck } from './checkRolls.js';
import { rollDeathSaveFor, stabilizeCharacter } from './deathSaves.js';
import { setCombatantExhaustion } from './exhaustion.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { createCharacterScope } from './characterScope.js';
import { mountCharacterRoster } from '../ui/CharacterRoster.js';
import { mountCharacterSheet } from '../ui/CharacterSheet.js';
import { mountFullSheet } from '../ui/FullSheet.js';
import { mountSpellbookPanel } from '../ui/SpellbookPanel.js';
import { mountInventoryPanel } from '../ui/InventoryPanel.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountTimePanel } from '../ui/TimePanel.js';
import { askShortRestDice } from '../ui/ShortRestDialog.js';
import { choiceModal } from '../ui/ChoiceModal.js';
import { spendRestDice } from '../entities/RestHitDice.js';
import {
  advanceMinutes,
  advanceToDawn,
  advanceWatches,
  formatClock,
  longRestClock,
  MINUTES_PER_WATCH,
  offersRestUntilDawn,
  watchesBetween,
} from '../time/GameClock.js';
import { passTime, passTravelTime } from './passTime.js';
import { isGM } from '../view/ViewRole.js';
import { partyPermissions, playerTabHref } from '../view/CharacterBinding.js';
import { createCharacterClaim } from '../view/CharacterClaim.js';
import { potionHeals } from '../entities/Potions.js';
import { drinkPotion } from './potions.js';
import { startingCharacterId } from '../view/ReloadView.js';
import { characterPosition } from '../party/CharacterTokens.js';
import { wireSplitParty } from './splitParty.js';
import { rosterActions } from './rosterActions.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/** The length of a 5e short rest. */
const SHORT_REST_MINUTES = 60;

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
 * @param {import('../view/ReloadView.js').ReloadView | null} [reloadView] the
 *   view an Undo or Redo kept across its reload. Its character is selected
 *   at start while it is still in the roster, and the full sheet opens
 *   again when it was open.
 */
export function wireParty(app, reloadView = null) {
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
      // A handout for chosen characters shows only on their tabs, so a new
      // binding changes the list.
      app.views.handoutPanel.update();
      syncOpenButton();
    },
    selectedId:
      claim.getBoundId() ??
      startingCharacterId(reloadView, state.characters, state.characters[0]?.id ?? null),
  });
  const selectCharacter = scope.select;
  const selectedCharacter = scope.getSelected;
  // The party panels sit behind the combat screen, and each rebuild costs
  // about 700 elements. A spell that hits four party members writes four
  // characters, so the refresh waits while the screen is up. sessionControls
  // calls it again when the app leaves combat mode.
  app.actions.refreshSelectedCharacter = () => {
    if (state.mode !== 'combat') scope.reselect();
  };
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

  // While "Hide panels" is on, the sidebar is hidden, and a switch to the
  // Sheet tab shows nothing. The GM would then find the Sheet tab in place
  // of the tab they left when they show the panels again.
  const showSheetTab = () => {
    if (document.body.classList.contains('sidebar-collapsed')) return;
    document.getElementById('tab-character')?.click();
  };

  const characterRoster = mountCharacterRoster(mustGetElement('party-container'), {
    getCharacters: () => state.characters,
    getSelectedId: scope.getSelectedId,
    canManage: () => isGM(state.role),
    // The place action only exists while the GM allows splitting the party.
    canPlace: () => state.splitParty,
    playerTabHref,
    // A click on a row also opens the Sheet tab of the sidebar, so the sheet
    // shows beside the map. The tab's own click handler does the switch.
    onSelect: (id) => {
      selectCharacter(id);
      followCharacter(id);
      showSheetTab();
      fullSheet.update();
    },
    onOpenSheet: (id) => {
      selectCharacter(id);
      showSheetTab();
      fullSheet.open();
    },
    ...rosterActions(app, { scope, selectCharacter }),
  });

  // The full sheet borrows the sidebar's sheet card. Its switcher selects a
  // party member the same way a roster row does.
  const fullSheet = mountFullSheet(mustGetElement('full-sheet'), {
    card: mustGetElement('sheet-card'),
    getCharacters: () => state.characters,
    getSelectedId: scope.getSelectedId,
    onSelect: (id) => {
      selectCharacter(id);
      followCharacter(id);
      fullSheet.update();
    },
  });
  mustGetElement('open-full-sheet').addEventListener('click', () => fullSheet.open());
  // With no character selected, the sheet card shows an empty state and the
  // full sheet has nothing to show, so the open button hides.
  function syncOpenButton() {
    mustGetElement('open-full-sheet').hidden = !scope.getSelectedId();
  }
  syncOpenButton();

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
  const sheetCommit = scope.register(() => characterSheet).commit;
  // A hand edit on the sheet that removes Haste leaves lethargy, as any other
  // end does. The sheet then needs the new chip back, so that write goes to
  // every panel.
  const commitFromSheet = (/** @type {import('../types/entities.js').Character} */ next) => {
    const prev = state.characters.find((c) => c.id === next.id);
    const settled = prev ? addLethargy(app, prev, next) : next;
    if (settled === next) sheetCommit(next);
    else scope.set(settled);
  };
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
    // The HP steppers go through the same write path as a hit or a heal on
    // the combat screen, which folds in the death-save and concentration rules
    // and logs them.
    {
      onStep: (amount, isHeal) => {
        const character = selectedCharacter();
        if (character) applyToTarget(app, character.id, amount, isHeal);
      },
    },
    // The Level up button of the sheet's banner opens the full sheet, where
    // the progression section is.
    () => fullSheet.open(),
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
      // A healing potion asks who drinks it and heals through the shared
      // write path. The drinker goes to every panel through `scope.set`,
      // so the heal is not lost under the panel's own copy.
      drink: (item) => {
        const drinker = selectedCharacter();
        if (!drinker || !potionHeals(item)) return false;
        void drinkPotion(app, drinker, item, (next) => scope.set(next));
        return true;
      },
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
      passTime(app, 1);
      app.actions.markDirty();
    },
    // The dialog asks for the hit dice first, and a cancel there cancels
    // the rest. The rest resolves after the dialog closes, so this handler
    // refreshes the clock readout itself.
    onShortRest: async () => {
      const counts = await askShortRestDice(state.characters);
      if (!counts) return;
      /** @type {string[]} */
      const spent = [];
      state.characters = state.characters.map((character) => {
        const out = spendRestDice(shortRest(character), counts[character.id] ?? {});
        if (out.rolls.length > 0) {
          const dice = out.rolls.length === 1 ? 'hit die' : 'hit dice';
          spent.push(
            `${character.name} spends ${out.rolls.length} ${dice} and heals ${out.healed} HP.`,
          );
        }
        return out.character;
      });
      // A short rest lasts one hour. The timed effects lose that hour even
      // when the clock stays inside one watch, so a 10-minute spell ends.
      state.clock = advanceMinutes(state.clock, SHORT_REST_MINUTES);
      passTime(app, SHORT_REST_MINUTES / MINUTES_PER_WATCH);
      scope.reselect();
      timePanel.update();
      app.actions.logEvent(
        'rest',
        ['The party takes a short rest.', ...spent, `Now ${formatClock(state.clock)}.`].join(' '),
      );
    },
    // A long rest lasts eight hours. From Afternoon or Dusk, the GM can let
    // it run on until Dawn instead, and a cancel there cancels the rest.
    onLongRest: async () => {
      const before = state.clock;
      let after = longRestClock(before);
      if (offersRestUntilDawn(before)) {
        const dawn = advanceToDawn(before);
        const { choice } = await choiceModal(
          `Eight hours of rest end at ${formatClock(after)}. Resting until Dawn ends at ${formatClock(dawn)}.`,
          [
            { value: 'eight', label: 'Rest 8 hours' },
            { value: 'dawn', label: 'Rest until Dawn' },
          ],
          { title: 'Long rest' },
        );
        if (choice === 'cancel') return;
        if (choice === 'dawn') after = dawn;
      }
      state.characters = state.characters.map(longRest);
      // A legendary creature gets its uses of Legendary Resistance back.
      state.creatures = restoreAllResistance(state.creatures);
      state.clock = after;
      passTime(app, watchesBetween(before, after));
      scope.reselect();
      timePanel.update();
      app.actions.logEvent('rest', `The party takes a long rest. Now ${formatClock(state.clock)}.`);
    },
  });

  app.actions.passTravelTime = (minutes) => {
    if (passTravelTime(app, minutes)) timePanel.update();
  };

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
      fullSheet.update();
    },
  };

  // An Undo or Redo reloads the page, and the full sheet opens again when it
  // was open before the step.
  if (reloadView?.fullSheet && state.characters.length > 0) fullSheet.open();
}
