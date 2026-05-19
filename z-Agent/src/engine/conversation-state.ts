/*
Conversation State

Owns the Message Array and metadata for a single AgentEngine conversation.
The AgentEngine Loop appends messages through this Module instead of mutating
a raw array directly.
*/

import type { Message } from "../types";

import type {
  ConversationEntry,
  ConversationEntryKind,
  RunId,
  SessionId,
  SessionMetadata,
  SessionSnapshot,
  TurnId,
  TurnMetadata,
  TurnStatus,
} from "../harness/types";

import {
  DefaultContextBuilder,
  type ContextBuilder,
} from "../harness/context-builder";

export interface ConversationStateOptions {
  id?: SessionId;
  initialEntries?: ConversationEntry[];
  contextBuilder?: ContextBuilder;
  createdAt?: Date;
}

export interface AppendConversationMessageOptions {
  runId: RunId;
  turnId: TurnId;
  parentEntryId?: string;
}

export class ConversationState {
  private readonly entries: ConversationEntry[];
  private readonly turns: TurnMetadata[];
  private readonly metadata: SessionMetadata;
  private nextSequence: number;

  private readonly contextBuilder: ContextBuilder;

  constructor(options: ConversationStateOptions = {}) {
    const initialEntries = [...(options.initialEntries ?? [])];
    const sessionId =
      options.id ?? initialEntries[0]?.sessionId ?? crypto.randomUUID();
    const createdAt =
      options.createdAt ?? initialEntries[0]?.createdAt ?? new Date();

    for (const entry of initialEntries) {
      if (entry.sessionId !== sessionId) {
        throw new Error(
          "Initial conversation entries must belong to the same session.",
        );
      }
    }

    this.entries = initialEntries
      .sort((first, second) => first.sequence - second.sequence)
      .map((entry) => ({ ...entry }));

    this.turns = [];

    this.nextSequence =
      this.entries.length === 0
        ? 1
        : Math.max(...this.entries.map((entry) => entry.sequence)) + 1;

    this.metadata = {
      id: sessionId,
      status: "active",
      createdAt,
      updatedAt: this.entries.at(-1)?.createdAt ?? createdAt,
    };

    this.contextBuilder = options.contextBuilder ?? new DefaultContextBuilder();
  }

  startTurn(runId: RunId): TurnMetadata {
    const now = new Date();

    const turn: TurnMetadata = {
      id: crypto.randomUUID(),
      sessionId: this.metadata.id,
      runId,
      status: "active",
      startedAt: now,
    };

    this.turns.push(turn);
    this.metadata.updatedAt = now;

    return { ...turn };
  }

  append(
    message: Message,
    options: AppendConversationMessageOptions,
  ): ConversationEntry {
    const turn = this.turns.find(
      (candidate) => candidate.id === options.turnId,
    );

    if (!turn) {
      throw new Error(`Turn does not exist: ${options.turnId}`);
    }

    if (turn.status !== "active") {
      throw new Error(`Cannot append to finished turn: ${options.turnId}`);
    }

    if (turn.runId !== options.runId) {
      throw new Error("Conversation entry runId must match its turn runId.");
    }

    const entry: ConversationEntry = {
      id: crypto.randomUUID(),
      sessionId: this.metadata.id,
      runId: options.runId,
      turnId: options.turnId,
      sequence: this.nextSequence,
      kind: getConversationEntryKind(message),
      message,
      parentEntryId: options.parentEntryId,
      createdAt: new Date(),
    };

    this.entries.push(entry);
    this.nextSequence += 1;
    this.metadata.updatedAt = entry.createdAt;

    return entry;
  }

  completeTurn(turnId: TurnId): TurnMetadata {
    return this.finishTurn(turnId, "completed");
  }

  failTurn(turnId: TurnId): TurnMetadata {
    return this.finishTurn(turnId, "failed");
  }

  abortTurn(turnId: TurnId): TurnMetadata {
    return this.finishTurn(turnId, "aborted");
  }

  snapshot(): readonly Message[] {
    return this.entries.map((entry) => entry.message);
  }

  getProviderMessages(): Message[] {
    return this.contextBuilder.buildProviderMessages(this.entries);
  }

  getEntries(): readonly ConversationEntry[] {
    return this.entries.map((entry) => ({ ...entry })); //create a new object by copying all enumerable properties from entry
  }

  getSessionSnapshot(): SessionSnapshot {
    return {
      metadata: { ...this.metadata },
      turns: this.turns.map((turn) => ({ ...turn })),
      entries: this.getEntries(),
    };
  }

  private finishTurn(
    turnId: TurnId,
    status: Exclude<TurnStatus, "active">,
  ): TurnMetadata {
    const turn = this.turns.find((candidate) => candidate.id === turnId);

    if (!turn) {
      throw new Error(`Turn does not exist: ${turnId}`);
    }

    if (turn.status !== "active") {
      throw new Error(`Turn is already finished: ${turnId}`);
    }

    const finishedAt = new Date();

    turn.status = status;
    turn.finishedAt = finishedAt;
    this.metadata.updatedAt = finishedAt;

    return { ...turn };
  }

  getMetadata(): Readonly<SessionMetadata> {
    return { ...this.metadata };
  }
}

function getConversationEntryKind(message: Message): ConversationEntryKind {
  if (message.role === "user") {
    return "user_message";
  }

  if (message.role === "assistant") {
    return "assistant_message";
  }

  return "tool_result";
}
