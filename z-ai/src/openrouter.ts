/*
OpenRouter Provider

Implements the LLMProvider interface using OpenRouter's OpenAI-compatible
streaming chat completions API. Provider-specific wire-format conversion and
tool-call buffering live in focused helper modules.
*/

import OpenAI from "openai";

import type { AssistantMessage, AssistantContent } from "./types";
import type { AssistantMessageEvent, LLMContext, LLMProvider } from "./types";
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
  /**
   * Stream an assistant response from OpenRouter.
   *
   * Provider adapters own wire-format quirks. The agent loop should only see
   * provider-neutral assistant stream events and final assistant messages.
   */
  async *stream(
    context: LLMContext,
    signal?: AbortSignal,
  ): AsyncIterable<AssistantMessageEvent> {
    const contentBlocks: AssistantContent[] = [];
    let text = "";
    const toolCallBuffer = new ToolCallBuffer();
  
    let partial: AssistantMessage = {
      role: "assistant",
      content: [],
      stopReason: "stop",
      timestamp: Date.now(),
    };
  
    yield { type: "start", partial };
  
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          messages: toOpenRouterMessages(context.messages, context.systemPrompt),
          tools: context.tools?.map(toOpenRouterTool) ?? [],
        },
        { signal },
      );
  
      for await (const chunk of stream) {
        if (signal?.aborted) {
          const abortedMessage: AssistantMessage = {
            ...partial,
            stopReason: "aborted",
            errorMessage: "Aborted by user",
            timestamp: Date.now(),
          };
  
          yield {
            type: "error",
            reason: "aborted",
            error: abortedMessage,
          };
  
          return;
        }
  
        const delta = chunk.choices[0]?.delta;
        const textDelta = delta?.content;
  
        if (textDelta) {
          if (text.length === 0) {
            yield {
              type: "text_start",
              contentIndex: 0,
              partial,
            };
          }
  
          text += textDelta;
  
          partial = {
            ...partial,
            content: [{ type: "text", text }],
          };
  
          yield {
            type: "text_delta",
            contentIndex: 0,
            delta: textDelta,
            partial,
          };
        }
  
        for (const toolCallDelta of delta?.tool_calls ?? []) {
          toolCallBuffer.append(toolCallDelta);
        }
      }
  
      if (text.length > 0) {
        contentBlocks.push({ type: "text", text });
  
        yield {
          type: "text_end",
          contentIndex: 0,
          content: text,
          partial,
        };
      }
  
      for (const toolCall of toolCallBuffer.toToolCalls()) {
        contentBlocks.push(toolCall);
      }
  
      const stopReason = contentBlocks.some((block) => block.type === "toolCall")
        ? "tool_calls"
        : "stop";
  
      const message: AssistantMessage = {
        role: "assistant",
        content: contentBlocks,
        stopReason,
        timestamp: Date.now(),
      };
  
      yield {
        type: "done",
        reason: stopReason,
        message,
      };
    } catch (error) {
      const errorMessage: AssistantMessage = {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
  
      yield {
        type: "error",
        reason: "error",
        error: errorMessage,
      };
    }
  }
}
