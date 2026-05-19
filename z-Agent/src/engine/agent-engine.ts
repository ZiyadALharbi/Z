/*
AgentEngine

Stateful wrapper around the Agent Loop.
Owns provider configuration, tool registration, conversation state, and
cancellation for an interactive session.
*/

import { IterationBudget } from "../budget";
import type { LLMProvider } from "../../../z-ai/src/provider";
import { ToolRegistry } from "../registry";
import type { Message } from "../types";
import { SystemPromptBuilder } from "../harness/system_prompt";
import { ToolExecutor } from "../tools/executor";
import type { AgentEngineEvent } from "./events";
import { runAgentLoop } from "./loop";
import { ConversationState } from "./conversation-state";
import type {
  ConversationEntry,
  SessionMetadata,
  SessionSnapshot,
} from "../harness/types";

export type AgentEngineOptions = {
  provider: LLMProvider;
  registry: ToolRegistry;
  promptBuilder?: SystemPromptBuilder;
  maxIterations?: number;
  conversation?: ConversationState;
};

export class AgentEngine {
  private readonly provider: LLMProvider;
  private readonly registry: ToolRegistry;
  private readonly promptBuilder: SystemPromptBuilder;
  private readonly maxIterations: number;
  private readonly conversation: ConversationState;
  private abortController?: AbortController;

  constructor(options: AgentEngineOptions) {
    this.provider = options.provider;
    this.registry = options.registry;
    this.promptBuilder = options.promptBuilder ?? new SystemPromptBuilder();
    this.maxIterations = options.maxIterations ?? 20;
    this.conversation = options.conversation ?? new ConversationState();
  }

  run(prompt: string): AsyncIterable<AgentEngineEvent> {
    this.abortController = new AbortController();

    return runAgentLoop({
      prompt,
      conversation: this.conversation,
      provider: this.provider,
      registry: this.registry,
      promptBuilder: this.promptBuilder,
      budget: new IterationBudget(this.maxIterations),
      toolExecutor: new ToolExecutor(this.registry),
      signal: this.abortController.signal,
    });
  }

  abort(): void {
    this.abortController?.abort();
  }

  getMessages(): readonly Message[] {
    return this.conversation.snapshot();
  }

  getEntries(): readonly ConversationEntry[] {
    return this.conversation.getEntries();
  }

  getSessionSnapshot(): SessionSnapshot {
    return this.conversation.getSessionSnapshot();
  }

  getSessionMetadata(): Readonly<SessionMetadata> {
    return this.conversation.getMetadata();
  }
}
