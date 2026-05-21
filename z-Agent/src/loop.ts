import { IterationBudget } from "./budget";
import type { LLMProvider } from "../../z-ai/src/provider";
import { ToolRegistry } from "./harness/tools/registry";
import type {
  AssistantMessage,
  ToolCallBlock,
  ToolResultMessage,
  UserMessage,
  AgentEvent,
} from "./types";
import type { ConversationState } from "./harness/conversation-state";
import { SystemPromptBuilder } from "./harness/system_prompt";
import { ToolExecutor } from "./harness/tools/executor";

export type RunAgentLoopOptions = {
  prompt: string;
  conversation: ConversationState;
  provider: LLMProvider;
  registry: ToolRegistry;
  promptBuilder: SystemPromptBuilder;
  budget: IterationBudget;
  toolExecutor?: ToolExecutor;
  signal?: AbortSignal;
};

export async function* runAgentLoop(
  options: RunAgentLoopOptions,
): AsyncIterable<AgentEvent> {
  const toolExecutor =
    options.toolExecutor ?? new ToolExecutor(options.registry);

  const runId = crypto.randomUUID();
  let shouldAppendPrompt = true;

  yield {
    type: "agent_start",
    prompt: options.prompt,
  };

  while (true) {
    const turn = options.conversation.startTurn(runId); // UPDATED: one persisted turn per assistant cycle.

    if (shouldAppendPrompt) {
      const userMessage: UserMessage = {
        role: "user",
        content: options.prompt,
        timestamp: Date.now(),
      };

      options.conversation.append(userMessage, {
        runId,
        turnId: turn.id,
      });

      yield {
        type: "message_start",
        message: userMessage,
      };

      yield {
        type: "message_end",
        message: userMessage,
      };

      shouldAppendPrompt = false;
    }

    if (options.signal?.aborted) {
      const message = createErrorAssistantMessage("Agent execution aborted.");

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.abortTurn(turn.id);

      yield { type: "message_start", message };
      yield { type: "message_end", message };

      yield {
        type: "turn_end",
        message,
        toolResults: [],
      };

      yield {
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      };

      return;
    }

    if (!options.budget.consume()) {
      const message = createErrorAssistantMessage(
        "Agent iteration budget exhausted.",
      );

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.completeTurn(turn.id);

      yield { type: "message_start", message };
      yield { type: "message_end", message };

      yield {
        type: "turn_end",
        message,
        toolResults: [],
      };

      yield {
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      };

      return;
    }

    yield {
      type: "turn_start", // UPDATED: now matches the active ConversationState turn.
    };

    const systemPrompt = options.promptBuilder.build(
      options.registry.getDefinitions(),
    );

    let assistantMessage: AssistantMessage | undefined;

    for await (const event of options.provider.stream(
      {
        systemPrompt,
        messages: options.conversation.getProviderMessages(),
        tools: options.registry.getDefinitions(),
      },
      options.signal,
    )) {
      if (event.type === "text_delta") {
        const partialMessage: AssistantMessage = {
          role: "assistant",
          content: [{ type: "text", text: event.text }],
          stopReason: "stop",
          timestamp: Date.now(),
        };

        yield {
          type: "message_update",
          message: partialMessage,
          streamEvent: event,
        };
      }

      if (event.type === "error") {
        const message = createErrorAssistantMessage(event.message);

        options.conversation.append(message, {
          runId,
          turnId: turn.id,
        });

        options.conversation.failTurn(turn.id);

        yield { type: "message_start", message };
        yield { type: "message_end", message };

        yield {
          type: "turn_end",
          message,
          toolResults: [],
        };

        yield {
          type: "agent_end",
          messages: [...options.conversation.snapshot()],
        };

        return;
      }

      if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      const message = createErrorAssistantMessage(
        "Provider stream ended without a final assistant message.",
      );

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.failTurn(turn.id);

      yield { type: "message_start", message };
      yield { type: "message_end", message };

      yield {
        type: "turn_end",
        message,
        toolResults: [],
      };

      yield {
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      };

      return;
    }

    options.conversation.append(assistantMessage, {
      runId,
      turnId: turn.id,
    });

    yield {
      type: "message_start",
      message: assistantMessage,
    };

    yield {
      type: "message_end",
      message: assistantMessage,
    };

    const toolCalls = getToolCalls(assistantMessage);
    const toolResults: ToolResultMessage[] = [];

    for (const toolCall of toolCalls) {
      yield {
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      };

      const result = await toolExecutor.execute(toolCall, options.signal);

      options.conversation.append(result, {
        runId,
        turnId: turn.id,
      });

      toolResults.push(result);

      yield {
        type: "tool_execution_end",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result,
        isError: result.isError,
      };

      yield {
        type: "message_start",
        message: result,
      };

      yield {
        type: "message_end",
        message: result,
      };
    }

    options.conversation.completeTurn(turn.id);

    yield {
      type: "turn_end", // UPDATED: persisted turn closes at the same boundary as lifecycle turn.
      message: assistantMessage,
      toolResults,
    };

    if (toolCalls.length === 0) {
      yield {
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      };

      return;
    }
  }
}

function createErrorAssistantMessage(errorMessage: string): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    stopReason: "error",
    errorMessage,
    timestamp: Date.now(),
  };
}

function getToolCalls(message: AssistantMessage): ToolCallBlock[] {
  return message.content.filter(
    (block): block is ToolCallBlock => block.type === "toolCall",
  );
}
