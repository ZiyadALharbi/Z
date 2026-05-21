import { describe, expect, test } from "vitest";
import { ConversationState } from "../src/harness/conversation-state";
import type { AssistantMessage, Message, ToolResultMessage } from "../src/types";

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
  };
}

function startTurn(conversation: ConversationState): {
  runId: string;
  turnId: string;
} {
  const runId = "run_1";
  const turn = conversation.startTurn(runId);

  return { runId, turnId: turn.id };
}

describe("ConversationState", () => {
  test("returns copy-safe message snapshots", () => {
    const conversation = new ConversationState();
    const { runId, turnId } = startTurn(conversation);

    conversation.append({ role: "user", content: "hello" }, { runId, turnId });

    const snapshot = conversation.snapshot() as Message[];
    snapshot.push(assistantMessage("mutated"));

    expect(conversation.snapshot()).toEqual([{ role: "user", content: "hello" }]);
  });

  test("derives provider messages from history entries in sequence order", () => {
    const conversation = new ConversationState();
    const { runId, turnId } = startTurn(conversation);

    conversation.append({ role: "user", content: "hello" }, { runId, turnId });
    conversation.append(assistantMessage("hi"), { runId, turnId });

    expect(conversation.getProviderMessages()).toEqual([
      { role: "user", content: "hello" },
      assistantMessage("hi"),
    ]);
  });

  test("assigns stable entry identity and sequence", () => {
    const conversation = new ConversationState({ id: "session_1" });
    const { runId, turnId } = startTurn(conversation);

    const firstEntry = conversation.append(
      { role: "user", content: "hello" },
      { runId, turnId },
    );
    const secondEntry = conversation.append(assistantMessage("hi"), {
      runId,
      turnId,
    });

    expect(firstEntry.id).not.toBe(secondEntry.id);
    expect(firstEntry.sessionId).toBe("session_1");
    expect(secondEntry.sessionId).toBe("session_1");
    expect(firstEntry.runId).toBe(runId);
    expect(firstEntry.turnId).toBe(turnId);
    expect(firstEntry.sequence).toBe(1);
    expect(secondEntry.sequence).toBe(2);
  });

  test("returns copy-safe history entries", () => {
    const conversation = new ConversationState();
    const { runId, turnId } = startTurn(conversation);

    conversation.append({ role: "user", content: "hello" }, { runId, turnId });

    const entries = conversation.getEntries();
    const firstEntry = entries[0];

    if (!firstEntry) {
      throw new Error("Expected first entry");
    }

    firstEntry.message = assistantMessage("mutated");

    expect(conversation.snapshot()).toEqual([{ role: "user", content: "hello" }]);
  });

  test("records tool result parent entry", () => {
    const conversation = new ConversationState();
    const { runId, turnId } = startTurn(conversation);

    conversation.append({ role: "user", content: "use tool" }, { runId, turnId });

    const assistantEntry = conversation.append(
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_1",
            name: "echo",
            arguments: { value: "hello" },
          },
        ],
        stopReason: "tool_calls",
      },
      { runId, turnId },
    );

    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "echo",
      content: "hello",
      isError: false,
    };

    const toolEntry = conversation.append(toolResult, {
      runId,
      turnId,
      parentEntryId: assistantEntry.id,
    });

    expect(toolEntry.kind).toBe("tool_result");
    expect(toolEntry.parentEntryId).toBe(assistantEntry.id);
  });

  test("returns copy-safe session metadata", () => {
    const conversation = new ConversationState({ id: "session_1" });

    const metadata = conversation.getMetadata();
    metadata.status = "closed";

    expect(conversation.getMetadata()).toMatchObject({
      id: "session_1",
      status: "active",
    });
  });

  test("records turn lifecycle in the session snapshot", () => {
    const conversation = new ConversationState({ id: "session_1" });
    const runId = "run_1";
    const turn = conversation.startTurn(runId);

    conversation.append({ role: "user", content: "hello" }, {
      runId,
      turnId: turn.id,
    });

    const finishedTurn = conversation.completeTurn(turn.id);
    const snapshot = conversation.getSessionSnapshot();

    expect(finishedTurn.status).toBe("completed");
    expect(finishedTurn.finishedAt).toBeInstanceOf(Date);
    expect(snapshot.turns).toEqual([finishedTurn]);
    expect(snapshot.entries[0]?.turnId).toBe(turn.id);
  });

  test("rejects appending to a missing turn", () => {
    const conversation = new ConversationState();

    expect(() =>
      conversation.append(
        { role: "user", content: "hello" },
        { runId: "run_1", turnId: "missing_turn" },
      ),
    ).toThrow("Turn does not exist: missing_turn");
  });

  test("rejects appending to a finished turn", () => {
    const conversation = new ConversationState();
    const runId = "run_1";
    const turn = conversation.startTurn(runId);

    conversation.completeTurn(turn.id);

    expect(() =>
      conversation.append(
        { role: "user", content: "hello" },
        { runId, turnId: turn.id },
      ),
    ).toThrow(`Cannot append to finished turn: ${turn.id}`);
  });

  test("rejects entries whose runId does not match the turn", () => {
    const conversation = new ConversationState();
    const turn = conversation.startTurn("run_1");

    expect(() =>
      conversation.append(
        { role: "user", content: "hello" },
        { runId: "run_2", turnId: turn.id },
      ),
    ).toThrow("Conversation entry runId must match its turn runId.");
  });
});
