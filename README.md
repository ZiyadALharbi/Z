```
                              ███████╗
                              ╚══███╔╝
                                ███╔╝
                               ███╔╝
                              ███████╗
                              ╚══════╝
              a coding agent, built from three clean layers
```
> <span style="color: yellow;">**Pre-alpha.** Being rebuilt from scratch. Everything here will change.</span>

> **Pre-alpha.** Being rebuilt from scratch. Everything here will change.

Z is a coding agent split into three independent layers. Each layer knows only
about the one below it, so any piece can be swapped, tested, or reused on its own.

## Architecture

```diagram
╭──────────────────────────────────────────────────────────╮
│  z-coding      the application                            │
│  tools (read/write/edit/bash), sessions, compaction,      │
│  skills, system-prompt assembly, provider management      │
╰───────────────────────────┬──────────────────────────────╯
                            │ uses
╭───────────────────────────▼──────────────────────────────╮
│  z-agent       the brain                                  │
│  conversation loop: send → stream → run tools → feed back │
│  emits events. no CLI, UI, or app knowledge.              │
╰───────────────────────────┬──────────────────────────────╯
                            │ uses
╭───────────────────────────▼──────────────────────────────╮
│  z-ai          the transport                              │
│  provider-neutral request  →  provider API call           │
│  (OpenAI, Anthropic, ...)  →  streamed events             │
╰──────────────────────────────────────────────────────────╯
```

### z-ai — provider streaming layer

Stateless and provider-agnostic. It takes a provider-neutral request, calls a
specific provider, and yields a standard event stream. Nothing above it needs to
know which provider is in use.

- **Provider interface** — one structural contract (`streamResponse`); any object
  of the right shape qualifies, no inheritance.
- **Adapters** — one per provider. Translate internal messages/tools into the SDK
  request, parse the streamed response back into standard events, assemble tool
  calls from fragments, and absorb provider quirks (OpenAI `reasoning_content`,
  Anthropic `thinking_delta`, Codex composite tool-call IDs).
- **Config** — frozen per-provider settings (api key, base url, timeout, retries)
  and an injected async credential resolver for OAuth.
- **Reliability** — retry with backoff, cancellation, and resource cleanup.
- **Test provider** — a scripted fake for deterministic tests, no network.

### z-agent — the agent brain

The reusable loop: send messages to a model, stream the response, execute the
requested tools, feed results back, repeat, and emit events throughout. It is
completely unaware of the CLI, the UI, or any application feature.

### z-coding — the application

Everything that makes the brain useful for software work: concrete tools
(read, write, edit, bash), session persistence, context compaction, skills,
system-prompt assembly, and provider management.
