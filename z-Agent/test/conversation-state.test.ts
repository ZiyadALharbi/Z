import { describe, expect, test } from "bun:test";
import { ConversationState } from "../src/engine/conversation-state";
import type { AssistantMessage, Message, ToolResultMessage } from "../src/types";

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
  };
}

describe("ConversationState", () => {
  test("returns copy-safe message snapshots", () => {
    const conversation = new ConversationState();
    const runId = "run_1";
    const turnId = "turn_1";

    conversation.append({ role: "user", content: "hello" }, { runId, turnId });

    const snapshot = conversation.snapshot() as Message[];
    snapshot.push(assistantMessage("mutated"));

    expect(conversation.snapshot()).toEqual([{ role: "user", content: "hello" }]);
  });

  test("derives provider messages from history entries in sequence order", () => {
    const conversation = new ConversationState();
    const runId = "run_1";
    const turnId = "turn_1";

    conversation.append({ role: "user", content: "hello" }, { runId, turnId });
    conversation.append(assistantMessage("hi"), { runId, turnId });

    expect(conversation.getProviderMessages()).toEqual([
      { role: "user", content: "hello" },
      assistantMessage("hi"),
    ]);
  });

  test("assigns stable entry identity and sequence", () => {
    const conversation = new ConversationState({ id: "session_1" });
    const runId = "run_1";
    const turnId = "turn_1";

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
    const runId = "run_1";
    const turnId = "turn_1";

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
    const runId = "run_1";
    const turnId = "turn_1";

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
});
