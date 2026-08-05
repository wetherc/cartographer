import { addStatModifier, applyDamage, heal, isDefeated } from '../entities/Creature.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { mountExhaustionBar } from './ExhaustionBar.js';
import { mountStatBlockBar } from './StatBlockBar.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { mountListPanel } from './listPanel.js';
import { buildTabs } from './Tabs.js';
import { isGM, hpBand } from '../view/ViewRole.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/creature.js').Creature} Encounter */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the encounter panel: an Active encounter and Nearby encounters tab
 * pair, always shown, each tab holding one list panel. The Active tab
 * lists the live creatures on the party's tile, hostile or not, and
 * carries the GM's Start combat button. Gaining an
 * active encounter switches to it. Losing the last one switches back to
 * Nearby, which lists everything else in range. Authoring buttons render
 * only when the caller passes onAdd or onAddFromTemplate. The Build rail
 * owns authoring now, so the Play mount passes neither. Either tab shows
 * an empty state when it has nothing to list, and both stay freely
 * selectable. Each row shows an HP readout and a damage or heal amount
 * applied through two buttons. A defeated encounter, with currentHP at or
 * below 0, renders with a distinguishing class instead of being removed,
 * so a GM can still see what died.
 *
 * The panel owns no roster state. getActiveEncounters and
 * getNearbyEncounters supply the rows, pre-filtered to the party's
 * position, and every mutation flows back through a callback. The caller
 * keeps the master list, including encounters filtered out of the current
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
 *   onSetExhaustion?: (encounter: Encounter, level: number) => void,
 *   onStartCombat?: () => void,
 *   canStartCombat?: () => boolean,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * If `onStartCombat` is set, the Active tab's action row gains a Start
 * combat button whenever `canStartCombat` allows it, when no fight is
 * already running. This is the entry into the initiative flow, which
 * players do not get.
 * @returns {{ update: () => void }}
 */
export function mountEncounterPanel(container, callbacks) {
  const root = el('div', 'encounter-panel');
  container.appendChild(root);

  /** Whether the previous update had an active encounter. This makes
   * gaining one switch to the Active tab exactly once, not on every rerender. */
  let hadActive = false;

  /**
   * Each row's damage or heal amount input, keyed by the encounter it
   * shows. The row's body builds the input, and the row's buttons read
   * it. These are two separate builders with no shared row scope. The key
   * is the encounter entry, since both builders receive it and it is a
   * fresh object after every mutation.
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
   * The label, plus, for the GM, the amount input that the damage and
   * heal buttons read.
   * @param {Encounter} encounter
   * @param {{ gm: boolean }} ctx
   * @returns {Node[]}
   */
  function buildBody(encounter, ctx) {
    // A bound encounter shows its tile coordinates. This lets the GM tell
    // two same-named foes apart and see where in the region it is staged.
    const coords = encounter.location ? ` @ (${encounter.location.tileId})` : '';
    const label = el(
      'span',
      'encounter-panel__label',
      ctx.gm
        ? `${encounter.name} (${encounter.currentHP}/${encounter.maxHP})${coords}`
        : `${encounter.name} — ${hpBand(encounter.currentHP, encounter.maxHP)}`,
    );

    // A player's view stops at the name and its status band. It shows no
    // HP numbers, no damage, heal, or delete controls, no condition
    // editing, and no add button.
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
   * The GM's per-row controls: damage, heal, the full edit dialog, with
   * name, HP, level or tier, and placement, save as template, and delete.
   * Placement lets a GM relocate an encounter without deleting and
   * recreating it.
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

    // In Play, the stat block is read-mostly. Base values cannot be
    // edited or removed here, since that is the Build rail's job. A click
    // on a chip applies a timed plus or minus adjustment that counts down
    // with the combat rounds.
    mountStatBlockBar(row, {
      mode: 'temp',
      getEntity: () => encounter,
      onAddModifier: (stat, delta, rounds) =>
        updateOne(encounter, (e) => addStatModifier(e, stat, delta, rounds)),
    });

    // A GM tracks an encounter's status conditions, for example poisoned
    // or prone, on its row. An edit writes the whole list back through onUpdate.
    mountConditionsBar(row, {
      getConditions: () => encounter.conditions ?? [],
      onChange: (next) => updateOne(encounter, (e) => ({ ...e, conditions: next })),
    });

    // Exhaustion has its own callback rather than going through onUpdate,
    // because the sixth level takes the creature to 0 HP and logs the defeat.
    const onSetExhaustion = callbacks.onSetExhaustion;
    if (onSetExhaustion) {
      mountExhaustionBar(row, {
        getEntity: () => encounter,
        onSet: (level) => onSetExhaustion(encounter, level),
      });
    }
  }

  // A player sees a coarse status band and no controls. The GM sees exact
  // HP and the full damage, heal, and condition controls. The gate value
  // is what each list passes to its row builders as gm, and it also drops
  // the add controls.
  const gate = () => !callbacks.getRole || isGM(callbacks.getRole());

  /** What both lists share. They differ only in rows and add controls. */
  const rowOptions = {
    className: 'encounter-panel__list',
    classes: {
      row: 'encounter-panel__row u-col u-g1',
      head: 'u-row u-g2',
      rowModifiers: /** @param {Encounter} e */ (e) => [
        isDefeated(e) && 'encounter-panel__row--defeated',
      ],
    },
    buildBody,
    actions,
    buildExtras,
    gate,
    addPlacement: /** @type {const} */ ('trailing'),
  };

  const activePanel = el('div');
  const nearbyPanel = el('div');
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

  /**
   * The Active tab's add controls: Start combat, when a fight can begin and
   * the caller offers the entry into one. This is the only part of the tab
   * that no row describes, so it is also what the panel's `dependsOn`
   * reads. One function serves both, so the guard and the button cannot
   * disagree about whether the button belongs on screen.
   * @returns {import('./listPanel.js').AddButton[]}
   */
  function activeAddButtons() {
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
  }

  const activeList = mountListPanel(activePanel, {
    ...rowOptions,
    getRows: () => callbacks.getActiveEncounters(),
    emptyMessage: 'No active encounter.',
    addButtons: activeAddButtons,
    dependsOn: () => activeAddButtons().length,
  });

  const nearbyList = mountListPanel(nearbyPanel, {
    ...rowOptions,
    getRows: () => callbacks.getNearbyEncounters(),
    emptyMessage: 'No encounters nearby.',
    classes: { ...rowOptions.classes, add: 'encounter-panel__add' },
    addButtons: () => [
      // The caller creates and stores the encounter. A non-null return
      // only signals that the visible list can have changed.
      callbacks.onAdd ? { label: 'New encounter', icon: 'add', onClick: callbacks.onAdd } : null,
      callbacks.onAddFromTemplate
        ? { label: 'From bestiary', icon: 'scroll', onClick: callbacks.onAddFromTemplate }
        : null,
    ],
  });

  function update() {
    // Walking onto something jumps to the Active tab exactly once. Walking
    // off the last of it falls back to Nearby. Between these events, the
    // selection belongs to the user. Either tab stays selectable even
    // when empty.
    const hasActive = callbacks.getActiveEncounters().length > 0;
    if (hasActive !== hadActive) tabs.select(hasActive ? 'active' : 'nearby');
    hadActive = hasActive;
    activeList.update();
    nearbyList.update();
  }

  update();
  return { update };
}
