import { describe, expect, test } from "bun:test";
import { ToolRegistry } from "../src/registry";
import { ToolExecutor } from "../src/tools/executor";
import type { Tool, ToolCallBlock } from "../src/types";
import { requireString } from "../src/tools/args";

function toolCall(
  overrides: Partial<ToolCallBlock> = {},
): ToolCallBlock {
  return {
    type: "toolCall",
    id: "call_1",
    name: "echo",
    arguments: { value: "hello" },
    ...overrides,
  };
}

function createEchoTool(handler?: Tool["handler"]): Tool {
  return {
    definition: {
      name: "echo",
      description: "Echo input",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: handler ?? (async (args) => String(args.value)),
  };
}

describe("ToolExecutor", () => {
  test("executes registered tools and returns tool result messages", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const result = await new ToolExecutor(registry).execute(toolCall());

    expect(result).toEqual({
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "echo",
      content: "hello",
      isError: false,
    });
  });

  test("returns an error result for unknown tools", async () => {
    const result = await new ToolExecutor(new ToolRegistry()).execute(
      toolCall({ name: "missing" }),
    );

    expect(result).toEqual({
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "missing",
      content: "Tool not found: missing",
      isError: true,
    });
  });

  test("returns an error result for parse-error arguments", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const result = await new ToolExecutor(registry).execute(
      toolCall({
        arguments: {
          __parseError: true,
          message: "Invalid JSON",
          raw: "{bad",
        },
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Invalid JSON");
    expect(result.content).toContain("{bad");
  });

  test("catches handler errors as error results", async () => {
    const registry = new ToolRegistry();
    registry.register(
      createEchoTool(async () => {
        throw new Error("boom");
      }),
    );

    const result = await new ToolExecutor(registry).execute(toolCall());

    expect(result.isError).toBe(true);
    expect(result.content).toBe("boom");
  });

  test("truncates long successful output", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool(async () => "abcdef"));

    const result = await new ToolExecutor(registry, {
      maxOutputLength: 3,
    }).execute(toolCall());

    expect(result.content).toBe("abc\n\n[Tool output truncated]");
  });

  test("passes abort signals to tool handlers", async () => {
    const registry = new ToolRegistry();
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    registry.register(
      createEchoTool(async (_args, signal) => {
        receivedSignal = signal;
        return "ok";
      }),
    );

    await new ToolExecutor(registry).execute(toolCall(), controller.signal);

    expect(receivedSignal).toBe(controller.signal);
  });
});

test("validates tool arguments before calling handlers", async () => {
  const registry = new ToolRegistry();
  let handlerCalled = false;

  registry.register({
    definition: {
      name: "needs_path",
      description: "Needs a path",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    parseArgs: (args) => ({ path: requireString(args, "path") }),
    handler: async () => {
      handlerCalled = true;
      return "ok";
    },
  });

  const result = await new ToolExecutor(registry).execute({
    type: "toolCall",
    id: "call_1",
    name: "needs_path",
    arguments: { path: 123 },
  });

  expect(result.isError).toBe(true);
  expect(result.content).toContain(`Expected "path" to be a string`);
  expect(handlerCalled).toBe(false);
});