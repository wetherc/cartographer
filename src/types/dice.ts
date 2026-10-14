export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export type DiceCounts = Partial<Record<DieType, number>>;

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface DiceSelection {
  counts: DiceCounts;
  modifier: number;
  mode?: RollMode;
}

export interface DieTypeResult {
  die: DieType;
  rolls: number[];
  subtotal: number;
  /** d20s discarded by advantage or disadvantage, one per kept roll. */
  dropped?: number[];
}

export interface DiceResult {
  selection: DiceSelection;
  results: DieTypeResult[];
  modifier: number;
  total: number;
}

export type RandomFn = () => number;

/** Options for a roll that a caller loads into the dice tray. */
export interface TrayRollOptions {
  /** Roll without expanding the tray, against the target the GM typed. */
  keep?: boolean;
  /** Judge the roll as an attack: "hit" or "miss", where a kept d20 at or
   *  above `critOn` (20 by default) always hits and a natural 1 misses. */
  attack?: { critOn?: number } | null;
}

/** A roll made in the dice tray. `target` is the number the roll was judged
 * against, or null when it had none. */
export interface TrayRoll {
  result: DiceResult;
  text: string;
  target: number | null;
}
