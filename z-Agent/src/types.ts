import type {
  AssistantMessage,
  AssistantMessageEvent,
  LLMContext,
  Message,
  TextContent,
  ToolParameters,
} from "../../z-ai/src/types";

import type { Static, TSchema } from "@sinclair/typebox";

export type StreamFunction = (
  context: LLMContext,
  signal?: AbortSignal,
) => AsyncIterable<AssistantMessageEvent>;

export type ToolExecutionMode = "sequential" | "parallel";

export type AgentToolCall = Extract<
  AssistantMessage["content"][number],
  { type: "toolCall" }
>;

export interface AgentToolResult<TDetails = unknown> {
  /** Content returned to the model. */
  content: TextContent[];
  /** Structured metadata for UI, logs, tracing, or tool-specific data. */
  details?: TDetails;
  terminate?: boolean;
}

/* Handler for updates from a tool execution, including partial results and termination signals. */
export type AgentToolUpdateHandler<TDetails = unknown> = (
  partialResult: AgentToolResult<TDetails>,
) => void;

export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends ToolParameters<TParameters> {
  label: string;

  /**
   * Used for provider/model quirks, not normal validation.
   */
  prepareArguments?: (args: Record<string, unknown>) => unknown;
  /**
   * Execute after arguments are validated against `parameters`.
   * Tool implementations receive typed params, not raw model JSON.
   */
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateHandler<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;

  executionMode?: ToolExecutionMode;
}

export interface CustomAgentMessages {
  /* We can't anticipate the different kind of non-LLM messages, so this interface allows for custom message types.
   * This is to be extended via declaration merging.
   */
}

export type AgentMessage =
  | Message
  | CustomAgentMessages[keyof CustomAgentMessages];

export interface AgentContext {
  /** System prompt included with the provider request. */
  systemPrompt: string;
  /** Current agent transcript before provider-specific conversion. */
  messages: AgentMessage[];
  tools?: AgentTool[];
}

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: Message[];
    }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: AgentToolCall["arguments"];
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: AgentToolCall["arguments"];
      partialResult: AgentToolResult;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: AgentToolResult;
      isError: boolean;
    };
