import OpenAI from "openai";
import type { JsonObject, JsonValue, AssistantMessage, ContentBlock, Message, StopReason, ToolDefinition } from "../types";
import type { LLMContext, LLMProvider  } from "./provider";
import type { StreamEvent } from "./events";

    // private client: OpenAI;
    // private model: string;
    // private apiKey: string;
    // private baseUrl: string;
    // private headers: Record<string, string>;
    // private maxRetries: number;
    // private retryDelay: number;
    // private timeout: number;

export type OpenRouterProviderOptions = {
    apiKey?: string;
    model: string;
    baseURL?: string;
}


function toOpenRouterMessages(
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

function toOpenRouterTool(
    tool: ToolDefinition,
  ): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }
   }

   function parseToolArguments(argumentsText: string): JsonObject {
     if (argumentsText.trim().length === 0) {
       return {};
     }
   
     try {
       const parsed: unknown = JSON.parse(argumentsText);
   
       if (isJsonObject(parsed)) {
         return parsed;
       }
   
       return {
         __parseError: true,
         message: "Tool arguments must be a JSON object",
         raw: argumentsText,
       };
     } catch {
       return {
         __parseError: true,
         message: "Failed to parse tool arguments JSON",
         raw: argumentsText,
       };
     }
   }
   
   function isJsonObject(value: unknown): value is JsonObject {
     return (
       typeof value === "object" &&
       value !== null &&
       !Array.isArray(value) &&
       Object.values(value).every(isJsonValue)
     );
   }
   
   function isJsonValue(value: unknown): value is JsonValue {
     if (
       value === null ||
       typeof value === "string" ||
       typeof value === "number" ||
       typeof value === "boolean"
     ) {
       return true;
     }
   
     if (Array.isArray(value)) {
       return value.every(isJsonValue);
     }
   
     return isJsonObject(value);
   }



export class OpenRouterProvider implements LLMProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(options: OpenRouterProviderOptions) {
        const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY is Required');
        }

        this.model = options.model;
        this.client = new OpenAI({
            apiKey,
            baseURL: options.baseURL ?? 'https://openrouter.ai/api/v1',
        });
    }
    async *stream(context: LLMContext, signal?: AbortSignal): AsyncIterable<StreamEvent> {
        try {
            const contentBlocks: ContentBlock[] = [];
            let text = "";

            const toolCallBuffer = new Map<
                number,
                {
                    id: string;
                    name: string;
                    argumentsText: string;
                }
            >();

            const stream = await this.client.chat.completions.create({
                model: this.model,
                stream: true,
                messages: toOpenRouterMessages(context.messages, context.systemPrompt),
                tools: context.tools.map(toOpenRouterTool),
            },
            {signal});

            for await (const chunk of stream){
                if(signal?.aborted) {
                    yield {type: "error", message: "Aborted by user" };
                    return;
                }

                const choices = chunk.choices[0];
                const delta = choices?.delta;

                const textDelta = delta?.content;
                if (textDelta){
                    text += textDelta;
                    yield {type: "text_delta", text: textDelta};
                }

                for (const toolCallDelta of delta?.tool_calls ?? []){
                    const index = toolCallDelta.index;
                    const existing = toolCallBuffer.get(index) ?? {
                        id: "",
                        name: "",
                        argumentsText: "",
                    }
                    if(toolCallDelta.id){
                        existing.id = toolCallDelta.id;
                    }
                    if(toolCallDelta.function?.name){
                        existing.name = toolCallDelta.function.name;
                    }
                    if(toolCallDelta.function?.arguments){
                        existing.argumentsText += toolCallDelta.function?.arguments
                    }

                    toolCallBuffer.set(index, existing);
                }
            }

            if (text.length > 0){
                contentBlocks.push({type: "text", text});
            }

            for (const toolCall of toolCallBuffer.values()){
                const parsedArguments = parseToolArguments(toolCall.argumentsText);

                contentBlocks.push({
                    type: "toolCall",
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: parsedArguments,
                })

                yield {
                    type: "tool_call",
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: parsedArguments,
                }
            }

            const stopReason: StopReason = 
                toolCallBuffer.size > 0 ? "tool_calls" : "stop";

            const message: AssistantMessage = {
                role: "assistant",
                content: contentBlocks,
                stopReason,
            };

            yield {type: "done", message};
    } catch (error) {
        yield {
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }
}

