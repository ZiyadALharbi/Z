import { IterationBudget } from "../budget";
import type { LLMProvider } from "../ai/provider";
import { ToolRegistry } from "../registry";
import type { AssistantMessage, ToolCallBlock, UserMessage } from "../types";
import type { ConversationState } from "./conversation-state";
import { SystemPromptBuilder } from "../prompt/builder";
import { ToolExecutor } from "../tools/executor";
import type { AgentEngineEvent } from "./events";

export type RunAgentEngineLoopOptions = {
  prompt: string;
  conversation: ConversationState;
  provider: LLMProvider;
  registry: ToolRegistry;
  promptBuilder: SystemPromptBuilder;
  budget: IterationBudget;
  toolExecutor?: ToolExecutor;
  signal?: AbortSignal;
};


export async function* runAgentEngineLoop(
  options: RunAgentEngineLoopOptions,
): AsyncIterable<AgentEngineEvent> {
  const toolExecutor = options.toolExecutor ?? new ToolExecutor(options.registry);
  

  const userMessage: UserMessage = {
    role: "user",
    content: options.prompt,
  };

  options.conversation.append(userMessage);

  yield {
    type: "run_started",
    prompt: options.prompt,
  };

  let iteration = 0;

  while (true) {
    if (options.signal?.aborted) {
      yield { type: "run_finished", stopReason: "aborted" };
      return;
    }

    if (!options.budget.consume()) {
      yield { type: "run_finished", stopReason: "budget_exhausted" };
      return;
    }

    iteration += 1;

    yield {
      type: "iteration_started",
      iteration,
      remainingIterations: options.budget.getRemaining(),
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
        yield {
          type: "text",
          text: event.text,
        };
      }

      if (event.type === "error") {
        const message: AssistantMessage = {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: event.message,
        };

        options.conversation.append(message);

        yield {
          type: "error",
          message: event.message,
        };

        yield {
          type: "assistant_message",
          message,
        };

        yield {
          type: "run_finished",
          stopReason: "error",
        };

        return;
      }

      if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      const errorMessage = "Provider stream ended without a final assistant message.";
      const message: AssistantMessage = {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage,
      };

      options.conversation.append(message);

      yield {
        type: "error",
        message: errorMessage,  // it was message.errorMessage
      };

      yield {
        type: "assistant_message",
        message,
      };

      yield {
        type: "run_finished",
        stopReason: "error",
      };

      return;
    }

    options.conversation.append(assistantMessage);

    yield {
      type: "assistant_message",
      message: assistantMessage,
    };

    const toolCalls = getToolCalls(assistantMessage);

    if (toolCalls.length === 0) {
      yield {
        type: "run_finished",
        stopReason: assistantMessage.stopReason,
      };

      return;
    }

    for (const toolCall of toolCalls) {
      if (options.signal?.aborted) {
        yield { type: "run_finished", stopReason: "aborted" };
        return;
      }

      yield {
        type: "tool_started",
        toolCall,
      };

      const result = await toolExecutor.execute(toolCall, options.signal);

      options.conversation.append(result);

      yield {
        type: "tool_finished",
        result,
      };
    }
  }
}

function getToolCalls(message: AssistantMessage): ToolCallBlock[] {
  return message.content.filter(
    (block): block is ToolCallBlock => block.type === "toolCall",
  );
}
