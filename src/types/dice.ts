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
  /** d20s discarded by advantage/disadvantage, one per kept roll. */
  dropped?: number[];
}

export interface DiceResult {
  selection: DiceSelection;
  results: DieTypeResult[];
  modifier: number;
  total: number;
}

export type RandomFn = () => number;
