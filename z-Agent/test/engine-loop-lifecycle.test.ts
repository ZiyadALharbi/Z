import { describe, expect, test } from "vitest";
import { IterationBudget } from "../src/budget";
import { ConversationState } from "../src/harness/conversation-state";
import type { AgentEvent } from "../src/types";
import { runAgentLoop } from "../src/loop";
import { SystemPromptBuilder } from "../src/harness/system_prompt";
import { ToolRegistry } from "../src/harness/tools/registry";
import type { StreamEvent } from "../../z-ai/src/events";
import type { LLMContext, LLMProvider } from "../../z-ai/src/provider";
import type { AssistantMessage, Tool } from "../src/types";

class ScriptedProvider implements LLMProvider {
  readonly contexts: LLMContext[] = [];
  private index = 0;

  constructor(private readonly scripts: StreamEvent[][]) {}

  async *stream(context: LLMContext): AsyncIterable<StreamEvent> {
    this.contexts.push(context);
    const script = this.scripts[this.index] ?? [];
    this.index += 1;

    for (const event of script) {
      yield event;
    }
  }
}

async function collect(
  iterable: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of iterable) {
    events.push(event);
  }

  return events;
}

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content,
    stopReason,
  };
}

function createEchoTool(): Tool {
  return {
    definition: {
      name: "echo",
      description: "Echo a value",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
    },
    handler: async (args) => String(args.value),
  };
}

function createLoopOptions(overrides: {
  provider: LLMProvider;
  registry?: ToolRegistry;
  conversation?: ConversationState;
  budget?: IterationBudget;
}) {
  return {
    prompt: "hello",
    conversation: overrides.conversation ?? new ConversationState(),
    provider: overrides.provider,
    registry: overrides.registry ?? new ToolRegistry(),
    promptBuilder: new SystemPromptBuilder({ identity: "Test", rules: [] }),
    budget: overrides.budget ?? new IterationBudget(3),
  };
}

function findEvent<TType extends AgentEvent["type"]>(
  events: readonly AgentEvent[],
  type: TType,
): Extract<AgentEvent, { type: TType }> {
  const event = events.find(
    (candidate): candidate is Extract<AgentEvent, { type: TType }> =>
      candidate.type === type,
  );

  if (!event) {
    throw new Error(`Expected event: ${type}`);
  }

  return event;
}

describe("runAgentLoop lifecycle events", () => {
  test("emits scoped run, turn, append, and finish events", async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: "done",
          message: assistantMessage([{ type: "text", text: "hi" }]),
        },
      ],
    ]);
    const conversation = new ConversationState({ id: "session_1" });

    const events = await collect(
      runAgentLoop(createLoopOptions({ provider, conversation })),
    );

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "turn_started",
      "message_appended",
      "iteration_started",
      "message_appended",
      "assistant_message",
      "turn_finished",
      "run_finished",
    ]);

    const runStarted = findEvent(events, "run_started");
    const turnStarted = findEvent(events, "turn_started");
    const turnFinished = findEvent(events, "turn_finished");
    const runFinished = findEvent(events, "run_finished");
    const appendedMessages = events.filter(
      (event): event is Extract<AgentEvent, { type: "message_appended" }> =>
        event.type === "message_appended",
    );

    expect(runStarted.sessionId).toBe("session_1");
    expect(turnStarted.runId).toBe(runStarted.runId);
    expect(turnStarted.turnId).toBe(runStarted.turnId);
    expect(turnFinished.turn.id).toBe(turnStarted.turn.id);
    expect(turnFinished.turn.status).toBe("completed");
    expect(runFinished.stopReason).toBe("stop");
    expect(appendedMessages.map((event) => event.entry.sequence)).toEqual([1, 2]);
    expect(
      appendedMessages.every(
        (event) =>
          event.sessionId === runStarted.sessionId &&
          event.runId === runStarted.runId &&
          event.turnId === runStarted.turnId,
      ),
    ).toBe(true);
  });

  test("links tool lifecycle events to stored assistant and tool result entries", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const provider = new ScriptedProvider([
      [
        {
          type: "done",
          message: assistantMessage(
            [
              {
                type: "toolCall",
                id: "call_1",
                name: "echo",
                arguments: { value: "from tool" },
              },
            ],
            "tool_calls",
          ),
        },
      ],
      [
        {
          type: "done",
          message: assistantMessage([{ type: "text", text: "done" }]),
        },
      ],
    ]);
    const conversation = new ConversationState();

    const events = await collect(
      runAgentLoop(
        createLoopOptions({
          provider,
          registry,
          conversation,
          budget: new IterationBudget(4),
        }),
      ),
    );

    const toolStarted = findEvent(events, "tool_started");
    const toolFinished = findEvent(events, "tool_finished");
    const entries = conversation.getEntries();
    const assistantEntry = entries.find(
      (entry) => entry.id === toolStarted.parentEntryId,
    );
    const toolResultEntry = entries.find(
      (entry) => entry.id === toolFinished.entryId,
    );

    expect(assistantEntry?.kind).toBe("assistant_message");
    expect(toolResultEntry?.kind).toBe("tool_result");
    expect(toolResultEntry?.parentEntryId).toBe(assistantEntry?.id);
    expect(toolFinished.parentEntryId).toBe(toolStarted.parentEntryId);
    expect(toolFinished.result.content).toBe("from tool");
  });

  test("marks the turn failed when the provider emits an error", async () => {
    const provider = new ScriptedProvider([
      [{ type: "error", message: "provider failed" }],
    ]);
    const conversation = new ConversationState();

    const events = await collect(
      runAgentLoop(createLoopOptions({ provider, conversation })),
    );

    const turnFinished = findEvent(events, "turn_finished");
    const runFinished = findEvent(events, "run_finished");
    const snapshot = conversation.getSessionSnapshot();

    expect(turnFinished.stopReason).toBe("error");
    expect(turnFinished.turn.status).toBe("failed");
    expect(runFinished.stopReason).toBe("error");
    expect(snapshot.turns[0]?.status).toBe("failed");
  });
});
