
import type { Static, TSchema } from "typebox";

/**
 * Content returned by users, assistants, and tools.
 *
 * this is provider-neutral. Provider adapters are responsible for converting
 * these blocks into their wire format.
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * A raw tool call emitted by a model.
 *
 * Arguments are intentionally loose because providers stream or return raw
 * model-generated JSON. The agent runtime validates these arguments against the
 * target tool schema before execution.
 */
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>; // maybe make it any later, need to reason about it
}

export type AssistantContent = TextContent | ToolCall;
export type UserContent = TextContent;
export type ToolResultContent = TextContent;

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

export type StopReason = "stop" | "length"| "tool_calls" | "error" | "aborted"; // or toolUse in general? 

export interface UserMessage {
  role: "user";
  content: UserContent[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  stopReason: StopReason;
  errorMessage?: string;
  provider?: string;
  model?: string;
  usage?: Usage;
  timestamp: number;
}

export interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: ToolResultContent[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/**
 * Model-facing tool definition.
 *
 * TypeBox is used because it is already JSON-schema-shaped, which means the
 * same schema can describe the tool to the model and validate tool parameters
 * in the runtime.
 */
export interface ToolDefinition<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
}

export interface LLMContext {
  systemPrompt: string;
  messages: Message[];
  tools?: ToolDefinition[];
}

/**
 * Provider stream protocol.
 *
 * Providers should finish with a full assistant message. Runtime/provider
 * failures should be represented as final assistant messages with stopReason
 * "error" or "aborted" instead of escaping as thrown control flow.
 * 
 * The AssistantMessageEvent is taking From Pi "Pi/packages/ai/src/types.ts"
 */
 export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: "done"; reason: Extract<StopReason, "stop" | "length" | "tool_calls">; message: AssistantMessage }
	| { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

export interface LLMProvider {
  stream(
    context: LLMContext,
    signal?: AbortSignal,
  ): AsyncIterable<AssistantMessageEvent>;
}

export type ToolParameters<T extends TSchema> = Static<T>;