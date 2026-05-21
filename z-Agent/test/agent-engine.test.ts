import { describe, expect, test } from "bun:test";
import type { StreamEvent } from "../../z-ai/src/types";
import type { LLMContext, LLMProvider } from "../../z-ai/src/provider";
import { Agent } from "../src/agent";
import { ToolRegistry } from "../src/harness/tools/registry";

class StaticProvider implements LLMProvider {
  readonly contexts: LLMContext[] = [];

  async *stream(context: LLMContext): AsyncIterable<StreamEvent> {
    this.contexts.push(context);
    yield {
      type: "done",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stopReason: "stop",
        timestamp: Date.now(),
      },
    };
  }
}

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of iterable) {
    // Consume the run.
  }
}

describe("Agent", () => {
  test("preserves conversation across runs", async () => {
    const provider = new StaticProvider();
    const agent = new Agent({
      provider,
      registry: new ToolRegistry(),
      maxIterations: 2,
    });

    await drain(agent.run("first"));
    await drain(agent.run("second"));

    expect(agent.getMessages()).toEqual([
      { role: "user", content: "first" },
      {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stopReason: "stop",
      },
      { role: "user", content: "second" },
      {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stopReason: "stop",
      },
    ]);
    expect(provider.contexts[1]?.messages).toEqual([
      { role: "user", content: "first" },
      {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
        stopReason: "stop",
      },
      { role: "user", content: "second" },
    ]);
  });

  test("exposes conversation metadata", () => {
    const agent = new Agent({
      provider: new StaticProvider(),
      registry: new ToolRegistry(),
    });

    const metadata = agent.getConversationMetadata();

    expect(metadata.id.length).toBeGreaterThan(0);
    expect(metadata.createdAt).toBeInstanceOf(Date);
    expect(metadata.updatedAt).toBeInstanceOf(Date);
  });
});
