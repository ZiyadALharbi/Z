import { OpenRouterProvider } from "./ai/openrouter";
import { createListFilesTool } from "./tools/list-files";
import { ToolRegistry } from "./registry";
import { createReadFileTool } from "./tools/read-file";
import { createGrepTool } from "./tools/grep";

const registry = new ToolRegistry();

registry.register(createListFilesTool({ cwd: process.cwd() }));
registry.register(createReadFileTool({ cwd: process.cwd() }));
registry.register(createGrepTool({ cwd: process.cwd() }));

const provider = new OpenRouterProvider({
    model: "moonshotai/kimi-k2.6",
    // model: "deepseek/deepseek-v4-flash",
    // model: "meta-llama/llama-3.1-8b-instruct:free",
  });
  
  const events = provider.stream({
    systemPrompt: "You are a concise assistant.",
    messages: [
      {
        role: "user",
        content: process.argv.slice(2).join(" "),
      },
    ],
    tools: [],
  });
  
  for await (const event of events) {
    if (event.type === "text_delta") {
      process.stdout.write(event.text);
    }
  
    if (event.type === "error") {
      console.error(event.message);
    }
  }