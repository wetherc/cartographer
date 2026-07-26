import {
  addXP,
  getHP,
  setMaxHP,
  setBonusHP,
  setBaseAC,
  damageCharacter,
  spendResource,
  restoreResource,
  XP_PER_LEVEL,
} from '../entities/Character.js';
import { armorClass, statBreakdown } from '../entities/Equipment.js';
import {
  getSlotPools,
  getPactPool,
  isSlotPool,
  isPactPool,
  slotLevelOf,
} from '../entities/SpellSlots.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { buildSpellsSection } from './CharacterSpells.js';
import { iconButton, textButton, emptyState } from './buttons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Open a popover breaking one ability score into its parts: the base value,
 * each equipped item that shifts it (with its signed delta), and the resulting
 * total and modifier. This is where the base score lives now that the badge
 * shows only the effective total. Duration is not modeled yet — item buffs read
 * "while equipped"; a future condition/spell source can add a real duration.
 * @param {string} key
 * @param {{ base: number, total: number, sources: { source: string, delta: number }[] }} breakdown
 */
function openStatBreakdown(key, breakdown) {
  const { base, total, sources } = breakdown;
  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  const dialog = document.createElement('dialog');
  dialog.className = 'modal stat-breakdown';

  const heading = document.createElement('h2');
  heading.className = 'modal__title';
  heading.textContent = `${key} ${total}`;

  const mod = document.createElement('p');
  mod.className = 'stat-breakdown__mod';
  mod.textContent = `Modifier ${formatModifier(abilityModifier(total))}`;

  const rows = document.createElement('dl');
  rows.className = 'stat-breakdown__rows';
  /** @param {string} label @param {string} value @param {string} [ddCls] @param {string} [rowCls] */
  const addRow = (label, value, ddCls, rowCls) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (rowCls) dt.className = rowCls;
    dd.className = [ddCls, rowCls].filter(Boolean).join(' ');
    rows.append(dt, dd);
  };
  addRow('Base', String(base));
  for (const { source, delta } of sources) {
    addRow(
      `${source} (while equipped)`,
      `${delta > 0 ? '+' : ''}${delta}`,
      delta < 0 ? 'stat-breakdown__debuff' : 'stat-breakdown__buff',
    );
  }
  addRow('Total', String(total), undefined, 'stat-breakdown__total');

  const actions = document.createElement('div');
  actions.className = 'modal__actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn--primary';
  close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  actions.appendChild(close);

  dialog.append(heading, mod, rows, actions);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    opener?.focus?.();
  });
  dialog.showModal();
  close.focus();
}

/**
 * Draw the face-on d20 wireframe behind an ability score: the hexagonal
 * silhouette, the central point-down face the score sits in, and the facet
 * edges out to the remaining corners. Strokes inherit currentColor so the
 * buffed/debuffed tint colors the whole die.
 * @returns {SVGSVGElement}
 */
function d20Face() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'stat-badge__d20');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  // Point-up hexagon corners; the central face joins the two upper-side
  // corners to the bottom point, so its centroid is the badge's midpoint.
  const A = '50,3';
  const B = '90.7,26.5';
  const C = '90.7,73.5';
  const D = '50,97';
  const E = '9.3,73.5';
  const F = '9.3,26.5';
  /** @param {string} tag @param {Record<string, string>} attrs */
  const shape = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  };
  shape('polygon', { class: 'stat-badge__d20-hull', points: `${A} ${B} ${C} ${D} ${E} ${F}` });
  shape('path', {
    class: 'stat-badge__d20-facets',
    d: `M${A} L${F} M${A} L${B} M${C} L${B} M${C} L${D} M${E} L${F} M${E} L${D}`,
  });
  shape('polygon', { class: 'stat-badge__d20-face', points: `${F} ${B} ${D}` });
  return svg;
}

/**
 * Build one ability-score badge: a d20-style die showing the effective score
 * (base + equipped buffs) over its derived modifier, labeled with the ability
 * key. The whole badge is a button opening {@link openStatBreakdown}. A buffed
 * or debuffed total is tinted so a modified score is obvious at a glance.
 * @param {Character} character
 * @param {string} key
 * @returns {HTMLElement}
 */
function statBadge(character, key) {
  const breakdown = statBreakdown(character, key);
  const { base, total } = breakdown;
  const modText = formatModifier(abilityModifier(total));

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'stat-badge';
  if (total > base) badge.classList.add('stat-badge--buffed');
  else if (total < base) badge.classList.add('stat-badge--debuffed');
  const note = total !== base ? ` (base ${base})` : '';
  badge.setAttribute('aria-label', `${key} ${total}, modifier ${modText}${note}. Show breakdown.`);
  badge.title = 'Show breakdown';

  const keyEl = document.createElement('span');
  keyEl.className = 'stat-badge__key';
  keyEl.textContent = key;

  const die = document.createElement('span');
  die.className = 'stat-badge__die';
  die.appendChild(d20Face());
  const score = document.createElement('span');
  score.className = 'stat-badge__score';
  score.textContent = String(total);
  die.appendChild(score);

  const modEl = document.createElement('span');
  modEl.className = 'stat-badge__mod';
  modEl.textContent = modText;

  badge.append(keyEl, die, modEl);
  badge.addEventListener('click', () => openStatBreakdown(key, breakdown));
  return badge;
}

/**
 * Build a stat bar (HP) shown on the collapsed card, one full-width line per
 * pool: a visible label, the fill track, and the numbers. Absence of the pool
 * (older saves) renders no bar rather than a fake full one.
 * @param {ResourcePool} pool
 * @param {{ modifier: string, label: string, critical?: boolean, bonus?: number,
 *   flank?: { before: HTMLElement, after: HTMLElement } }} opts
 *   `modifier` selects the fill colour; `critical` arms the low-fill red
 *   state; `bonus` appends a "+N" readout for temporary points on top of the
 *   pool (bonus HP); `flank` places a control on either side of the track
 *   (damage/heal steppers), keeping the numeric readout after them.
 * @returns {HTMLElement}
 */
function buildStatBar(pool, opts) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar';
  if (!opts.flank) wrap.setAttribute('role', 'img');
  const bonusReadout = opts.bonus ? `, plus ${opts.bonus} bonus` : '';
  wrap.setAttribute('aria-label', `${opts.label} ${pool.current} of ${pool.max}${bonusReadout}`);

  const label = document.createElement('span');
  label.className = 'stat-bar__label';
  label.textContent = opts.label;
  wrap.appendChild(label);

  if (opts.flank) wrap.appendChild(opts.flank.before);

  const track = document.createElement('span');
  track.className = 'stat-bar__track';
  const fill = document.createElement('span');
  fill.className = `stat-bar__fill stat-bar__fill--${opts.modifier}`;
  const ratio = pool.max > 0 ? pool.current / pool.max : 0;
  fill.style.width = `${Math.round(ratio * 100)}%`;
  if (opts.critical && ratio <= 0.25) fill.classList.add('stat-bar__fill--critical');
  track.appendChild(fill);
  wrap.appendChild(track);

  if (opts.flank) wrap.appendChild(opts.flank.after);

  const text = document.createElement('span');
  text.className = 'stat-bar__text';
  text.textContent = `${pool.current}/${pool.max}`;
  wrap.appendChild(text);

  if (opts.bonus) {
    const bonus = document.createElement('span');
    bonus.className = 'stat-bar__bonus';
    bonus.textContent = `+${opts.bonus}`;
    bonus.title = 'Bonus HP';
    wrap.appendChild(bonus);
  }
  return wrap;
}

/**
 * Compact spell-slot readout: a column per spell level, the ordinal centered
 * above a two-wide grid of pips, filled pips being the slots still unspent.
 * Columns wrap under the pip area (not the label) when a high-level caster
 * outgrows the card width. With `onToggle` each pip is a button: clicking a
 * filled pip spends a slot of that level, clicking an empty one restores one
 * (slots drain and refill left to right, so it reads as toggling that pip).
 * Without it (a spectator's view) the line is a plain readout.
 * A non-caster (no slot pools) renders nothing.
 * @param {import('../types/entities.js').ResourcePool[]} pools
 * @param {((pool: import('../types/entities.js').ResourcePool, spent: boolean) => void) | null} onToggle
 * @returns {HTMLElement}
 */
function buildSlotLine(pools, onToggle) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar slot-line';
  /** @param {import('../types/entities.js').ResourcePool} p */
  const slotNoun = (p) => (isPactPool(p) ? 'pact slot' : 'slot');
  if (!onToggle) {
    const readout = pools
      .map((p) => `level ${slotLevelOf(p)} ${slotNoun(p)}s: ${p.current} of ${p.max}`)
      .join(', ');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Spell slots — ${readout}`);
  }

  const label = document.createElement('span');
  label.className = 'stat-bar__label';
  label.textContent = 'Slots';
  wrap.appendChild(label);

  /** @param {number} n */
  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const groups = document.createElement('span');
  groups.className = 'slot-line__groups';
  for (const pool of pools) {
    const group = document.createElement('span');
    group.className = 'slot-line__group';
    const level = document.createElement('span');
    level.className = 'slot-line__level';
    level.textContent = isPactPool(pool)
      ? `${ordinal(slotLevelOf(pool))} pact`
      : ordinal(slotLevelOf(pool));
    const pips = document.createElement('span');
    pips.className = 'slot-line__pips';
    for (let i = 0; i < pool.max; i += 1) {
      const available = i < pool.current;
      /** @type {HTMLElement} */
      let pip;
      if (onToggle) {
        pip = document.createElement('button');
        pip.setAttribute('type', 'button');
        pip.className = 'slot-line__pip';
        pip.setAttribute(
          'aria-label',
          available
            ? `Spend a level ${slotLevelOf(pool)} ${slotNoun(pool)}`
            : `Restore a level ${slotLevelOf(pool)} ${slotNoun(pool)}`,
        );
        pip.title = available ? 'Click to spend' : 'Click to restore';
        pip.addEventListener('click', () => onToggle(pool, available));
      } else {
        pip = document.createElement('span');
      }
      pip.textContent = available ? '●' : '○';
      pips.appendChild(pip);
    }
    group.append(level, pips);
    groups.appendChild(group);
  }
  wrap.appendChild(groups);
  return wrap;
}

/**
 * Mount a character card: a glanceable head (name / race / HP healthbar / spell
 * slots) over the full sheet — XP control, ability scores, and resource pools
 * (HP included) with spend/restore steppers. The card does not collapse; the
 * head and body always read top to bottom.
 * Renders an empty state when no character is selected (`null`).
 * `getPermissions` scopes what the viewer may touch: without `editBase` the
 * stats and XP render read-only, without `play` the pool steppers and
 * condition controls disappear too (a spectator's view of the sheet), and the
 * HP damage/heal steppers additionally require `hp` (GM-only — damage and
 * healing are adjudicated, not self-served).
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @param {() => { editBase: boolean, play: boolean, hp: boolean }} [getPermissions]
 * @param {{
 *   resolveSpells: (ids: string[]) => import('../types/spell.js').Spell[],
 *   onCast: (character: Character, spell: import('../types/spell.js').Spell) => void,
 * } | null} [spells]
 *   When provided, the sheet renders a read-only castable-spells section
 *   (cantrips and prepared spells, each opening a Cast/Close detail); learning
 *   and preparing live in the Spellbook tab. Omitted, no such section appears.
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(
  container,
  initial,
  onChange = () => {},
  getPermissions = () => ({ editBase: true, play: true, hp: true }),
  spells = null,
) {
  let current = initial;

  const root = document.createElement('div');
  root.className = 'character-sheet';
  container.appendChild(root);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    render();
  }

  function render() {
    root.innerHTML = '';

    // Captured non-null so listeners created below keep the narrowing.
    const character = current;
    if (!character) {
      root.appendChild(emptyState('No character selected.'));
      return;
    }
    const perms = getPermissions();

    const summary = document.createElement('div');
    summary.className = 'character-sheet__summary';

    // Top line: name / race. The HP bar and the spell-slot pips get a
    // full-width line each below it, so both read at a glance.
    const summaryTop = document.createElement('span');
    summaryTop.className = 'character-sheet__summary-top';

    const name = document.createElement('span');
    name.className = 'character-sheet__name';
    name.textContent = character.name;
    summaryTop.appendChild(name);

    if (character.race) {
      const race = document.createElement('span');
      race.className = 'character-sheet__race';
      race.textContent = character.race;
      summaryTop.appendChild(race);
    }

    summary.appendChild(summaryTop);

    // Name, HP bar, and slot pips sit in the always-visible head; the sheet no
    // longer collapses, so the body's stats follow directly beneath.
    const head = document.createElement('div');
    head.className = 'character-sheet__head';
    head.appendChild(summary);

    const hp = getHP(character);
    if (hp) {
      const hpLine = document.createElement('div');
      hpLine.className = 'character-sheet__hp-line';
      /** @type {{ before: HTMLElement, after: HTMLElement } | undefined} */
      let flank;
      if (perms.hp) {
        // Bonus HP absorbs the hit before the pool does.
        const damageButton = iconButton(
          'minus',
          `Damage ${character.name} by 1`,
          () => commit(damageCharacter(character, 1)),
          { variant: 'danger', className: 'character-sheet__hp-step' },
        );
        const healButton = iconButton(
          'heal',
          `Heal ${character.name} by 1`,
          () => commit(restoreResource(character, 'hp', 1)),
          { variant: 'success', className: 'character-sheet__hp-step' },
        );
        flank = { before: damageButton, after: healButton };
      }
      // Reads "HP  - [bar] +  current/max +bonus": steppers hug the track,
      // the numbers sit after them on the right.
      hpLine.appendChild(
        buildStatBar(hp, {
          modifier: 'hp',
          label: 'HP',
          critical: true,
          bonus: character.bonusHP ?? 0,
          flank,
        }),
      );
      head.appendChild(hpLine);
    }

    const pact = getPactPool(character);
    const slots = [...getSlotPools(character), ...(pact ? [pact] : [])];
    if (slots.length > 0) {
      head.appendChild(
        buildSlotLine(
          slots,
          perms.play
            ? (pool, spent) =>
                commit(
                  spent
                    ? spendResource(character, pool.id, 1)
                    : restoreResource(character, pool.id, 1),
                )
            : null,
        ),
      );
    }

    const body = document.createElement('div');
    body.className = 'character-sheet__body';

    // Level, derived AC, and XP progress share the section header line; the
    // controls below are laid out like stat rows, so their inputs line up
    // with the ability-score inputs underneath them.
    const header = document.createElement('div');
    header.className = 'character-sheet__header';
    const levelText = document.createElement('span');
    levelText.textContent = `Level ${character.level}`;
    const headerMeta = document.createElement('span');
    headerMeta.className = 'character-sheet__header-meta';
    const acBadge = document.createElement('span');
    acBadge.className = 'character-sheet__ac';
    acBadge.textContent = `AC ${armorClass(character)}`;
    acBadge.title =
      'Armor class: equipped body armor sets base AC + DEX per its weight class ' +
      '(light: full, medium: max +2, heavy: none); unarmored is base AC + DEX. ' +
      'Shields add +2; other equipped items add their flat bonuses.';
    const xpProgress = document.createElement('span');
    xpProgress.className = 'character-sheet__xp-progress';
    xpProgress.textContent = `XP ${character.xp} / ${character.level * XP_PER_LEVEL}`;
    headerMeta.append(acBadge, xpProgress);
    header.append(levelText, headerMeta);
    body.appendChild(header);

    /**
     * A labeled numeric row sharing the stat rows' key/input geometry.
     * @param {string} key
     * @param {number} value
     * @param {string} ariaLabel
     * @param {(value: number) => void} onCommit fires on change with the parsed value
     * @returns {{ row: HTMLElement, input: HTMLInputElement }}
     */
    function buildFieldRow(key, value, ariaLabel, onCommit) {
      const row = document.createElement('div');
      row.className = 'character-sheet__field-row';
      const keyText = document.createElement('span');
      keyText.className = 'character-sheet__stat-key';
      keyText.textContent = key;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field character-sheet__stat-input';
      input.value = String(value);
      input.min = '0';
      input.setAttribute('aria-label', ariaLabel);
      input.addEventListener('change', () => onCommit(Number(input.value)));
      row.append(keyText, input);
      return { row, input };
    }

    // The XP award is an action (input + button), so it stays on its own full
    // width row above the aligned field grid rather than in it.
    if (perms.editBase) {
      const { row: xpRow, input: xpInput } = buildFieldRow('XP', 0, 'XP to add', () => {});
      xpRow.classList.add('character-sheet__xp-row');
      const xpButton = textButton(
        'XP',
        () => {
          const amount = Number(xpInput.value);
          if (amount > 0) commit(addXP(character, amount));
        },
        { icon: 'add' },
      );
      xpRow.appendChild(xpButton);
      body.appendChild(xpRow);
    }

    // The editable HP/AC fields sit in a grid that mirrors the ability-score
    // grid below, so their keys and inputs line up in the same columns.
    const fields = document.createElement('div');
    fields.className = 'character-sheet__fields';

    // The GM's per-character max HP override; current HP clamps down if the
    // new maximum is below it.
    if (perms.editBase && hp) {
      const { row } = buildFieldRow('MAX HP', hp.max, `Maximum HP for ${character.name}`, (value) =>
        commit(setMaxHP(character, value)),
      );
      fields.appendChild(row);
    }

    // Bonus HP from items/boons, tracked on top of the intrinsic pool; damage
    // drains it first. Editable by anyone who can play the character.
    if (perms.play && hp) {
      const { row } = buildFieldRow(
        'BONUS HP',
        character.bonusHP ?? 0,
        `Bonus HP for ${character.name}`,
        (value) => commit(setBonusHP(character, value)),
      );
      fields.appendChild(row);
    }

    // Unarmored base AC, normally 10; effects like Mage Armor raise it. Only
    // in play while no body armor is equipped.
    if (perms.play) {
      const { row } = buildFieldRow(
        'BASE AC',
        character.baseAC ?? 10,
        `Unarmored base AC for ${character.name}`,
        (value) => commit(setBaseAC(character, value)),
      );
      fields.appendChild(row);
    }

    if (fields.children.length > 0) body.appendChild(fields);

    const statsList = document.createElement('div');
    statsList.className = 'character-sheet__stats';
    // Each ability reads as one d20-style badge showing the *effective* score
    // (base plus equipped-item buffs) over its derived modifier — the number a
    // player actually rolls with. The base and every contributing source live
    // one click away in the breakdown popover, so the common "what's my STR?"
    // question is answered at a glance without parsing "16 = 18 +4". Scores are
    // no longer edited inline; a dedicated character/level-up editor owns that.
    for (const key of Object.keys(character.stats)) {
      statsList.appendChild(statBadge(character, key));
    }
    body.appendChild(statsList);

    // HP and spell slots are managed on the always-visible head lines, so the
    // stepper list at the bottom only carries the custom pools.
    const customPools = character.resources.filter(
      (r) => r.id !== 'hp' && !isSlotPool(r) && !isPactPool(r),
    );
    if (customPools.length > 0) {
      const resources = document.createElement('div');
      resources.className = 'character-sheet__resources';
      for (const pool of customPools) {
        const row = document.createElement('div');
        row.className = 'character-sheet__resource-row';

        const label = document.createElement('span');
        label.className = 'character-sheet__resource-label';
        label.textContent = `${pool.name} ${pool.current}/${pool.max}`;
        row.appendChild(label);

        if (perms.play) {
          row.append(
            iconButton(
              'minus',
              `Spend one ${pool.name}`,
              () => commit(spendResource(character, pool.id, 1)),
              { variant: 'danger' },
            ),
            iconButton(
              'plus',
              `Restore one ${pool.name}`,
              () => commit(restoreResource(character, pool.id, 1)),
              { variant: 'success' },
            ),
          );
        }
        resources.appendChild(row);
      }
      body.appendChild(resources);
    }

    // Read-only castable spells: cantrips and prepared spells, each opening a
    // Cast/Close detail. Only for casters (the builder returns null otherwise)
    // and only when the host wired spell callbacks in.
    if (spells) {
      const spellsSection = buildSpellsSection(character, {
        play: perms.play,
        resolveSpells: spells.resolveSpells,
        onCast: (spell) => spells.onCast(character, spell),
      });
      if (spellsSection) body.appendChild(spellsSection);
    }

    const conditions = document.createElement('div');
    conditions.className = 'character-sheet__conditions';
    const conditionsLabel = document.createElement('span');
    conditionsLabel.className = 'section-label';
    conditionsLabel.textContent = 'Conditions';
    conditions.appendChild(conditionsLabel);
    mountConditionsBar(conditions, {
      getConditions: () => current?.conditions ?? [],
      onChange: (next) => commit({ ...character, conditions: next }),
      canEdit: () => getPermissions().play,
    });
    body.appendChild(conditions);

    root.append(head, body);
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync in an externally-updated character (e.g. from a sibling panel) and re-render. */
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}
