import type { JsonObject, Tool, ToolDefinition } from "./types";

type RegisteredTool = Tool<JsonObject>;

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register<TArgs extends JsonObject>(tool: Tool<TArgs>): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }

    this.tools.set(tool.definition.name, tool as RegisteredTool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }
}
