import { describe, expect, test } from "bun:test";
import type { StreamEvent } from "../src/ai/events";
import type { LLMContext, LLMProvider } from "../src/ai/provider";
import { AgentEngine } from "../src/engine/agent-engine";
import { ToolRegistry } from "../src/registry";

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
      },
    };
  }
}

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of iterable) {
    // Consume the run.
  }
}

describe("AgentEngine", () => {
  test("preserves conversation across runs", async () => {
    const provider = new StaticProvider();
    const engine = new AgentEngine({
      provider,
      registry: new ToolRegistry(),
      maxIterations: 2,
    });

    await drain(engine.run("first"));
    await drain(engine.run("second"));

    expect(engine.getMessages()).toEqual([
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
    const engine = new AgentEngine({
      provider: new StaticProvider(),
      registry: new ToolRegistry(),
    });

    const metadata = engine.getConversationMetadata();

    expect(metadata.id.length).toBeGreaterThan(0);
    expect(metadata.createdAt).toBeInstanceOf(Date);
    expect(metadata.updatedAt).toBeInstanceOf(Date);
  });
});
