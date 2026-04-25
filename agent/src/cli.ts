import { OpenRouterProvider } from "./ai/openrouter";

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