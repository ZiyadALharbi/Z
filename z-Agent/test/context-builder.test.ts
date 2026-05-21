import { describe, expect, test } from "vitest";
import { ConversationState } from "../src/harness/conversation-state";
import {
  DefaultContextBuilder,
  type ContextBuilder,
} from "../src/harness/context-builder";
import type { ConversationEntry } from "../src/harness/types";
import type { Message } from "../src/types";

function createEntry(
  sequence: number,
  message: Message,
  overrides: Partial<ConversationEntry> = {},
): ConversationEntry {
  return {
    id: `entry_${sequence}`,
    sessionId: "session_1",
    runId: "run_1",
    turnId: "turn_1",
    sequence,
    kind:
      message.role === "user"
        ? "user_message"
        : message.role === "assistant"
          ? "assistant_message"
          : "tool_result",
    message,
    createdAt: new Date(`2026-05-19T00:0${sequence}:00.000Z`),
    ...overrides,
  };
}

describe("DefaultContextBuilder", () => {
  test("returns provider messages in sequence order", () => {
    const userMessage: Message = { role: "user", content: "hello" };
    const assistantMessage: Message = {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      stopReason: "stop",
    };
    const builder = new DefaultContextBuilder();

    expect(
      builder.buildProviderMessages([
        createEntry(2, assistantMessage),
        createEntry(1, userMessage),
      ]),
    ).toEqual([userMessage, assistantMessage]);
  });
});

describe("ConversationState provider context", () => {
  test("uses the injected context builder", () => {
    const userMessage: Message = { role: "user", content: "hello" };
    const assistantMessage: Message = {
      role: "assistant",
      content: [{ type: "text", text: "hidden" }],
      stopReason: "stop",
    };
    const contextBuilder: ContextBuilder = {
      buildProviderMessages(entries) {
        return entries
          .filter((entry) => entry.message.role === "user")
          .map((entry) => entry.message);
      },
    };
    const conversation = new ConversationState({
      initialEntries: [
        createEntry(1, userMessage),
        createEntry(2, assistantMessage),
      ],
      contextBuilder,
    });

    expect(conversation.getProviderMessages()).toEqual([userMessage]);
  });
});
