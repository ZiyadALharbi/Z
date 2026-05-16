/*
CLI Engine Factory

Builds the runtime AgentEngine used by the CLI harness. This keeps provider,
workspace, and tool wiring out of the interactive prompt loop.
*/

import { OpenRouterProvider } from "../ai/openrouter";
import { AgentEngine } from "../engine/agent-engine";
import { ToolRegistry } from "../registry";
import { BashTool } from "../tools/bash";
import { GrepTool } from "../tools/grep";
import { ListFilesTool } from "../tools/list-files";
import { ReadFileTool } from "../tools/read-file";
import { Workspace } from "../workspace/workspace";

export type CliEngineConfig = {
  model: string;
  maxIterations: number;
  cwd: string;
};

export type CliEngineRuntime = {
  engine: AgentEngine;
  workspace: Workspace;
};

export function createCliEngine(config: CliEngineConfig): CliEngineRuntime {
  const workspace = new Workspace({ root: config.cwd });
  const registry = new ToolRegistry();

  registry.register(ListFilesTool({ workspace }));
  registry.register(ReadFileTool({ workspace }));
  registry.register(GrepTool({ workspace }));

  // Bash is still command execution specific, but shares the workspace root.
  registry.register(BashTool({ cwd: workspace.root }));

  const provider = new OpenRouterProvider({ model: config.model });
  const engine = new AgentEngine({
    provider,
    registry,
    maxIterations: config.maxIterations,
  });

  return { engine, workspace };
}
