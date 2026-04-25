import type { JsonObject, ToolCallBlock, ToolResultMessage } from "../types";
import { ToolRegistry } from "../registry";

export type ToolExecutorOptions = {
    maxOutputLength?: number;
  };

const DEFAULT_MAX_OUTPUT_LENGTH = 20_000;

export class ToolExecutor {
    private readonly maxOutputLength: number;

    constructor(
        private readonly registry: ToolRegistry,
        options: ToolExecutorOptions = {}
    ){
        this.maxOutputLength = options.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
    }

    async execute(toolCall: ToolCallBlock, signal?: AbortSignal): Promise<ToolResultMessage> {
        const tool = this.registry.get(toolCall.name);

        if(!tool){
            return {
                role: "toolResult",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                content: `Tool not found: ${toolCall.name}`,
                isError: true,  
            };
        }

        if(hasParseError(toolCall.arguments)){
            return {
                role: "toolResult",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                content: formatParseError(toolCall.arguments),
                isError: true,  
            };
        }

        try {
            const result = await tool.handler(toolCall.arguments, signal);

            return {
                role: "toolResult",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                content: this.truncate(result),
                isError: false,
              };

        } catch (error) {
            return {
              role: "toolResult",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: error instanceof Error ? error.message : String(error),
              isError: true,
            };
        }
    }
    private truncate(output: string): string {
        if (output.length <= this.maxOutputLength) {
          return output;
        }
        return `${output.slice(0, this.maxOutputLength)}\n\n[Tool output truncated]`;
      } 
}

function hasParseError(args: JsonObject): boolean {
    return args.__parseError === true;
}

function formatParseError(args: JsonObject): string {
    const message =
      typeof args.message === "string"
        ? args.message
        : "Invalid tool arguments";
    const raw =
      typeof args.raw === "string"
        ? `\n\nRaw arguments:\n${args.raw}`
        : "";
    return `${message}${raw}`;
}