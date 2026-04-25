import type { Message, ToolDefinition } from "../types";    
import type { StreamEvents } from "./events";

export type Context = {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
}

export interface Provider {
    stream(context: Context, signal?: AbortSignal): AsyncIterable<StreamEvents>
}

