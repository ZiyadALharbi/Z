import type { Message } from "../types";

export type SessionId = string;
export type RunId = string;
export type TurnId = string;
export type ConversationEntryId = string;

export type SessionStatus = "active" | "closed";

export type TurnStatus = "active" | "completed" | "failed" | "aborted";

export type ConversationEntryKind =
  | "user_message"
  | "assistant_message"
  | "tool_result";

export interface SessionMetadata {
  id: SessionId;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TurnMetadata {
  id: TurnId;
  sessionId: SessionId;
  runId: RunId;
  status: TurnStatus;
  startedAt: Date;
  finishedAt?: Date;
}

export interface ConversationEntry {
  id: ConversationEntryId;
  sessionId: SessionId;
  runId: RunId;
  turnId: TurnId;

  // sequence is the replay order. Do not sort history by createdAt.
  sequence: number;

  kind: ConversationEntryKind;
  message: Message;

  // Causal parent, not display order. Tool results usually point to the
  // assistant entry that requested the tool call.
  parentEntryId?: ConversationEntryId;
  createdAt: Date;
}

export interface SessionSnapshot {
  metadata: SessionMetadata;
  turns: readonly TurnMetadata[];
  entries: readonly ConversationEntry[];
}

