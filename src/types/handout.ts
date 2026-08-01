/** A lore snippet or read-aloud box that a GM attaches to a node and reveals to players. */
export interface Handout {
  id: string;
  title: string;
  /** Read-aloud or lore text shown when revealed. */
  body: string;
  /** Node the handout belongs to. Null means campaign-wide, and shows everywhere. */
  nodeId: string | null;
  /** True when players can currently see the handout. Authored hidden, revealed on demand. */
  revealed: boolean;
  /** Optional attached image as a data URL, shown with the revealed body. */
  image: string | null;
}
