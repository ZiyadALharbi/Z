/*
AgentEngine

Thin stateful wrapper around the pure AgentEngine Loop.
Owns provider configuration, tool registration, conversation state, and
cancellation for an interactive session.
*/

import { IterationBudget } from "../budget";
import type { LLMProvider } from "../ai/provider";
import { ToolRegistry } from "../registry";
import type { Message } from "../types";
import { SystemPromptBuilder } from "../prompt/builder";
import { ToolExecutor } from "../tools/executor";
import type { AgentEngineEvent } from "./events";
import { runAgentEngineLoop } from "./loop";
import { ConversationState, type ConversationMetadata,} from "./conversation-state";

export type AgentEngineOptions = {
  provider: LLMProvider;
  registry: ToolRegistry;
  promptBuilder?: SystemPromptBuilder;
  maxIterations?: number;
};

export class AgentEngine {
  private readonly provider: LLMProvider;
  private readonly registry: ToolRegistry;
  private readonly promptBuilder: SystemPromptBuilder;
  private readonly maxIterations: number;
  private readonly conversation = new ConversationState();
  private abortController?: AbortController;

  constructor(options: AgentEngineOptions) {
    this.provider = options.provider;
    this.registry = options.registry;
    this.promptBuilder = options.promptBuilder ?? new SystemPromptBuilder();
    this.maxIterations = options.maxIterations ?? 20; //temp number
  }

  run(prompt: string): AsyncIterable<AgentEngineEvent> {
    this.abortController = new AbortController();

    return runAgentEngineLoop({
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
  
  getConversationMetadata(): Readonly<ConversationMetadata> {
    return this.conversation.getMetadata();
  }
}
