import { settleHPBuffs } from '../entities/HPBuffs.js';
import { addStatModifier, applyDamage, heal, isDefeated } from '../entities/Creature.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { mountExhaustionBar } from './ExhaustionBar.js';
import { mountStatBlockBar } from './StatBlockBar.js';
import { proficiencySummary } from '../entities/CreatureChecks.js';
import { defensesSummary } from '../entities/DamageDefenses.js';
import { casterSummary } from '../entities/Caster.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { mountListPanel } from './listPanel.js';
import { mountNearbyList } from './NearbyList.js';
import { buildTabs } from './Tabs.js';
import { isGM, hpBand } from '../view/ViewRole.js';
import { clampInt } from '../util/num.js';
import { describeTile } from '../map/TileCoords.js';

/** @typedef {import('../types/creature.js').Creature} Encounter */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the encounter panel: an Active encounter and Nearby encounters tab
 * pair, always shown, each tab holding one list panel. The Active tab
 * lists the standing hostile creatures at and around the party's tile, and
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
 *   getDifficulty?: () => string,
 *   getRole?: () => ViewRole,
 *   getLabel?: (encounter: Encounter) => string,
 *   canAddToFight?: (encounter: Encounter) => boolean,
 *   onAddToFight?: (encounter: Encounter) => void,
 *   getPosition?: () => { nodeId: string, tileId: string } | null,
 * }} callbacks
 * `getLabel` gives the name a row shows, such as "Roadside Bandit 2" for the
 * second of two foes with one name.
 * `getDifficulty` gives one line rating the fight where the party stands, shown
 * above the Active rows for the GM alone. An empty string shows nothing.
 * If `onStartCombat` is set, the Active tab's action row gains a Start
 * combat button whenever `canStartCombat` allows it, when no fight is
 * already running. This is the entry into the initiative flow, which
 * players do not get.
 * `canAddToFight` and `onAddToFight` give a Nearby row an "Add to fight"
 * button for the GM, on each row that `canAddToFight` allows.
 * `getPosition` gives the party's tile, which the Nearby tab measures each
 * foe's distance from. The Nearby tab lists its foes in groups (see
 * `NearbyList.js`).
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

  /** The row's name, numbered when two foes share it (see `getLabel`).
   * @param {Encounter} encounter */
  const nameOf = (encounter) => callbacks.getLabel?.(encounter) ?? encounter.name;

  /** @param {Encounter} encounter @returns {number} */
  const amountOf = (encounter) => clampInt(amounts.get(encounter)?.value, 0);

  /** @param {Encounter} encounter @param {(encounter: Encounter) => Encounter} fn */
  function updateOne(encounter, fn) {
    callbacks.onUpdate(fn(encounter));
    nearbyList.update();
    // A row write can defeat or revive a foe, which moves the rating. The
    // list panel repaints only its own rows after an action, so the
    // difficulty line re-derives here.
    renderDifficulty();
  }

  /**
   * The label, plus, for the GM, the amount input that the damage and
   * heal buttons read.
   * @param {Encounter} encounter
   * @param {{ gm: boolean }} ctx
   * @returns {Node[]}
   */
  function buildBody(encounter, ctx) {
    // A bound encounter shows its column and row, counted from 1 as on the
    // map edge. This lets the GM tell two same-named foes apart and see
    // where in the region it is staged.
    // The name has a line of its own, and the HP and place go below it,
    // muted. Each of the two facts keeps to one line, so a narrow sidebar
    // breaks between them instead of inside "column 14, row 5".
    const detail = ctx.gm
      ? [
          `HP ${encounter.currentHP}/${encounter.maxHP}`,
          encounter.location ? describeTile(encounter.location.tileId) : null,
        ]
      : [hpBand(encounter.currentHP, encounter.maxHP)];
    const label = el('span', 'encounter-panel__label u-col');
    label.append(
      el('span', 'encounter-panel__name', nameOf(encounter)),
      ...detail.flatMap((text) =>
        text ? [el('span', 'encounter-panel__detail u-muted', text)] : [],
      ),
    );

    // A player's view stops at the name and its status band. It shows no
    // HP numbers, no damage, heal, or delete controls, no condition
    // editing, and no add button.
    if (!ctx.gm) return [label];

    const amountInput = numberField(1, {
      min: 0,
      className: 'encounter-panel__amount',
      ariaLabel: `Damage or heal amount for ${nameOf(encounter)}`,
    });
    amounts.set(encounter, amountInput);
    // The visible caption says what the number is for. The input keeps its
    // own name with the creature in it, so a screen reader tells the rows
    // apart.
    const amount = el('label', 'encounter-panel__amount-field u-col');
    amount.append(el('span', 'encounter-panel__amount-caption', 'Amount'), amountInput);

    return [label, amount];
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
        label: `Damage ${nameOf(encounter)}`,
        variant: 'danger',
        onClick: () => updateOne(encounter, (e) => applyDamage(e, amountOf(encounter))),
      },
      {
        icon: 'heal',
        label: `Heal ${nameOf(encounter)}`,
        variant: 'success',
        onClick: () => updateOne(encounter, (e) => heal(e, amountOf(encounter))),
      },
      callbacks.onEdit
        ? {
            icon: 'edit',
            label: `Edit ${nameOf(encounter)}`,
            title: 'Edit',
            onClick: () => callbacks.onEdit?.(encounter),
          }
        : null,
      {
        icon: 'save',
        label: `Save ${nameOf(encounter)} as a bestiary template`,
        title: 'Save as template',
        onClick: () => callbacks.onSaveTemplate?.(encounter),
      },
      {
        icon: 'remove',
        label: `Delete ${nameOf(encounter)}`,
        variant: 'danger',
        onClick: async () => {
          const ok = callbacks.confirmDelete ? await callbacks.confirmDelete(encounter) : true;
          if (!ok) return false;
          callbacks.onDelete(encounter.id);
          renderDifficulty();
          nearbyList.update();
        },
      },
    ];
  }

  /**
   * The stat block and condition bars below a GM's row.
   * @param {Encounter} encounter
   * @param {HTMLElement} row
   * @param {import('./listPanel.js').RowContext<Encounter>} ctx
   */
  function buildExtras(encounter, row, ctx) {
    if (!ctx.gm) return;

    // In Play, the stat block is read-mostly. Base values cannot be
    // edited or removed here, since that is the Build rail's job. A click
    // on a chip applies a timed plus or minus adjustment that counts down
    // with the combat rounds.
    // What the creature is trained in, so the GM can call for a save or a check
    // without opening the Build rail. The bonus already carries a timed stat
    // adjustment and any exhaustion. It sits above the chips, as it does on the
    // Build rail row.
    const trained = proficiencySummary(encounter);
    if (trained) row.appendChild(el('div', 'u-muted', trained));
    const defended = defensesSummary(encounter.defenses);
    if (defended) row.appendChild(el('div', 'u-muted', defended));

    // What the creature casts as, with its remaining slots. Derived the same
    // way, so the numbers match what a cast spends and rolls.
    const casting = casterSummary(encounter);
    if (casting) row.appendChild(el('div', 'u-muted', casting));

    mountStatBlockBar(row, {
      mode: 'temp',
      getEntity: () => encounter,
      onAddModifier: (stat, delta, rounds) =>
        updateOne(encounter, (e) => addStatModifier(e, stat, delta, rounds)),
    });

    // A GM tracks an encounter's status conditions, for example poisoned
    // or prone, on its row. An edit writes the whole list back through onUpdate.
    // The bar reads `encounter`, which is the row's copy from before the
    // edit, so the list repaints its rows to show the stored chips.
    mountConditionsBar(row, {
      getConditions: () => encounter.conditions ?? [],
      onChange: (next) => {
        updateOne(encounter, (e) => settleHPBuffs({ ...e, conditions: next }));
        ctx.render();
      },
    });

    // Exhaustion has its own callback rather than going through onUpdate,
    // because the sixth level takes the creature to 0 HP and logs the defeat.
    const onSetExhaustion = callbacks.onSetExhaustion;
    if (onSetExhaustion) {
      mountExhaustionBar(row, {
        getEntity: () => encounter,
        onSet: (level) => {
          onSetExhaustion(encounter, level);
          nearbyList.update();
          // The sixth level defeats the creature, which moves the rating.
          renderDifficulty();
        },
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

  // The difficulty hint sits above the Active rows, because it describes the
  // whole group rather than any one row. It is GM-only: it names how hard the
  // fight ahead is, which the players are meant to find out by fighting it.
  const difficulty = el('div', 'encounter-panel__difficulty u-muted');
  activePanel.appendChild(difficulty);

  function renderDifficulty() {
    const line = gate() ? (callbacks.getDifficulty?.() ?? '') : '';
    difficulty.textContent = line;
    difficulty.hidden = line === '';
  }

  const activeList = mountListPanel(activePanel, {
    ...rowOptions,
    getRows: () => callbacks.getActiveEncounters(),
    emptyMessage: 'No active encounter.',
    addButtons: activeAddButtons,
    dependsOn: () => activeAddButtons().length,
  });

  // A Nearby row gains "Add to fight" while a fight runs that the creature
  // is not part of. The joinable ids are what the row actions depend on
  // beyond the rows, so the list repaints when a fight starts or ends.
  const joinable = () =>
    callbacks
      .getNearbyEncounters()
      .filter((e) => callbacks.canAddToFight?.(e))
      .map((e) => e.id)
      .join(',');
  /** @type {typeof actions} */
  const nearbyActions = (encounter, ctx) => [
    ...(ctx.gm && callbacks.canAddToFight?.(encounter)
      ? [
          {
            icon: /** @type {const} */ ('sword'),
            label: `Add ${nameOf(encounter)} to the fight`,
            title: 'Add to fight',
            focusKey: `add-to-fight:${encounter.id}`,
            onClick: () => {
              const at = addToFightButtons().findIndex((b) => b === document.activeElement);
              callbacks.onAddToFight?.(encounter);
              focusAfterAdd(at);
            },
          },
        ]
      : []),
    ...actions(encounter, ctx),
  ];

  const addToFightButtons = () =>
    [...nearbyPanel.querySelectorAll('button[data-focus-key^="add-to-fight:"]')].map(
      (b) => /** @type {HTMLElement} */ (b),
    );

  /**
   * The joined foe leaves the Nearby rows, so its button leaves the
   * document and focus would fall to the page body. Focus moves to the
   * "Add to fight" button that now sits at the same place, so the GM can
   * add the next foe, or to the last one. With none left, it moves to the
   * selected tab.
   * @param {number} at the index of the pressed button, or -1
   */
  function focusAfterAdd(at) {
    const buttons = addToFightButtons();
    const next = buttons[Math.min(Math.max(at, 0), buttons.length - 1)];
    const tab = /** @type {HTMLElement | null} */ (
      tabs.tablist.querySelector('[aria-selected="true"]')
    );
    (next ?? tab)?.focus();
  }

  const nearbyList = mountNearbyList(nearbyPanel, {
    list: { ...rowOptions, actions: nearbyActions, dependsOn: joinable, emptyMessage: '' },
    getRows: () => callbacks.getNearbyEncounters(),
    getPosition: () => callbacks.getPosition?.() ?? null,
    gate,
    emptyMessage: 'No encounters nearby.',
    addButtons: () => [
      // The caller creates and stores the encounter. A non-null return
      // only signals that the visible list can have changed.
      callbacks.onAdd ? { label: 'New creature', icon: 'add', onClick: callbacks.onAdd } : null,
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
    renderDifficulty();
    activeList.update();
    nearbyList.update();
  }

  update();
  return { update };
}
