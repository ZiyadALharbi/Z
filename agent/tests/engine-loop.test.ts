import { describe, expect, test } from "bun:test";
import { IterationBudget } from "../src/budget";
import type { StreamEvent } from "../src/ai/events";
import type { LLMContext, LLMProvider } from "../src/ai/provider";
import { ConversationState } from "../src/engine/conversation-state";
import { runAgentLoop } from "../src/engine/loop";
import { SystemPromptBuilder } from "../src/prompt/builder";
import { ToolRegistry } from "../src/registry";
import { ToolExecutor } from "../src/tools/executor";
import type { AgentEngineEvent } from "../src/engine/events";
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

class NeverCalledProvider implements LLMProvider {
  async *stream(): AsyncIterable<StreamEvent> {
    throw new Error("Provider should not be called");
  }
}

async function collect(
  iterable: AsyncIterable<AgentEngineEvent>,
): Promise<AgentEngineEvent[]> {
  const events: AgentEngineEvent[] = [];

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
  provider?: LLMProvider;
  registry?: ToolRegistry;
  conversation?: ConversationState;
  budget?: IterationBudget;
  toolExecutor?: ToolExecutor;
  signal?: AbortSignal;
} = {}) {
  return {
    prompt: "hello",
    conversation: overrides.conversation ?? new ConversationState(),
    provider:
      overrides.provider ??
      new ScriptedProvider([
        [
          {
            type: "done",
            message: assistantMessage([{ type: "text", text: "hi" }]),
          },
        ],
      ]),
    registry: overrides.registry ?? new ToolRegistry(),
    promptBuilder: new SystemPromptBuilder({ identity: "Test", rules: [] }),
    budget: overrides.budget ?? new IterationBudget(3),
    toolExecutor: overrides.toolExecutor,
    signal: overrides.signal,
  };
}

describe("runAgentEngineLoop", () => {
  test("streams text and finishes when the assistant has no tool calls", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "text_delta", text: "hel" },
        { type: "text_delta", text: "lo" },
        {
          type: "done",
          message: assistantMessage([{ type: "text", text: "hello" }]),
        },
      ],
    ]);
    const conversation = new ConversationState();

    const events = await collect(
      runAgentLoop(createLoopOptions({ provider, conversation })),
    );

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "iteration_started",
      "text",
      "text",
      "assistant_message",
      "run_finished",
    ]);
    expect(events.at(-1)).toEqual({ type: "run_finished", stopReason: "stop" });
    expect(conversation.snapshot()).toEqual([
      { role: "user", content: "hello" },
      assistantMessage([{ type: "text", text: "hello" }]),
    ]);
    expect(provider.contexts[0]?.messages).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  test("executes tool calls, appends results, and continues the loop", async () => {
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

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "iteration_started",
      "assistant_message",
      "tool_started",
      "tool_finished",
      "iteration_started",
      "assistant_message",
      "run_finished",
    ]);
    expect(provider.contexts).toHaveLength(2);
    expect(provider.contexts[1]?.messages).toEqual([
      { role: "user", content: "hello" },
      assistantMessage(
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
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "echo",
        content: "from tool",
        isError: false,
      },
    ]);
    expect(events.at(-1)).toEqual({ type: "run_finished", stopReason: "stop" });
  });

  test("finishes with provider errors", async () => {
    const provider = new ScriptedProvider([
      [{ type: "error", message: "provider failed" }],
    ]);

    const events = await collect(
      runAgentLoop(createLoopOptions({ provider })),
    );

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "iteration_started",
      "error",
      "assistant_message",
      "run_finished",
    ]);
    expect(events.at(-1)).toEqual({
      type: "run_finished",
      stopReason: "error",
    });
  });

  test("turns a stream without a final assistant message into an error", async () => {
    const provider = new ScriptedProvider([[{ type: "text_delta", text: "hi" }]]);

    const events = await collect(
      runAgentLoop(createLoopOptions({ provider })),
    );

    expect(events.at(-2)).toEqual({
      type: "assistant_message",
      message: {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: "Provider stream ended without a final assistant message.",
      },
    });
    expect(events.at(-1)).toEqual({
      type: "run_finished",
      stopReason: "error",
    });
  });

  test("stops when the iteration budget is exhausted", async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: "done",
          message: assistantMessage(
            [
              {
                type: "toolCall",
                id: "call_1",
                name: "missing",
                arguments: {},
              },
            ],
            "tool_calls",
          ),
        },
      ],
    ]);

    const events = await collect(
      runAgentLoop(
        createLoopOptions({
          provider,
          budget: new IterationBudget(1),
        }),
      ),
    );

    expect(events.at(-1)).toEqual({
      type: "run_finished",
      stopReason: "budget_exhausted",
    });
  });

  test("stops before consuming budget when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await collect(
      runAgentLoop(
        createLoopOptions({
          provider: new NeverCalledProvider(),
          signal: controller.signal,
        }),
      ),
    );

    expect(events).toEqual([
      { type: "run_started", prompt: "hello" },
      { type: "run_finished", stopReason: "aborted" },
    ]);
  });
});
