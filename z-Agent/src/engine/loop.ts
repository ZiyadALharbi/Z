import { IterationBudget } from "../budget";
import type { LLMProvider } from "../../../z-ai/src/provider";
import { ToolRegistry } from "../registry";
import type { AssistantMessage, ToolCallBlock, UserMessage } from "../types";
import type { ConversationState } from "./conversation-state";
import { SystemPromptBuilder } from "../harness/system_prompt";
import { ToolExecutor } from "../tools/executor";
import type { AgentEngineEvent } from "./events";

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
): AsyncIterable<AgentEngineEvent> {
  const toolExecutor =
    options.toolExecutor ?? new ToolExecutor(options.registry);

  const runId = crypto.randomUUID();
  const turn = options.conversation.startTurn(runId);
  const scope = {
    sessionId: turn.sessionId,
    runId,
    turnId: turn.id,
  };

  const userMessage: UserMessage = {
    role: "user",
    content: options.prompt,
  };

  const userEntry = options.conversation.append(userMessage, {
    runId,
    turnId: turn.id,
  });

  yield {
    type: "run_started",
    prompt: options.prompt,
    ...scope,
  };

  yield {
    type: "turn_started",
    turn,
    ...scope,
  };

  yield {
    type: "message_appended",
    entry: userEntry,
    ...scope,
  };

  let iteration = 0;
  while (true) {
    if (options.signal?.aborted) {
      const finishedTurn = options.conversation.abortTurn(turn.id);

      yield {
        type: "turn_finished",
        turn: finishedTurn,
        stopReason: "aborted",
        ...scope,
      };

      yield {
        type: "run_finished",
        stopReason: "aborted",
        ...scope,
      };

      return;
    }

    if (!options.budget.consume()) {
      const finishedTurn = options.conversation.completeTurn(turn.id);

      yield {
        type: "turn_finished",
        turn: finishedTurn,
        stopReason: "budget_exhausted",
        ...scope,
      };

      yield {
        type: "run_finished",
        stopReason: "budget_exhausted",
        ...scope,
      };

      return;
    }

    iteration += 1;

    yield {
      type: "iteration_started",
      iteration,
      remainingIterations: options.budget.getRemaining(),
      ...scope,
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
          ...scope,
        };
      }

      if (event.type === "error") {
        const message: AssistantMessage = {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: event.message,
        };

        const errorEntry = options.conversation.append(message, {
          runId,
          turnId: turn.id,
        });

        yield {
          type: "error",
          message: event.message,
          ...scope,
        };

        yield {
          type: "message_appended",
          entry: errorEntry,
          ...scope,
        };

        yield {
          type: "assistant_message",
          message,
          entryId: errorEntry.id,
          ...scope,
        };

        const finishedTurn = options.conversation.failTurn(turn.id);

        yield {
          type: "turn_finished",
          turn: finishedTurn,
          stopReason: "error",
          ...scope,
        };

        yield {
          type: "run_finished",
          stopReason: "error",
          ...scope,
        };

        return;
      }

      if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      const errorMessage =
        "Provider stream ended without a final assistant message.";
      const message: AssistantMessage = {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage,
      };

      const errorEntry = options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      yield {
        type: "error",
        message: errorMessage,
        ...scope,
      };

      yield {
        type: "message_appended",
        entry: errorEntry,
        ...scope,
      };

      yield {
        type: "assistant_message",
        message,
        entryId: errorEntry.id,
        ...scope,
      };

      const finishedTurn = options.conversation.failTurn(turn.id);

      yield {
        type: "turn_finished",
        turn: finishedTurn,
        stopReason: "error",
        ...scope,
      };

      yield {
        type: "run_finished",
        stopReason: "error",
        ...scope,
      };

      return;
    }

    const assistantEntry = options.conversation.append(assistantMessage, {
      runId,
      turnId: turn.id,
    });

    yield {
      type: "message_appended",
      entry: assistantEntry,
      ...scope,
    };

    yield {
      type: "assistant_message",
      message: assistantMessage,
      entryId: assistantEntry.id,
      ...scope,
    };

    const toolCalls = getToolCalls(assistantMessage);

    if (toolCalls.length === 0) {
      const finishedTurn = options.conversation.completeTurn(turn.id);

      yield {
        type: "turn_finished",
        turn: finishedTurn,
        stopReason: assistantMessage.stopReason,
        ...scope,
      };

      yield {
        type: "run_finished",
        stopReason: assistantMessage.stopReason,
        ...scope,
      };

      return;
    }

    for (const toolCall of toolCalls) {
      if (options.signal?.aborted) {
        const finishedTurn = options.conversation.abortTurn(turn.id);

        yield {
          type: "turn_finished",
          turn: finishedTurn,
          stopReason: "aborted",
          ...scope,
        };

        yield {
          type: "run_finished",
          stopReason: "aborted",
          ...scope,
        };

        return;
      }

      yield {
        type: "tool_started",
        toolCall,
        parentEntryId: assistantEntry.id,
        ...scope,
      };

      const result = await toolExecutor.execute(toolCall, options.signal);

      const toolResultEntry = options.conversation.append(result, {
        runId,
        turnId: turn.id,
        parentEntryId: assistantEntry.id,
      });

      yield {
        type: "message_appended",
        entry: toolResultEntry,
        ...scope,
      };

      yield {
        type: "tool_finished",
        result,
        entryId: toolResultEntry.id,
        parentEntryId: assistantEntry.id,
        ...scope,
      };
    }
  }
}

function getToolCalls(message: AssistantMessage): ToolCallBlock[] {
  return message.content.filter(
    (block): block is ToolCallBlock => block.type === "toolCall",
  );
}
