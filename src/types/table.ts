/** One row of a random table. A row with weight 3 comes up three times as
 * often as a row with weight 1. */
export interface TableRow {
  weight: number;
  text: string;
}

/** A random table of the library: a name and its weighted rows. The name is
 * the merge key, the same as for creature, spell, and feat templates. */
export interface RandomTable {
  name: string;
  rows: TableRow[];
}

/** The result of one roll on a table: the row that came up, its index, and
 * its text with every `{place}` token filled in. */
export interface TableRoll {
  index: number;
  row: TableRow;
  text: string;
}
