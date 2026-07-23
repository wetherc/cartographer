/** A lore snippet / read-aloud box a GM attaches to a node and reveals to players. */
export interface Handout {
  id: string;
  title: string;
  /** Read-aloud / lore text shown when revealed. */
  body: string;
  /** Node the handout belongs to; null = campaign-wide (shown everywhere). */
  nodeId: string | null;
  /** Whether players can currently see it. Authored hidden, revealed on demand. */
  revealed: boolean;
}
