export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export type DiceCounts = Partial<Record<DieType, number>>;

export interface DiceSelection {
  counts: DiceCounts;
  modifier: number;
}

export interface DieTypeResult {
  die: DieType;
  rolls: number[];
  subtotal: number;
}

export interface DiceResult {
  selection: DiceSelection;
  results: DieTypeResult[];
  modifier: number;
  total: number;
}

export type RandomFn = () => number;
