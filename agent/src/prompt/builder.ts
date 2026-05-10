import type { ToolDefinition } from "../types";

export type SystemPromptBuilderOptions = {
  identity?: string;
  rules?: string[];
};

const DEFAULT_IDENTITY =
  "You are a concise coding agent. You help inspect and modify software projects by using the tools available to you.";
const DEFAULT_RULES = [
  "Use tools when you need information from the local environment.",
  "Do not guess file contents. Read files before describing their implementation.",
  "When you call a tool, use the exact schema provided.",
  "After receiving tool results, continue the task using the new information.",
  "If you cannot complete a task, explain what blocked you clearly.",
];

export class SystemPromptBuilder {
    private readonly identity: string;
    private readonly rules: string[];

    constructor(options: SystemPromptBuilderOptions = {}) {
        this.identity = options.identity ?? DEFAULT_IDENTITY;
        this.rules = options.rules ?? DEFAULT_RULES;
    }

    build(tools: ToolDefinition[]): string {
        const sections = [
            this.buildIdentitySection(),
            this.buildRulesSection(),
            this.buildToolsSection(tools),
        ];

        return sections.filter(Boolean).join("\n\n");
    }

    private buildIdentitySection(): string {
        return this.identity;
    }

    private buildRulesSection(): string {
        return [
            "## Rules",
            ...this.rules.map((rule) => `- ${rule}`),
          ].join("\n");
    }

    private buildToolsSection(tools: ToolDefinition[]): string {
        if (tools.length === 0) {
            return "## Tools\nNo tools are currently available.";
          }
        
          return [
            "## Tools",
            "You may call these tools when needed:",
            ...tools.map(formatToolDefinition),
        ].join("\n\n");
    }     
}

function formatToolDefinition(tool: ToolDefinition): string {
    return [
        `### ${tool.name}`,
        tool.description,
        "",
        "Parameters:",
        "```json",
        JSON.stringify(tool.parameters, null, 2),
        "```",
      ].join("\n");
}