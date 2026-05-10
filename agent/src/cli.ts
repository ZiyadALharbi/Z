#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OpenRouterProvider } from "./ai/openrouter";
import { AgentEngine } from "./engine/agent-engine";
import { ToolRegistry } from "./registry";
import { createBashTool } from "./tools/bash";
import { createGrepTool } from "./tools/grep";
import { createListFilesTool } from "./tools/list-files";
import { createReadFileTool } from "./tools/read-file";

const model = "moonshotai/kimi-k2.6";

const registry = new ToolRegistry();
registry.register(createListFilesTool({ cwd: process.cwd() }));
registry.register(createReadFileTool({ cwd: process.cwd() }));
registry.register(createGrepTool({ cwd: process.cwd() }));
registry.register(createBashTool({ cwd: process.cwd() }));

const provider = new OpenRouterProvider({ model });

const engine = new AgentEngine({
  provider,
  registry,
  maxIterations: 8,
});

process.on("SIGINT", () => {
  engine.abort();
});

const rl = createInterface({ input, output });

console.log("Z AgentEngine");
console.log(`model: ${model}`);
console.log(`cwd: ${process.cwd()}`);
console.log('Type /exit to quit.\n');

while (true) {
  const prompt = (await rl.question("> ")).trim();

  if (prompt === "/exit" || prompt === "/quit") {
    break;
  }

  if (prompt.length === 0) {
    continue;
  }

  for await (const event of engine.run(prompt)) {
    if (event.type === "text") {
      process.stdout.write(event.text);
    }

    if (event.type === "tool_started") {
      process.stderr.write(`\n[tool] ${event.toolCall.name}\n`);
    }

    if (event.type === "tool_finished") {
      const status = event.result.isError ? "error" : "ok";
      process.stderr.write(`[tool:${status}] ${event.result.toolName}\n`);
    }

    if (event.type === "error") {
      process.stderr.write(`\n[error] ${event.message}\n`);
    }

    if (event.type === "run_finished") {
      process.stderr.write(`\n[done] ${event.stopReason}\n\n`);
    }
  }
}

rl.close();


// import { OpenRouterProvider } from "./ai/openrouter";
// import { AgentEngine } from "./engine/agent-engine";
// import { ToolRegistry } from "./registry";
// import { createBashTool } from "./tools/bash";
// import { createGrepTool } from "./tools/grep";
// import { createListFilesTool } from "./tools/list-files";
// import { createReadFileTool } from "./tools/read-file";

// const prompt = process.argv.slice(2).join(" ").trim();

// if (prompt.length === 0) {
//   console.error('Usage: bun run agent/src/cli.ts "your prompt"');
//   process.exit(1);
// }

// const registry = new ToolRegistry();

// registry.register(createListFilesTool({ cwd: process.cwd() }));
// registry.register(createReadFileTool({ cwd: process.cwd() }));
// registry.register(createGrepTool({ cwd: process.cwd() }));
// registry.register(createBashTool({ cwd: process.cwd() }));

// const provider = new OpenRouterProvider({
//   model: "moonshotai/kimi-k2.6",
// });

// const engine = new AgentEngine({
//   provider,
//   registry,
//   maxIterations: 8,
// });

// process.on("SIGINT", () => {
//   engine.abort();
// });

// for await (const event of engine.run(prompt)) {
//   if (event.type === "text") {
//     process.stdout.write(event.text);
//   }

//   if (event.type === "tool_started") {
//     process.stderr.write(`\n[tool] ${event.toolCall.name}\n`);
//   }

//   if (event.type === "tool_finished") {
//     const status = event.result.isError ? "error" : "ok";
//     process.stderr.write(`[tool:${status}] ${event.result.toolName}\n`);
//   }

//   if (event.type === "error") {
//     process.stderr.write(`\n[error] ${event.message}\n`);
//   }

//   if (event.type === "run_finished") {
//     process.stderr.write(`\n[done] ${event.stopReason}\n`);
//   }
// }