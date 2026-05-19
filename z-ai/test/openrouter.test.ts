import { describe, expect, test } from "bun:test";
import { toOpenRouterMessages, toOpenRouterTool } from "../src/openrouter/convert";
import { ToolCallBuffer } from "../src/openrouter/tool-call-buffer";
import type { Message, ToolDefinition } from "../../z-Agent/src/types";

describe("OpenRouter conversion", () => {
  test("converts internal messages to OpenRouter chat messages", () => {
    const messages: Message[] = [
      { role: "user", content: "Read the file" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I will read it." },
          {
            type: "toolCall",
            id: "call_1",
            name: "read_file",
            arguments: { path: "README.md" },
          },
        ],
        stopReason: "tool_calls",
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read_file",
        content: "# README",
        isError: false,
      },
    ];

    expect(toOpenRouterMessages(messages, "System")).toEqual([
      { role: "system", content: "System" },
      { role: "user", content: "Read the file" },
      {
        role: "assistant",
        content: "I will read it.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "read_file",
              arguments: JSON.stringify({ path: "README.md" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "# README",
      },
    ]);
  });

  test("converts tool definitions to OpenRouter function tools", () => {
    const tool: ToolDefinition = {
      name: "grep",
      description: "Search files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
        },
        required: ["pattern"],
      },
    };

    expect(toOpenRouterTool(tool)).toEqual({
      type: "function",
      function: {
        name: "grep",
        description: "Search files",
        parameters: tool.parameters,
      },
    });
  });
});

describe("ToolCallBuffer", () => {
  test("reassembles streamed tool call deltas by index", () => {
    const buffer = new ToolCallBuffer();

    buffer.append({
      index: 0,
      id: "call_1",
      function: { name: "read_file", arguments: '{"pa' },
    } as never);
    buffer.append({
      index: 0,
      function: { arguments: 'th":"README.md"}' },
    } as never);

    expect(buffer.size()).toBe(1);
    expect(buffer.toToolCalls()).toEqual([
      {
        type: "toolCall",
        id: "call_1",
        name: "read_file",
        arguments: { path: "README.md" },
      },
    ]);
  });

  test("preserves parse errors as tool-call arguments", () => {
    const buffer = new ToolCallBuffer();

    buffer.append({
      index: 0,
      id: "call_1",
      function: { name: "read_file", arguments: "{bad" },
    } as never);

    expect(buffer.toToolCalls()[0]?.arguments).toEqual({
      __parseError: true,
      message: "Failed to parse tool arguments JSON",
      raw: "{bad",
    });
  });
});
