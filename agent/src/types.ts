export type StopReason = "stop" | "tool_calls" | "error" | "aborted" | "budget_exhausted";

export type TextBlock = {
    type: "text";
    text: string;
}

export type ToolCallBlock = {
    type: "toolCall";
    id: string;
    name: string;
    arguments: unknown;
}

export type ContentBlock = TextBlock | ToolCallBlock;

export type UserMessage = {
    role: "user";
    content: string | ContentBlock[];
}

export type AssistantMessage = {
    role: "assistant";
    content: ContentBlock[];
    stopReason: StopReason;
    errorMessage?: string;
}

export type ToolResultMessage = {
    role: "toolResult";
    toolCallId: string;
    toolName: string;
    content: string;
    isError: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export type ConversationState = {
    messages: Message[];
}


