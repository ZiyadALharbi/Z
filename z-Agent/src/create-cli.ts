/*
CLI  Factory

Builds the runtime Agent used by the CLI harness. This keeps provider,
workspace, and tool wiring out of the interactive prompt loop.
*/

import { OpenRouterProvider } from "../../z-ai/src/openrouter";
import { Agent } from "./agent";
import { ToolRegistry } from "./harness/tools/registry";
import { BashTool } from "./harness/tools/bash";
import { GrepTool } from "./harness/tools/grep";
import { ListFilesTool } from "./harness/tools/list-files";
import { ReadFileTool } from "./harness/tools/read-file";
import { Workspace } from "./workspace/workspace";

export type CliConfig = {
  model: string;
  maxIterations: number;
  cwd: string;
};

export type CliRuntime = {
  agent: Agent;
  workspace: Workspace;
};

export function createCli(config: CliConfig): CliRuntime {
  const workspace = new Workspace({ root: config.cwd });
  const registry = new ToolRegistry();

  registry.register(ListFilesTool({ workspace }));
  registry.register(ReadFileTool({ workspace }));
  registry.register(GrepTool({ workspace }));

  // Bash is still command execution specific, but shares the workspace root.
  registry.register(BashTool({ cwd: workspace.root }));

  const provider = new OpenRouterProvider({ model: config.model });
  const agent = new Agent({
    provider,
    registry,
    maxIterations: config.maxIterations,
  });

  return { agent, workspace };
}
