import { addStatModifier, applyDamage, heal, isDefeated } from '../entities/Encounter.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { mountStatBlockBar } from './StatBlockBar.js';
import { numberField } from './formFields.js';
import { mountListPanel } from './listPanel.js';
import { buildTabs } from './Tabs.js';
import { isGM, hpBand } from '../view/ViewRole.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the encounter panel: an "Active encounter" / "Nearby encounters" tab
 * pair, always shown, each tab holding one list panel. The Active tab lists the
 * live encounters on the party's tile — what the party has walked into — and
 * carries the GM's "Start combat" button; gaining an active encounter switches
 * to it, and losing the last one switches back to Nearby, which lists
 * everything else in range (authoring buttons only render when the caller
 * passes onAdd / onAddFromTemplate — the Build rail owns authoring now, so the
 * Play mount passes neither). Either tab shows an empty state when it has
 * nothing to list, and both stay freely selectable. Each row shows an HP
 * readout and a damage/heal amount applied via two buttons; defeated encounters
 * (currentHP <= 0) render with a distinguishing class instead of being removed,
 * so a GM can still see what died.
 *
 * The panel owns no roster state: `getActiveEncounters` and
 * `getNearbyEncounters` supply the rows (pre-filtered to the party's
 * position) and every mutation flows back through a callback, so the caller
 * keeps the master list — including encounters filtered out of the current
 * view. Modals live in main.js, so this stays a thin DOM wrapper like the
 * other panels.
 * @param {HTMLElement} container
 * @param {{
 *   getActiveEncounters: () => Encounter[],
 *   getNearbyEncounters: () => Encounter[],
 *   onUpdate: (encounter: Encounter) => void,
 *   onDelete: (id: string) => void,
 *   onAdd?: () => Promise<Encounter | null>,
 *   onEdit?: (encounter: Encounter) => Promise<unknown>,
 *   onAddFromTemplate?: () => Promise<Encounter | null>,
 *   onSaveTemplate?: (encounter: Encounter) => void,
 *   confirmDelete?: (encounter: Encounter) => Promise<boolean>,
 *   onStartCombat?: () => void,
 *   canStartCombat?: () => boolean,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * With `onStartCombat`, the Active tab's action row gains a "Start combat"
 * button whenever `canStartCombat` allows it (no fight already running) — the
 * entry into the initiative flow, which players don't get.
 * @returns {{ update: () => void }}
 */
export function mountEncounterPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'encounter-panel';
  container.appendChild(root);

  /** whether the previous update had an active encounter, so gaining one
   * switches to the Active tab exactly once (not on every re-render) */
  let hadActive = false;

  /**
   * Each row's damage/heal amount input, keyed by the encounter it shows. The
   * row's body builds the input and the row's buttons read it, and those are
   * two separate builders with no shared row scope — so the entry, which both
   * are handed and which is a fresh object after every mutation, is the key.
   * @type {WeakMap<Encounter, HTMLInputElement>}
   */
  const amounts = new WeakMap();

  /** @param {Encounter} encounter @returns {number} */
  const amountOf = (encounter) => clampInt(amounts.get(encounter)?.value, 0);

  /** @param {Encounter} encounter @param {(encounter: Encounter) => Encounter} fn */
  function updateOne(encounter, fn) {
    callbacks.onUpdate(fn(encounter));
  }

  /**
   * The label, plus for the GM the amount input the damage and heal buttons
   * read.
   * @param {Encounter} encounter
   * @param {{ gm: boolean }} ctx
   * @returns {Node[]}
   */
  function buildBody(encounter, ctx) {
    // A bound encounter shows its tile coordinates so the GM can tell two
    // same-named foes apart and see where in the region it's staged.
    const coords = encounter.location ? ` @ (${encounter.location.tileId})` : '';
    const label = document.createElement('span');
    label.className = 'encounter-panel__label';
    label.textContent = ctx.gm
      ? `${encounter.name} (${encounter.currentHP}/${encounter.maxHP})${coords}`
      : `${encounter.name} — ${hpBand(encounter.currentHP, encounter.maxHP)}`;

    // Player view stops at the name and its status band: no HP numbers, no
    // damage/heal/delete controls, no condition editing, no add button.
    if (!ctx.gm) return [label];

    const amountInput = numberField(1, {
      min: 0,
      className: 'encounter-panel__amount',
      ariaLabel: `Damage/heal amount for ${encounter.name}`,
    });
    amounts.set(encounter, amountInput);

    return [label, amountInput];
  }

  /**
   * The GM's per-row controls: damage, heal, the full edit dialog (name, HP,
   * level/tier, and crucially placement, so relocating an encounter doesn't
   * mean deleting and recreating it), save-as-template, and delete.
   * @param {Encounter} encounter
   * @param {{ gm: boolean }} ctx
   * @returns {(import('./listPanel.js').RowAction<Encounter> | null)[]}
   */
  function actions(encounter, ctx) {
    if (!ctx.gm) return [];
    return [
      {
        icon: 'minus',
        label: `Damage ${encounter.name}`,
        variant: 'danger',
        onClick: () => updateOne(encounter, (e) => applyDamage(e, amountOf(encounter))),
      },
      {
        icon: 'heal',
        label: `Heal ${encounter.name}`,
        variant: 'success',
        onClick: () => updateOne(encounter, (e) => heal(e, amountOf(encounter))),
      },
      callbacks.onEdit
        ? {
            icon: 'edit',
            label: `Edit ${encounter.name}`,
            title: 'Edit',
            onClick: () => callbacks.onEdit?.(encounter),
          }
        : null,
      {
        icon: 'save',
        label: `Save ${encounter.name} as a bestiary template`,
        title: 'Save as template',
        onClick: () => callbacks.onSaveTemplate?.(encounter),
      },
      {
        icon: 'remove',
        label: `Delete ${encounter.name}`,
        variant: 'danger',
        onClick: async () => {
          const ok = callbacks.confirmDelete ? await callbacks.confirmDelete(encounter) : true;
          if (!ok) return false;
          callbacks.onDelete(encounter.id);
        },
      },
    ];
  }

  /**
   * The stat block and condition bars below a GM's row.
   * @param {Encounter} encounter
   * @param {HTMLElement} row
   * @param {{ gm: boolean }} ctx
   */
  function buildExtras(encounter, row, ctx) {
    if (!ctx.gm) return;

    // In Play the stat block is read-mostly: base values aren't editable or
    // removable here (that's the Build rail's job) — clicking a chip instead
    // applies a timed +/- adjustment that ticks down with the combat rounds.
    mountStatBlockBar(row, {
      mode: 'temp',
      getStatBlock: () => encounter.statBlock ?? {},
      getStatMods: () => encounter.statMods ?? [],
      onAddModifier: (stat, delta, rounds) =>
        updateOne(encounter, (e) => addStatModifier(e, stat, delta, rounds)),
    });

    // A GM tracks an encounter's status conditions (poisoned, prone, ...)
    // right on its row; edits write the whole list back through onUpdate.
    mountConditionsBar(row, {
      getConditions: () => encounter.conditions ?? [],
      onChange: (next) => updateOne(encounter, (e) => ({ ...e, conditions: next })),
    });
  }

  // Players see a coarse status band and no controls; the GM sees exact HP and
  // the full damage/heal/condition machinery. The gate is what each list hands
  // its row builders as `gm`, and what drops the add controls.
  const gate = () => !callbacks.getRole || isGM(callbacks.getRole());

  /** What both lists share; they differ only in rows and add controls. */
  const rowOptions = {
    className: 'encounter-panel__list',
    rowClass: 'encounter-panel__row',
    headClass: 'encounter-panel__head',
    rowModifiers: /** @param {Encounter} e */ (e) => [
      isDefeated(e) && 'encounter-panel__row--defeated',
    ],
    buildBody,
    actions,
    buildExtras,
    gate,
    addPlacement: /** @type {const} */ ('trailing'),
  };

  const activePanel = document.createElement('div');
  const nearbyPanel = document.createElement('div');
  const tabs = buildTabs({
    className: 'encounter-panel__tabs',
    ariaLabel: 'Active and nearby encounters',
    selected: 'nearby',
    tabs: [
      { id: 'active', label: 'Active encounter', panel: activePanel },
      { id: 'nearby', label: 'Nearby encounters', panel: nearbyPanel },
    ],
  });
  root.append(tabs.tablist, activePanel, nearbyPanel);

  const activeList = mountListPanel(activePanel, {
    ...rowOptions,
    getRows: () => callbacks.getActiveEncounters(),
    emptyMessage: 'No active encounter.',
    addButtons: () => {
      const onStartCombat = callbacks.onStartCombat;
      if (!onStartCombat || !(callbacks.canStartCombat?.() ?? true)) return [];
      return [
        {
          label: 'Start combat',
          icon: 'sword',
          variant: 'primary',
          className: 'encounter-panel__start-combat',
          onClick: onStartCombat,
        },
      ];
    },
    // "Start combat" appears and disappears with whether a fight is already
    // running, which no row reflects, so the rows-unchanged guard would leave a
    // stale button on screen.
    alwaysRender: true,
  });

  const nearbyList = mountListPanel(nearbyPanel, {
    ...rowOptions,
    getRows: () => callbacks.getNearbyEncounters(),
    emptyMessage: 'No encounters nearby.',
    addClass: 'encounter-panel__add',
    addButtons: () => [
      // The caller creates and stores the encounter; a non-null return just
      // signals that the visible list may have changed.
      callbacks.onAdd ? { label: 'New encounter', icon: 'add', onClick: callbacks.onAdd } : null,
      callbacks.onAddFromTemplate
        ? { label: 'From bestiary', icon: 'scroll', onClick: callbacks.onAddFromTemplate }
        : null,
    ],
  });

  function update() {
    // Gaining an active encounter jumps to its tab exactly once; losing the
    // last one falls back to Nearby. In between, the selection is the user's —
    // either tab stays selectable even when empty.
    const hasActive = callbacks.getActiveEncounters().length > 0;
    if (hasActive !== hadActive) tabs.select(hasActive ? 'active' : 'nearby');
    hadActive = hasActive;
    activeList.update();
    nearbyList.update();
  }

  update();
  return { update };
}
