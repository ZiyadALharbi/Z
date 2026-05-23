import type {
  AssistantMessage,
  AssistantMessageEvent,
  LLMContext,
  Message,
  TextContent,
  ToolParameters,
} from "../../z-ai/src/types";

import { Static, TSchema } from "typebox";

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

// import { Container } from "postcss";
// import type { StreamEvent } from "../../z-ai/src/types"
// export type JsonPrimitive = string | number | boolean | null;

// export type JsonValue =
//   | JsonPrimitive
//   | JsonValue[]
//   | { [key: string]: JsonValue };

// export type JsonObject = { [key: string]: JsonValue };

// export interface Usage {
//   input: number;
//   output: number;
//   cacheRead: number;
//   cacheWrite: number;
//   totalTokens: number;
//   cost: {
//     input: number;
//     output: number;
//     cacheRead: number;
//     cacheWrite: number;
//     total: number;
//   };
// }

// export type StopReason =
//   | "stop"
//   | "tool_calls"
//   | "error"
//   | "aborted"
//   | "budget_exhausted";

// export interface TextBlock {
//   type: "text";
//   text: string;
// }

// export interface ToolCallBlock {
//   type: "toolCall";
//   id: string;
//   name: string;
//   arguments: Record<string, any>;
// }

// export type ContentBlock = TextBlock | ToolCallBlock;

// export interface UserMessage {
//   role: "user";
//   content: string | TextBlock[];
//   timestamp: number;
// }

// export interface AssistantMessage {
//   role: "assistant";
//   content: (TextBlock | ToolCallBlock)[];
//   // model: string;
//   // usage: Usage;
//   stopReason: StopReason;
//   errorMessage?: string;
//   timestamp: number;
// }

// export interface ToolResultMessage {
//   role: "toolResult";
//   toolCallId: string;
//   toolName: string;
//   content: TextBlock[];
//   details?: any; // will be changed later
//   isError: boolean;
//   timestamp: number;
// }

// export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// export interface ToolDefinition {
//   name: string;
//   description: string;
//   parameters: {
//     type: "object";
//     properties: Record<string, unknown>;
//     required?: string[];
//   };
// }

// // these gonna be changed later
// export type ToolArgumentParser<TArgs extends JsonObject = JsonObject> = (
//   args: JsonObject,
// ) => TArgs;

// export type ToolHandler<TArgs extends JsonObject = JsonObject> = (
//   args: TArgs,
//   signal?: AbortSignal,
// ) => Promise<string>;

// export type Tool<TArgs extends JsonObject = JsonObject> = {
//   definition: ToolDefinition;

//   // Runtime validation lives beside the model-facing schema.
//   // ToolExecutor calls this before the handler, so handlers receive trusted args.
//   parseArgs?: ToolArgumentParser<TArgs>;
//   handler: ToolHandler<TArgs>;
// };
