/*
OpenRouter Tool Call Buffer

Accumulates streamed OpenRouter tool-call deltas into complete internal
ToolCallBlock values. OpenRouter may send the id, function name, and argument
JSON across separate stream chunks.
*/

import type OpenAI from "openai";
import type { ToolCallBlock } from "../../../z-Agent/src/types";
import { parseToolArguments } from "../tool-arguments";

type BufferedToolCall = {
  id: string;
  name: string;
  argumentsText: string;
};

type OpenRouterToolCallDelta =
  OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall;

export class ToolCallBuffer {
  private readonly calls = new Map<number, BufferedToolCall>();

  append(delta: OpenRouterToolCallDelta): void {
    const existing = this.calls.get(delta.index) ?? {
      id: "",
      name: "",
      argumentsText: "",
    };

    if (delta.id) {
      existing.id = delta.id;
    }

    if (delta.function?.name) {
      existing.name = delta.function.name;
    }

    if (delta.function?.arguments) {
      existing.argumentsText += delta.function.arguments;
    }

    this.calls.set(delta.index, existing);
  }

  toToolCalls(): ToolCallBlock[] {
    return [...this.calls.values()].map((call) => ({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: parseToolArguments(call.argumentsText),
    }));
  }

  size(): number {
    return this.calls.size;
  }
}
