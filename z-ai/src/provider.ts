import type { Message, ToolDefinition } from "../../z-Agent/src/types";
import type { StreamEvent } from "./events";

export type LLMContext = {
  systemPrompt: string;
  messages: Message[];
  tools: ToolDefinition[];
};

export interface LLMProvider {
  stream(context: LLMContext, signal?: AbortSignal): AsyncIterable<StreamEvent>;
}
