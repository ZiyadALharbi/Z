// import type {
//   AssistantMessage,
//   StopReason,
//   ToolCallBlock,
//   ToolResultMessage,
// } from "../types";

// export type AgentEngineEvent =
//   | { type: "run_started"; prompt: string }
//   | {
//       type: "iteration_started";
//       iteration: number;
//       remainingIterations: number;
//     }
//   | { type: "text"; text: string }
//   | { type: "assistant_message"; message: AssistantMessage }
//   | { type: "tool_started"; toolCall: ToolCallBlock }
//   | { type: "tool_finished"; result: ToolResultMessage }
//   | { type: "error"; message: string }
//   | { type: "run_finished"; stopReason: StopReason };

import type {
  ConversationEntry,
  RunId,
  SessionId,
  TurnId,
  TurnMetadata,
} from "../harness/types";
import type {
  AssistantMessage,
  StopReason,
  ToolCallBlock,
  ToolResultMessage,
} from "../types";

type EventScope = {
  sessionId: SessionId;
  runId: RunId;
  turnId: TurnId;
};

export type AgentEngineEvent =
  | ({
      type: "run_started";
      prompt: string;
    } & EventScope)
  | ({
      type: "turn_started";
      turn: TurnMetadata;
    } & EventScope)
  | ({
      type: "iteration_started";
      iteration: number;
      remainingIterations: number;
    } & EventScope)
  | ({
      type: "text";
      text: string;
    } & EventScope)
  | ({
      type: "message_appended";
      entry: ConversationEntry;
    } & EventScope)
  | ({
      type: "assistant_message";
      message: AssistantMessage;
      entryId: string;
    } & EventScope)
  | ({
      type: "tool_started";
      toolCall: ToolCallBlock;
      parentEntryId: string;
    } & EventScope)
  | ({
      type: "tool_finished";
      result: ToolResultMessage;
      entryId: string;
      parentEntryId: string;
    } & EventScope)
  | ({
      type: "turn_finished";
      turn: TurnMetadata;
      stopReason: StopReason;
    } & EventScope)
  | ({
      type: "error";
      message: string;
    } & EventScope)
  | ({
      type: "run_finished";
      stopReason: StopReason;
    } & EventScope);