
/*
Conversation State

Owns the Message Array and metadata for a single AgentEngine conversation.
The AgentEngine Loop appends messages through this Module instead of mutating
a raw array directly.
*/

import type { Message } from "../types";

export type ConversationMetadata = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationStateOptions = {
  id?: string;
  initialMessages?: Message[];
  createdAt?: Date;
};

export class ConversationState {
  private readonly messages: Message[];
  private readonly metadata: ConversationMetadata;

  constructor(options: ConversationStateOptions = {}) {
    const createdAt = options.createdAt ?? new Date();

    this.messages = [...(options.initialMessages ?? [])];
    this.metadata = {
      id: options.id ?? crypto.randomUUID(),
      createdAt,
      updatedAt: createdAt,
    };
  }

  append(message: Message): void {
    this.messages.push(message);
    this.metadata.updatedAt = new Date();
  }

  snapshot(): readonly Message[] {
    return this.messages;
  }

  // getProviderMessages() is intentionally separate from getMessages().
  // It signals that provider calls get a mutable copy, while regular callers get read-only access.
  getProviderMessages(): Message[] {
    return [...this.messages];
  }

  getMetadata(): Readonly<ConversationMetadata> {
    return this.metadata;
  }
}




