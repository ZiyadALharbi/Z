import { Container } from "postcss";
import type { StreamEvent } from "../../z-ai/src/types"
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export type StopReason =
  | "stop"
  | "tool_calls"
  | "error"
  | "aborted"
  | "budget_exhausted";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export type ContentBlock = TextBlock | ToolCallBlock;

export interface UserMessage {
  role: "user";
  content: string | TextBlock[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextBlock | ToolCallBlock)[];
  // model: string;
  // usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: TextBlock[];
  details?: any; // will be changed later
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}


export type AgentEvent =
  // Agent lifecycle
  | { type: "agent_start"; prompt: string }
  | { type: "agent_end"; messages: Message[] }

  // Turn lifecycle: one assistant response plus tool calls/results.
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AssistantMessage;
      toolResults: ToolResultMessage[];
    }

  // Message lifecycle.
  | { type: "message_start"; message: Message }
  | {
      type: "message_update";
      message: AssistantMessage;
      streamEvent: StreamEvent;
    }
  | { type: "message_end"; message: Message }

  // Tool execution lifecycle.
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: ToolCallBlock["arguments"];
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: ToolCallBlock["arguments"];
      partialResult: any;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: any;
      isError: boolean;
    };








// these gonna be changed later
export type ToolArgumentParser<TArgs extends JsonObject = JsonObject> = (
  args: JsonObject,
) => TArgs;

export type ToolHandler<TArgs extends JsonObject = JsonObject> = (
  args: TArgs,
  signal?: AbortSignal,
) => Promise<string>;

export type Tool<TArgs extends JsonObject = JsonObject> = {
  definition: ToolDefinition;

  // Runtime validation lives beside the model-facing schema.
  // ToolExecutor calls this before the handler, so handlers receive trusted args.
  parseArgs?: ToolArgumentParser<TArgs>;
  handler: ToolHandler<TArgs>;
};

