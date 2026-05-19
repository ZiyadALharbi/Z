export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type StopReason =
  | "stop"
  | "tool_calls"
  | "error"
  | "aborted"
  | "budget_exhausted";

export type TextBlock = {
  type: "text";
  text: string;
};

export type ToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: JsonObject;
};

export type ContentBlock = TextBlock | ToolCallBlock;

export type UserMessage = {
  role: "user";
  content: string | ContentBlock[];
};

export type AssistantMessage = {
  role: "assistant";
  content: ContentBlock[];
  stopReason: StopReason;
  errorMessage?: string;
};

export type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
};

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

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
