/**
 * Notes:
 * - save is for bootstrap/full snapshot writes.
 * - appendEntry, upsertTurn, updateMetadata are the incremental write path.
 * - This is intentionally small.
 */

import type {
  ConversationEntry,
  SessionId,
  SessionMetadata,
  SessionSnapshot,
  TurnMetadata,
} from "../types";

export interface SessionStore {
  load(sessionId: SessionId): Promise<SessionSnapshot | undefined>;
  save(snapshot: SessionSnapshot): Promise<void>;
  appendEntry(entry: ConversationEntry): Promise<void>;
  upsertTurn(turn: TurnMetadata): Promise<void>;
  updateMetadata(metadata: SessionMetadata): Promise<void>;
}
