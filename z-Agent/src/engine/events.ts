import type { StreamEvent } from "../../../z-ai/src/events";
import type {
  AssistantMessage,
  Message,
  ToolCallBlock,
  ToolResultMessage,
} from "../types";

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
