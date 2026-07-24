import { addStatModifier, applyDamage, heal, isDefeated } from '../entities/Encounter.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { mountStatBlockBar } from './StatBlockBar.js';
import { icon } from './icons.js';
import { isGM, hpBand } from '../view/ViewRole.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the encounter panel: an "Active encounter" / "Nearby encounters" tab
 * pair. The Active tab exists only while the party stands on a tile with a
 * live encounter — it lists what the party has walked into and carries the
 * GM's "Start combat" button; stepping onto such a tile switches to it. The
 * Nearby tab lists everything else in range plus the authoring buttons. With
 * no active encounter the tabs collapse to the plain nearby list. Each row
 * shows an HP readout and a damage/heal amount applied via two buttons;
 * defeated encounters (currentHP <= 0) render with a distinguishing class
 * instead of being removed, so a GM can still see what died.
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

  /** @type {'active' | 'nearby'} which tab shows; forced sensible on render */
  let activeTab = 'nearby';
  /** whether the previous render had an active encounter, so gaining one
   * switches to the Active tab exactly once (not on every re-render) */
  let hadActive = false;

  /** @param {Encounter} encounter @param {(encounter: Encounter) => Encounter} fn */
  function updateOne(encounter, fn) {
    callbacks.onUpdate(fn(encounter));
    render();
  }

  /**
   * One encounter's row: label with HP readout, then for the GM the
   * damage/heal/edit/template/delete controls and the stat/condition bars.
   * @param {Encounter} encounter
   * @param {boolean} gm
   * @returns {HTMLElement}
   */
  function buildRow(encounter, gm) {
    const row = document.createElement('div');
    row.className = 'encounter-panel__row';
    if (isDefeated(encounter)) row.classList.add('encounter-panel__row--defeated');

    // A bound encounter shows its tile coordinates so the GM can tell two
    // same-named foes apart and see where in the region it's staged.
    const coords = encounter.location ? ` @ (${encounter.location.tileId})` : '';
    const label = document.createElement('span');
    label.className = 'encounter-panel__label';
    label.textContent = gm
      ? `${encounter.name} (${encounter.currentHP}/${encounter.maxHP})${coords}`
      : `${encounter.name} — ${hpBand(encounter.currentHP, encounter.maxHP)}`;

    // Player view stops at the name and its status band: no HP numbers, no
    // damage/heal/delete controls, no condition editing, no add button.
    if (!gm) {
      const head = document.createElement('div');
      head.className = 'encounter-panel__head';
      head.appendChild(label);
      row.appendChild(head);
      return row;
    }

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.value = '1';
    amountInput.min = '0';
    amountInput.className = 'field encounter-panel__amount';
    amountInput.setAttribute('aria-label', `Damage/heal amount for ${encounter.name}`);

    const damageButton = document.createElement('button');
    damageButton.type = 'button';
    damageButton.className = 'btn btn--icon btn--danger';
    damageButton.setAttribute('aria-label', `Damage ${encounter.name}`);
    damageButton.appendChild(icon('damage'));
    damageButton.addEventListener('click', () => {
      updateOne(encounter, (e) => applyDamage(e, Number(amountInput.value)));
    });

    const healButton = document.createElement('button');
    healButton.type = 'button';
    healButton.className = 'btn btn--icon btn--success';
    healButton.setAttribute('aria-label', `Heal ${encounter.name}`);
    healButton.appendChild(icon('heal'));
    healButton.addEventListener('click', () => {
      updateOne(encounter, (e) => heal(e, Number(amountInput.value)));
    });

    // The full edit dialog (name, HP, level/tier, and crucially placement),
    // so relocating an encounter doesn't mean deleting and recreating it.
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--icon';
    editButton.setAttribute('aria-label', `Edit ${encounter.name}`);
    editButton.title = 'Edit';
    editButton.appendChild(icon('edit'));
    editButton.addEventListener('click', async () => {
      if (await callbacks.onEdit?.(encounter)) render();
    });

    const templateButton = document.createElement('button');
    templateButton.type = 'button';
    templateButton.className = 'btn btn--icon';
    templateButton.setAttribute('aria-label', `Save ${encounter.name} as a bestiary template`);
    templateButton.title = 'Save as template';
    templateButton.appendChild(icon('save'));
    templateButton.addEventListener('click', () => callbacks.onSaveTemplate?.(encounter));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn--icon';
    deleteButton.setAttribute('aria-label', `Delete ${encounter.name}`);
    deleteButton.appendChild(icon('remove'));
    deleteButton.addEventListener('click', async () => {
      const ok = callbacks.confirmDelete ? await callbacks.confirmDelete(encounter) : true;
      if (!ok) return;
      callbacks.onDelete(encounter.id);
      render();
    });

    const head = document.createElement('div');
    head.className = 'encounter-panel__head';
    head.append(label, amountInput, damageButton, healButton);
    if (callbacks.onEdit) head.appendChild(editButton);
    head.append(templateButton, deleteButton);
    row.appendChild(head);

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

    return row;
  }

  /**
   * The Active tab's panel: what the party stands on, plus the GM's entry
   * into combat.
   * @param {Encounter[]} active
   * @param {boolean} gm
   * @returns {HTMLElement}
   */
  function buildActivePanel(active, gm) {
    const panel = document.createElement('div');
    for (const encounter of active) panel.appendChild(buildRow(encounter, gm));

    const onStartCombat = callbacks.onStartCombat;
    if (onStartCombat && gm && (callbacks.canStartCombat?.() ?? true)) {
      const actions = document.createElement('div');
      actions.className = 'panel-actions';
      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'btn btn--primary encounter-panel__start-combat';
      startButton.append(icon('sword'), document.createTextNode('Start combat'));
      startButton.addEventListener('click', () => onStartCombat());
      actions.appendChild(startButton);
      panel.appendChild(actions);
    }
    return panel;
  }

  /**
   * The Nearby tab's panel: everything in range but not underfoot, plus the
   * GM's authoring buttons.
   * @param {Encounter[]} nearby
   * @param {boolean} gm
   * @returns {HTMLElement}
   */
  function buildNearbyPanel(nearby, gm) {
    const panel = document.createElement('div');
    if (nearby.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No encounters nearby.';
      panel.appendChild(empty);
    }
    for (const encounter of nearby) panel.appendChild(buildRow(encounter, gm));

    const actions = document.createElement('div');
    actions.className = 'panel-actions';

    const onAdd = callbacks.onAdd;
    if (onAdd && gm) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn encounter-panel__add';
      addButton.append(icon('add'), document.createTextNode('New encounter'));
      addButton.addEventListener('click', async () => {
        // The caller creates and stores the encounter; a non-null return just
        // signals that the visible list may have changed.
        if (await onAdd()) render();
      });
      actions.appendChild(addButton);
    }

    const onAddFromTemplate = callbacks.onAddFromTemplate;
    if (onAddFromTemplate && gm) {
      const bestiaryButton = document.createElement('button');
      bestiaryButton.type = 'button';
      bestiaryButton.className = 'btn encounter-panel__add';
      bestiaryButton.append(icon('scroll'), document.createTextNode('From bestiary'));
      bestiaryButton.addEventListener('click', async () => {
        if (await onAddFromTemplate()) render();
      });
      actions.appendChild(bestiaryButton);
    }

    if (actions.childElementCount > 0) panel.appendChild(actions);
    return panel;
  }

  function render() {
    root.innerHTML = '';
    const active = callbacks.getActiveEncounters();
    const nearby = callbacks.getNearbyEncounters();
    // Players see a coarse status band and no controls; the GM sees exact HP
    // and the full damage/heal/condition/roster machinery.
    const gm = !callbacks.getRole || isGM(callbacks.getRole());

    // The Active tab exists only while something is underfoot. Gaining an
    // active encounter jumps to it; losing the last one falls back to Nearby.
    const hasActive = active.length > 0;
    if (!hasActive) activeTab = 'nearby';
    else if (!hadActive) activeTab = 'active';
    hadActive = hasActive;

    const nearbyPanel = buildNearbyPanel(nearby, gm);
    if (!hasActive) {
      root.appendChild(nearbyPanel);
      return;
    }

    const panels = {
      active: buildActivePanel(active, gm),
      nearby: nearbyPanel,
    };
    const tablist = document.createElement('div');
    tablist.className = 'tabs encounter-panel__tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Active and nearby encounters');
    const tabs = /** @type {const} */ ([
      ['active', 'Active encounter'],
      ['nearby', 'Nearby encounters'],
    ]).map(([key, text]) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tabs__tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = text;
      const selected = activeTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[key].hidden = !selected;
      tab.addEventListener('click', () => {
        activeTab = key;
        render();
      });
      return tab;
    });
    tablist.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      activeTab = activeTab === 'active' ? 'nearby' : 'active';
      render();
      const nextTab = /** @type {HTMLElement | null} */ (root.querySelector('[role=tab][aria-selected=true]'));
      nextTab?.focus();
    });
    tablist.append(...tabs);

    root.append(tablist, panels.active, panels.nearby);
  }

  render();
  return { update: render };
}
