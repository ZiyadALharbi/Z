/*
OpenRouter Conversion

Translates internal AgentEngine messages and tool definitions into the
OpenAI-compatible wire format used by OpenRouter.
*/

import OpenAI from "openai";
import type { Message, ToolDefinition } from "../../types";

export function toOpenRouterMessages(
  messages: Message[],
  systemPrompt: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const converted: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  for (const message of messages) {
    if (message.role === "user") {
      converted.push({
        role: "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n"),
      });
    }

    if (message.role === "assistant") {
      converted.push({
        role: "assistant",
        content: message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n"),
        tool_calls: message.content
          .filter((block) => block.type === "toolCall")
          .map((block) => ({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.arguments),
            },
          })),
      });
    }

    if (message.role === "toolResult") {
      converted.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }

  return converted;
}

export function toOpenRouterTool(
  tool: ToolDefinition,
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
