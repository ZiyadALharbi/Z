import { IterationBudget } from "./budget";
import type { AgentEvent } from "./types";
import { ToolRegistry } from "./harness/tools/registry";
import type {
  LLMProvider,
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "../../z-ai/src/types";
import type { ConversationState } from "./harness/conversation-state";
import { SystemPromptBuilder } from "./harness/system_prompt";
import { ToolExecutor } from "./harness/tools/executor";

export type AgentEventEmitter = (event: AgentEvent) => void | Promise<void>;

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

export function runAgentLoop(
  options: RunAgentLoopOptions,
): AsyncIterable<AgentEvent> {
  return createAgentEventIterable((emit) =>
    runAgentLoopWithEmit(options, emit),
  );
}

/**
 * Run the agent loop and emit lifecycle events through an awaited emitter.
 *
 * The loop owns control flow. Event consumers own side effects such as
 * persistence, tracing, UI updates, and later checkpointing.
 */
async function runAgentLoopWithEmit(
  options: RunAgentLoopOptions,
  emit: AgentEventEmitter,
): Promise<void> {
  const toolExecutor =
    options.toolExecutor ?? new ToolExecutor(options.registry);

  const runId = crypto.randomUUID();
  let shouldAppendPrompt = true;

  await emit({ type: "agent_start" });

  while (true) {
    const turn = options.conversation.startTurn(runId);

    if (shouldAppendPrompt) {
      const userMessage: UserMessage = {
        role: "user",
        content: [{ type: "text", text: options.prompt }],
        timestamp: Date.now(),
      };

      options.conversation.append(userMessage, {
        runId,
        turnId: turn.id,
      });

      await emit({ type: "message_start", message: userMessage });
      await emit({ type: "message_end", message: userMessage });

      shouldAppendPrompt = false;
    }

    if (options.signal?.aborted) {
      const message = createErrorAssistantMessage(
        "Agent execution aborted.",
        "aborted",
      );

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.abortTurn(turn.id);

      await emit({ type: "message_start", message });
      await emit({ type: "message_end", message });
      await emit({ type: "turn_end", message, toolResults: [] });
      await emit({
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      });

      return;
    }

    if (!options.budget.consume()) {
      const message = createErrorAssistantMessage(
        "Agent iteration budget exhausted.",
        "error",
      );

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.completeTurn(turn.id);

      await emit({ type: "message_start", message });
      await emit({ type: "message_end", message });
      await emit({ type: "turn_end", message, toolResults: [] });
      await emit({
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      });

      return;
    }

    await emit({ type: "turn_start" });

    const assistantMessage = await streamAssistantMessage(options, emit);

    if (!assistantMessage) {
      const message = createErrorAssistantMessage(
        "Provider stream ended without a final assistant message.",
        "error",
      );

      options.conversation.append(message, {
        runId,
        turnId: turn.id,
      });

      options.conversation.failTurn(turn.id);

      await emit({ type: "message_start", message });
      await emit({ type: "message_end", message });
      await emit({ type: "turn_end", message, toolResults: [] });
      await emit({
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      });

      return;
    }

    if (
      assistantMessage.stopReason === "error" ||
      assistantMessage.stopReason === "aborted"
    ) {
      options.conversation.append(assistantMessage, {
        runId,
        turnId: turn.id,
      });

      if (assistantMessage.stopReason === "aborted") {
        options.conversation.abortTurn(turn.id);
      } else {
        options.conversation.failTurn(turn.id);
      }

      await emit({ type: "message_start", message: assistantMessage });
      await emit({ type: "message_end", message: assistantMessage });
      await emit({
        type: "turn_end",
        message: assistantMessage,
        toolResults: [],
      });
      await emit({
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      });

      return;
    }

    options.conversation.append(assistantMessage, {
      runId,
      turnId: turn.id,
    });

    const toolCalls = getToolCalls(assistantMessage);
    const toolResults: ToolResultMessage[] = [];

    for (const toolCall of toolCalls) {
      await emit({
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
      });

      const result = await toolExecutor.execute(toolCall, options.signal);

      options.conversation.append(result, {
        runId,
        turnId: turn.id,
      });

      toolResults.push(result);

      await emit({
        type: "tool_execution_end",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result,
        isError: result.isError,
      });

      await emit({ type: "message_start", message: result });
      await emit({ type: "message_end", message: result });
    }

    options.conversation.completeTurn(turn.id);

    await emit({
      type: "turn_end",
      message: assistantMessage,
      toolResults,
    });

    if (toolCalls.length === 0) {
      await emit({
        type: "agent_end",
        messages: [...options.conversation.snapshot()],
      });

      return;
    }
  }
}

/**
 * Stream one assistant message from the provider.
 *
 * Provider adapters own wire-format quirks. The agent loop consumes only
 * provider-neutral stream events and final assistant messages.
 */
async function streamAssistantMessage(
  options: RunAgentLoopOptions,
  emit: AgentEventEmitter,
): Promise<AssistantMessage | undefined> {
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
    if (event.type === "start") {
      await emit({
        type: "message_start",
        message: event.partial,
      });
      continue;
    }

    if (
      event.type === "text_start" ||
      event.type === "text_delta" ||
      event.type === "text_end" ||
      event.type === "thinking_start" ||
      event.type === "thinking_delta" ||
      event.type === "thinking_end" ||
      event.type === "toolcall_start" ||
      event.type === "toolcall_delta" ||
      event.type === "toolcall_end"
    ) {
      await emit({
        type: "message_update",
        message: event.partial,
        assistantMessageEvent: event,
      });
      continue;
    }

    if (event.type === "done") {
      assistantMessage = event.message;

      await emit({
        type: "message_end",
        message: event.message,
      });

      continue;
    }

    if (event.type === "error") {
      assistantMessage = event.error;

      await emit({
        type: "message_end",
        message: event.error,
      });

      continue;
    }
  }

  return assistantMessage;
}

/**
 * Adapt an awaited event emitter into an AsyncIterable.
 *
 * This keeps the public streaming API small while allowing loop internals to
 * await event side effects.
 */
function createAgentEventIterable(
  run: (emit: AgentEventEmitter) => Promise<void>,
): AsyncIterable<AgentEvent> {
  const events: AgentEvent[] = [];
  const waiters: Array<() => void> = [];

  let finished = false;
  let failure: unknown;

  const notify = (): void => {
    const waiter = waiters.shift();
    waiter?.();
  };

  void run((event) => {
    events.push(event);
    notify();
  })
    .catch((error: unknown) => {
      failure = error;
    })
    .finally(() => {
      finished = true;
      notify();
    });

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const event = events.shift();

        if (event) {
          yield event;
          continue;
        }

        if (failure) {
          throw failure;
        }

        if (finished) {
          return;
        }

        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
    },
  };
}

function createErrorAssistantMessage(
  errorMessage: string,
  stopReason: "error" | "aborted",
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  };
}

function getToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter(
    (block): block is ToolCall => block.type === "toolCall",
  );
}
