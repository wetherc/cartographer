/** Which audience the app is rendering for: the GM sees full truth, players see an abstracted view. */
export type ViewRole = 'gm' | 'player';

/** What a viewer may do to one character's sheet. See `view/CharacterBinding.js`. */
export interface SheetPermissions {
  /** Edit base attributes: XP awards, maximum HP, bonus HP, base AC, level and feat choices. */
  editBase: boolean;
  /** Play the character: spend pools, cast, set conditions, manage inventory. */
  play: boolean;
  /** Step HP up or down directly. */
  hp: boolean;
  /** Put spent pool points back — a rest or a GM's ruling, not a player's own click. */
  restore: boolean;
}
