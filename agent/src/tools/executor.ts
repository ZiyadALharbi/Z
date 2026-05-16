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
    options: ToolExecutorOptions = {},
  ) {
    this.maxOutputLength = options.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
  }

  async execute(
    toolCall: ToolCallBlock,
    signal?: AbortSignal,
  ): Promise<ToolResultMessage> {
    const tool = this.registry.get(toolCall.name);

    if (!tool) {
      return this.errorResult(toolCall, `Tool not found: ${toolCall.name}`);
    }

    if (hasParseError(toolCall.arguments)) {
      return this.errorResult(toolCall, formatParseError(toolCall.arguments));
    }

    let args: JsonObject;

    try {
      // One invocation seam for all tools: raw model args become trusted handler args here.
      args = tool.parseArgs
        ? tool.parseArgs(toolCall.arguments)
        : toolCall.arguments;
    } catch (error) {
      return this.errorResult(
        toolCall,
        error instanceof Error ? error.message : String(error),
      );
    }

    try {
      const result = await tool.handler(args, signal);

      return {
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: this.truncate(result),
        isError: false,
      };
    } catch (error) {
      return this.errorResult(
        toolCall,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private errorResult(
    toolCall: ToolCallBlock,
    content: string,
  ): ToolResultMessage {
    return {
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content,
      isError: true,
    };
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
    typeof args.message === "string" ? args.message : "Invalid tool arguments";
  const raw =
    typeof args.raw === "string" ? `\n\nRaw arguments:\n${args.raw}` : "";
  return `${message}${raw}`;
}
