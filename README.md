# Z

Z is a small TypeScript coding-agent runtime built on Bun. It provides an
interactive terminal agent that streams model output, executes tool calls, keeps
conversation state, and talks to OpenRouter through the OpenAI-compatible chat
completions API.

The current CLI is wired to `moonshotai/kimi-k2.6` and exposes four local tools:

- `list_files` lists immediate children of a workspace directory.
- `read_file` reads UTF-8 files after workspace and size checks.
- `grep` searches text files recursively inside the workspace.
- `bash` runs shell commands in the project directory with basic guardrails,
  timeouts, abort handling, and output truncation.

### Note:
- **The project is currently in pre-alpha and will change significantly**.

## Requirements

- Bun
- An OpenRouter API key

## Setup

Install dependencies:

```sh
bun install
```

Set the OpenRouter API key:

```sh
export OPENROUTER_API_KEY="..."
```

## Run The CLI

Start the interactive shell from the project root:

```sh
bun agent/src/cli/cli.ts
```

Inside the shell:

- `/help` shows available commands.
- `/clear` clears the terminal canvas.
- `/exit` or `/quit` closes the session.
- `Ctrl-C` aborts an active agent run. Press it again while idle to exit.

The package also declares a `z-agent` binary at `agent/src/cli/cli.ts` for local
bin-based usage.

## Project Structure

```text
agent/src/
  ai/             Provider interface, OpenRouter adapter, stream conversion.
  cli/            Interactive terminal harness and renderer.
  engine/         Agent loop, conversation state, events, cancellation.
  prompt/         System prompt builder.
  tools/          Built-in tool definitions and execution.
  workspace/      Workspace path safety and skip rules.
  budget.ts       Iteration budget.
  registry.ts     Tool registry.
  types.ts        Shared message, tool, and JSON types.

agent/tests/      Bun test coverage for the runtime, tools, and provider glue.
```

## Runtime Flow

1. The CLI creates a workspace rooted at `process.cwd()`.
2. Built-in tools are registered in a `ToolRegistry`.
3. `OpenRouterProvider` streams assistant deltas and tool-call deltas.
4. `runAgentLoop` appends messages to `ConversationState`.
5. Tool calls are executed through `ToolExecutor`.
6. Tool results are appended and sent back to the provider until the model stops,
   the run is aborted, an error occurs, or the iteration budget is exhausted.

## Development

Run the test script:

```sh
bun run test
```

The test suite uses Bun's test runner and covers:

- iteration budgeting
- prompt building
- tool registration and validation
- built-in file tools
- bash command execution
- OpenRouter message and tool conversion
- streamed tool-call buffering
- agent loop events, errors, aborts, and budget exhaustion

## Configuration

`OPENROUTER_API_KEY` is required at runtime. The OpenRouter base URL defaults to
`https://openrouter.ai/api/v1`.

The default model and iteration limit are currently configured in
`agent/src/cli/cli.ts`.
