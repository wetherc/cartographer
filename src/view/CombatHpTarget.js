/**
 * Which combatant the GM's Damage and Heal box on the combat screen acts on.
 * The box names its target in its own select, so the GM sees who the number
 * goes to before clicking.
 */

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */

/**
 * The id the HP box targets. A pick in the box itself wins. Otherwise the
 * card selected on the board wins, then the combatant inspected in the left
 * column, then the combatant whose turn it is. Each candidate counts only
 * when it is a row with HP, so a stale id falls through to the next one.
 * @param {CombatView} view
 * @param {{ picked?: string | null, selectedId?: string | null, inspectedId?: string | null }} ids
 * @returns {string | null} null when no row has HP
 */
export function hpTargetId(view, { picked = null, selectedId = null, inspectedId = null }) {
  const withHP = new Set(view.rows.filter((r) => r.hp).map((r) => r.id));
  const current = view.rows[view.turnIndex]?.id ?? null;
  for (const id of [picked, selectedId, inspectedId, current]) {
    if (id && withHP.has(id)) return id;
  }
  return view.rows.find((r) => r.hp)?.id ?? null;
}
