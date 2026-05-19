import type { ConversationEntry } from "./types";
import type { Message } from "../types";

export interface ContextBuilder {
  buildProviderMessages(entries: readonly ConversationEntry[]): Message[];
}

export class DefaultContextBuilder implements ContextBuilder {
  buildProviderMessages(entries: readonly ConversationEntry[]): Message[] {
    return [...entries]
      .sort((first, second) => first.sequence - second.sequence)
      .map((entry) => entry.message);
  }
}
