# Z

Z is a TypeScript agent built on Bun. The codebase is split into
agent runtime, provider, and terminal UI packages. It provides an interactive
terminal agent that streams model output, executes tool calls, keeps
session-backed history, and talks to OpenRouter through the OpenAI-compatible
chat completions API.

The current CLI is wired to `moonshotai/kimi-k2.6` and exposes four local tools:

- `list_files` lists immediate children of a workspace directory.
- `read_file` reads UTF-8 files after workspace and size checks.
- `grep` searches text files recursively inside the workspace.
- `bash` runs shell commands in the project directory with basic guardrails,
  timeouts, abort handling, and output truncation.

### Note

- **The project is currently in pre-alpha and will change significantly**.
- Z is a general-purpose agent framework. It can be used for coding workflows,
  but coding-specific behavior is not the core product goal.

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
bun z-tui/src/cli.ts
```

Inside the shell:

- `/help` shows available commands.
- `/clear` clears the terminal canvas.
- `/exit` or `/quit` closes the session.
- `Ctrl-C` aborts an active agent run. Press it again while idle to exit.

The package also declares a `z-agent` binary at `z-tui/src/cli.ts` for local
bin-based usage.

## Project Structure

```text
z-Agent/src/
  agent.ts        Stateful AgentEngine wrapper.
  loop.ts         Agent loop, streaming, tool execution, and lifecycle events.
  budget.ts       Iteration budget helpers.
  create-cli.ts   CLI runtime wiring.
  index.ts        Package exports.
  types.ts        Shared agent runtime types.
  harness/
    context-builder.ts     Provider context reconstruction from session history.
    conversation-state.ts  Append-only conversation state.
    harness.ts            Prompt and tool harness setup.
    system_prompt.ts      Default system prompt.
    types.ts              Session, turn, and conversation entry types.
    session/              In-memory and JSONL session store adapters.
    tools/                Built-in tool definitions, validation, registry, executor.
  workspace/
    workspace.ts  Workspace path safety and skip rules.

z-ai/src/
  provider.ts     Provider interface.
  types.ts        Provider messages, stream events, and tool-call types.
  tool-arguments.ts Tool-call argument parsing and validation.
  openrouter.ts   OpenRouter provider adapter.
  openrouter/     OpenRouter conversion and tool-call buffering.

z-tui/src/
  cli.ts          Interactive terminal harness.
  terminal-renderer.ts Terminal renderer for agent events.

z-Agent/test/     Agent runtime, tools, session, and loop coverage.
z-ai/test/        Provider conversion and OpenRouter coverage.
z-ai/Docs/        Provider notes and task tracking.
z-Agent/src/Docs/ Agent runtime notes and task tracking.
```

## Runtime Flow

1. The CLI creates a workspace rooted at `process.cwd()`.
2. Built-in tools are registered in a `ToolRegistry`.
3. `AgentEngine` owns the provider, registry, prompt builder, cancellation, and
   `ConversationState`.
4. `runAgentLoop` starts a run and turn, appends the user entry, builds provider
   context, and streams from the provider.
5. Assistant messages and tool results are appended as ordered
   `ConversationEntry` records with `sessionId`, `runId`, `turnId`, and
   `entryId`.
6. Tool calls are executed through `ToolExecutor`; tool result entries link back
   to the assistant entry that requested them.
7. The turn is completed, failed, or aborted, and lifecycle events are emitted
   with stable session/run/turn identifiers.

## Session History

`ConversationState` is backed by append-only session history rather than a raw
message array. The stored history is the source of truth; provider messages are
derived through a `ContextBuilder`.

Current session primitives:

- `SessionMetadata` identifies the long-lived conversation.
- `TurnMetadata` tracks active, completed, failed, and aborted turns.
- `ConversationEntry` stores ordered user, assistant, and tool-result messages.
- `DefaultContextBuilder` rebuilds provider messages in sequence order.
- `InMemorySessionStore` and `JsonlSessionStore` provide session persistence
  adapters.

## Development

Run focused tests with Vitest:

```sh
bunx vitest --run z-Agent/test/session-store.test.ts
```

The current test coverage includes:

- iteration budgeting
- prompt building
- tool registration and validation
- built-in file tools
- bash command execution
- OpenRouter message and tool conversion
- streamed tool-call buffering
- session snapshots and context rebuilding
- in-memory and JSONL session stores
- agent loop lifecycle events, errors, aborts, and budget exhaustion

## Configuration

`OPENROUTER_API_KEY` is required at runtime. The OpenRouter base URL defaults to
`https://openrouter.ai/api/v1`.

The default model and iteration limit are currently configured in
`z-tui/src/cli.ts`.
