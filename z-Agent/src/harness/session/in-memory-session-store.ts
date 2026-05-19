import type {
  ConversationEntry,
  SessionId,
  SessionMetadata,
  SessionSnapshot,
  TurnMetadata,
} from "../types";
import type { SessionStore } from "./session-store";

export class InMemorySessionStore implements SessionStore {
  private readonly snapshots = new Map<SessionId, SessionSnapshot>();

  async load(sessionId: SessionId): Promise<SessionSnapshot | undefined> {
    const snapshot = this.snapshots.get(sessionId);

    if (!snapshot) {
      return undefined;
    }

    return cloneSessionSnapshot(snapshot);
  }

  async save(snapshot: SessionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.metadata.id, cloneSessionSnapshot(snapshot));
  }

  async appendEntry(entry: ConversationEntry): Promise<void> {
    const snapshot = this.requireSnapshot(entry.sessionId);

    this.snapshots.set(entry.sessionId, {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        updatedAt: entry.createdAt,
      },
      entries: [...snapshot.entries, { ...entry }],
    });
  }

  async upsertTurn(turn: TurnMetadata): Promise<void> {
    const snapshot = this.requireSnapshot(turn.sessionId);
    const turns = snapshot.turns.filter((candidate) => candidate.id !== turn.id);

    this.snapshots.set(turn.sessionId, {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        updatedAt: turn.finishedAt ?? turn.startedAt,
      },
      turns: [...turns, { ...turn }],
    });
  }

  async updateMetadata(metadata: SessionMetadata): Promise<void> {
    const snapshot = this.requireSnapshot(metadata.id);

    this.snapshots.set(metadata.id, {
      ...snapshot,
      metadata: { ...metadata },
    });
  }

  private requireSnapshot(sessionId: SessionId): SessionSnapshot {
    const snapshot = this.snapshots.get(sessionId);

    if (!snapshot) {
      throw new Error(`Session does not exist: ${sessionId}`);
    }

    return snapshot;
  }
}

function cloneSessionSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    metadata: { ...snapshot.metadata },
    turns: snapshot.turns.map((turn) => ({ ...turn })),
    entries: snapshot.entries.map((entry) => ({ ...entry })),
  };
}