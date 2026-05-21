/*
OpenRouter Provider

Implements the LLMProvider interface using OpenRouter's OpenAI-compatible
streaming chat completions API. Provider-specific wire-format conversion and
tool-call buffering live in focused helper modules.
*/

import OpenAI from "openai";
import type { AssistantMessage, ContentBlock, StopReason } from "../../z-Agent/src/types";
import type { LLMContext, LLMProvider } from "./provider";
import type { StreamEvent } from "./types";
import { toOpenRouterMessages, toOpenRouterTool } from "./openrouter/convert";
import { ToolCallBuffer } from "./openrouter/tool-call-buffer";

export type OpenRouterProviderOptions = {
  apiKey?: string;
  model: string;
  baseURL?: string;
};

export class OpenRouterProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenRouterProviderOptions) {
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }

    this.model = options.model;
    this.client = new OpenAI({
      apiKey,
      baseURL: options.baseURL ?? "https://openrouter.ai/api/v1",
    });
  }

  async *stream(
    context: LLMContext,
    signal?: AbortSignal,
  ): AsyncIterable<StreamEvent> {
    try {
      const contentBlocks: ContentBlock[] = [];
      let text = "";
      const toolCallBuffer = new ToolCallBuffer();

      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          messages: toOpenRouterMessages(
            context.messages,
            context.systemPrompt,
          ),
          tools: context.tools.map(toOpenRouterTool),
        },
        { signal },
      );

      for await (const chunk of stream) {
        if (signal?.aborted) {
          yield { type: "error", message: "Aborted by user" };
          return;
        }

        const choice = chunk.choices[0];
        const delta = choice?.delta;

        const textDelta = delta?.content;

        if (textDelta) {
          text += textDelta;
          yield { type: "text_delta", text: textDelta };
        }

        for (const toolCallDelta of delta?.tool_calls ?? []) {
          toolCallBuffer.append(toolCallDelta);
        }
      }

      if (text.length > 0) {
        contentBlocks.push({ type: "text", text });
      }

      const toolCalls = toolCallBuffer.toToolCalls();

      for (const toolCall of toolCalls) {
        contentBlocks.push(toolCall);

        yield {
          type: "tool_call",
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        };
      }

      const stopReason: StopReason =
        toolCalls.length > 0 ? "tool_calls" : "stop";

      const message: AssistantMessage = {
        role: "assistant",
        content: contentBlocks,
        stopReason,
        timestamp: Date.now(),
      };

      yield { type: "done", message };
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
