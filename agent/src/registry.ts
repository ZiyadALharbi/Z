import type { Tool, ToolDefinition } from "./types";

export class ToolRegistry {
    private tools = new Map<string, Tool>();

    register(tool: Tool): void {
        if(this.tools.has(tool.definition.name)){
            throw new Error(`Tool already registered: ${tool.definition.name}`);
        }
        this.tools.set(tool.definition.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name)
    }

    getDefinitions(): ToolDefinition[] {
        return [...this.tools.values()].map(tool => tool.definition);
    }
}