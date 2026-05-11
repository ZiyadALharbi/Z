import { describe, expect, test } from "bun:test";
import { IterationBudget } from "../src/budget";
import { ToolRegistry } from "../src/registry";
import { parseToolArguments } from "../src/ai/tool-arguments";
import { SystemPromptBuilder } from "../src/prompt/builder";
import type { Tool } from "../src/types";

function createTool(name: string): Tool {
  return {
    definition: {
      name,
      description: `${name} description`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async () => `${name} result`,
  };
}

describe("IterationBudget", () => {
  test("consumes until exhausted", () => {
    const budget = new IterationBudget(2);

    expect(budget.getRemaining()).toBe(2);
    expect(budget.consume()).toBe(true);
    expect(budget.getRemaining()).toBe(1);
    expect(budget.consume()).toBe(true);
    expect(budget.getRemaining()).toBe(0);
    expect(budget.consume()).toBe(false);
    expect(budget.getRemaining()).toBe(0);
  });

  test("requires at least one iteration", () => {
    expect(() => new IterationBudget(0)).toThrow(
      "maxIterations must be at least 1",
    );
  });
});

describe("ToolRegistry", () => {
  test("registers tools explicitly and returns definitions in insertion order", () => {
    const registry = new ToolRegistry();
    const first = createTool("first");
    const second = createTool("second");

    registry.register(first);
    registry.register(second);

    expect(registry.get("first")).toBe(first);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.getDefinitions().map((definition) => definition.name)).toEqual(
      ["first", "second"],
    );
  });

  test("rejects duplicate tool names", () => {
    const registry = new ToolRegistry();

    registry.register(createTool("duplicate"));

    expect(() => registry.register(createTool("duplicate"))).toThrow(
      "Tool already registered: duplicate",
    );
  });
});

describe("parseToolArguments", () => {
  test("parses valid JSON objects", () => {
    expect(parseToolArguments('{"path":"README.md","limit":3}')).toEqual({
      path: "README.md",
      limit: 3,
    });
  });

  test("treats empty argument text as an empty object", () => {
    expect(parseToolArguments("   ")).toEqual({});
  });

  test("turns invalid JSON into a parse-error object", () => {
    expect(parseToolArguments("{not json")).toEqual({
      __parseError: true,
      message: "Failed to parse tool arguments JSON",
      raw: "{not json",
    });
  });

  test("rejects non-object JSON values", () => {
    expect(parseToolArguments("[]")).toEqual({
      __parseError: true,
      message: "Tool arguments must be a JSON object",
      raw: "[]",
    });
  });
});

describe("SystemPromptBuilder", () => {
  test("builds identity, rules, and tool documentation", () => {
    const builder = new SystemPromptBuilder({
      identity: "Identity",
      rules: ["Rule one", "Rule two"],
    });

    const prompt = builder.build([createTool("read_file").definition]);

    expect(prompt).toContain("Identity");
    expect(prompt).toContain("## Rules");
    expect(prompt).toContain("- Rule one");
    expect(prompt).toContain("### read_file");
    expect(prompt).toContain("Parameters:");
  });

  test("states when no tools are available", () => {
    const prompt = new SystemPromptBuilder().build([]);

    expect(prompt).toContain("No tools are currently available.");
  });
});
