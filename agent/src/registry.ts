export type ToolDefinition = {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    }
}

export type ToolHandler = (args: unknown, signal?: AbortSignal) => Promise<string>;

export type Tool = {
    definition: ToolDefinition;
    handler: ToolHandler;
}

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