import type { AssistantMessage, StopReason, ToolCallBlock, ToolResultMessage } from "../types";

export type AgentEngineEvent =
  | { type: "run_started"; prompt: string }
  | { type: "iteration_started"; iteration: number; remainingIterations: number }
  | { type: "text"; text: string }
  | { type: "assistant_message"; message: AssistantMessage }
  | { type: "tool_started"; toolCall: ToolCallBlock }
  | { type: "tool_finished"; result: ToolResultMessage }
  | { type: "error"; message: string }
  | { type: "run_finished"; stopReason: StopReason };
