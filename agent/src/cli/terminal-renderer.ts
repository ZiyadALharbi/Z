/*
Terminal Renderer

Renders AgentEngine events and CLI chrome. It owns ANSI formatting, markdown-ish
line styling, and per-run display stats.
*/

import type { AgentEngineEvent } from "../engine/events";

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  border: "\x1b[38;5;63m",
  accent: "\x1b[38;5;81m",
  accentAlt: "\x1b[38;5;213m",
};

export type RunStats = {
  startedAt: number;
  iteration: number;
  remainingIterations: number;
  toolCount: number;
  textStarted: boolean;
  assistantLineBuffer: string;
};

export type TerminalRendererOptions = {
  model: string;
  cwd: string;
  maxIterations: number;
};

export class TerminalRenderer {
  constructor(private readonly options: TerminalRendererOptions) {}

  createRunStats(): RunStats {
    return {
      startedAt: Date.now(),
      iteration: 0,
      remainingIterations: this.options.maxIterations,
      toolCount: 0,
      textStarted: false,
      assistantLineBuffer: "",
    };
  }

  renderShell(): void {
    const width = getWidth();
    const title = "Z AgentEngine";
    const rule = "─".repeat(Math.max(12, width - 2));

    writeLine(`${ansi.border}╭${rule}╮${ansi.reset}`);
    writeLine(
      `${ansi.border}│${ansi.reset} ${ansi.bold}${ansi.accent}${title}${ansi.reset}${pad(
        width - title.length - 3,
      )}${ansi.border}│${ansi.reset}`,
    );
    writeLine(`${ansi.border}├${rule}┤${ansi.reset}`);
    writeLine(row("model", this.options.model));
    writeLine(row("cwd", this.options.cwd));
    writeLine(row("tools", "list-files · read-file · grep · bash"));
    writeLine(`${ansi.border}╰${rule}╯${ansi.reset}`);
    writeLine(
      `${ansi.dim}Commands: /help  /clear  /exit. Press Ctrl-C during a run to abort.${ansi.reset}\n`,
    );
  }

  renderHelp(): void {
    renderPanel(
      "help",
      [
        "/help   show this menu",
        "/clear  reset the terminal canvas",
        "/exit   close the session",
        "Ask naturally; the agent streams text and shows tool activity inline.",
      ].join("\n"),
      ansi.cyan,
    );
    writeLine("");
  }

  renderUserPrompt(prompt: string): void {
    writeLine("");
    renderPanel("you", prompt, ansi.accent);
  }

  renderEvent(event: AgentEngineEvent, stats: RunStats): void {
    if (event.type === "run_started") {
      renderStatus("thinking", "run started");
      return;
    }

    if (event.type === "iteration_started") {
      stats.iteration = event.iteration;
      stats.remainingIterations = event.remainingIterations;
      renderStatus(
        "thinking",
        `iteration ${event.iteration} / ${this.options.maxIterations}`,
      );
      return;
    }

    if (event.type === "text") {
      if (!stats.textStarted) {
        stats.textStarted = true;
        writeLine(`\n${ansi.accentAlt}${ansi.bold}assistant${ansi.reset}`);
      }

      renderAssistantText(event.text, stats);
      return;
    }

    if (event.type === "tool_started") {
      flushAssistantText(stats);
      stats.toolCount += 1;
      writeLine("");
      renderToolStart(event.toolCall.name, stats.toolCount);
      renderToolArgs(event.toolCall.arguments);
      return;
    }

    if (event.type === "tool_finished") {
      renderToolFinish(event.result.toolName, event.result.isError);
      return;
    }

    if (event.type === "error") {
      flushAssistantText(stats);
      writeLine("");
      renderPanel("error", event.message, ansi.red);
      return;
    }

    if (event.type === "run_finished") {
      flushAssistantText(stats);
      const elapsed = formatElapsed(Date.now() - stats.startedAt);
      const tone = event.stopReason === "stop" ? ansi.green : ansi.yellow;

      writeLine("");
      renderPanel(
        "done",
        `${event.stopReason} in ${elapsed} · ${stats.toolCount} tools · ${stats.iteration} iterations`,
        tone,
      );
      writeLine("");
    }
  }

  promptLabel(): string {
    return `${ansi.bold}${ansi.accent}z${ansi.reset} ${ansi.dim}›${ansi.reset} `;
  }

  clear(): void {
    process.stdout.write("\x1b[2J\x1b[H");
  }

  goodbye(): void {
    writeLine(`\n${ansi.dim}bye.${ansi.reset}`);
  }

  sessionClosed(): void {
    writeLine(`${ansi.dim}session closed.${ansi.reset}`);
  }
}

function renderAssistantText(text: string, stats: RunStats): void {
  stats.assistantLineBuffer += text;

  while (stats.assistantLineBuffer.includes("\n")) {
    const newlineIndex = stats.assistantLineBuffer.indexOf("\n");
    const line = stats.assistantLineBuffer.slice(0, newlineIndex);
    stats.assistantLineBuffer = stats.assistantLineBuffer.slice(newlineIndex + 1);
    writeLine(renderMarkdownLine(line));
  }
}

function flushAssistantText(stats: RunStats): void {
  if (stats.assistantLineBuffer.length === 0) {
    return;
  }

  process.stdout.write(renderMarkdownLine(stats.assistantLineBuffer));
  stats.assistantLineBuffer = "";
}

function renderMarkdownLine(line: string): string {
  if (line.startsWith("### ")) {
    return `\n${ansi.bold}${ansi.accent}${renderMarkdownInline(line.slice(4))}${ansi.reset}`;
  }

  if (line.startsWith("## ")) {
    return `\n${ansi.bold}${ansi.accent}${renderMarkdownInline(line.slice(3))}${ansi.reset}`;
  }

  if (line.startsWith("# ")) {
    return `\n${ansi.bold}${ansi.accentAlt}${renderMarkdownInline(line.slice(2))}${ansi.reset}`;
  }

  if (line.startsWith("- ")) {
    return `${ansi.dim}•${ansi.reset} ${renderMarkdownInline(line.slice(2))}`;
  }

  const numberedListItem = line.match(/^(\d+)\.\s+(.*)$/);

  if (numberedListItem) {
    const [, number, content] = numberedListItem;
    return `${ansi.dim}${number}.${ansi.reset} ${renderMarkdownInline(content ?? "")}`;
  }

  return renderMarkdownInline(line);
}

function renderMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, `${ansi.bold}$1${ansi.reset}`)
    .replace(/`([^`]+)`/g, `${ansi.cyan}$1${ansi.reset}`);
}

function renderStatus(label: string, message: string): void {
  writeLine(`${ansi.gray}${spinner()} ${label}${ansi.reset} ${ansi.dim}${message}${ansi.reset}`);
}

function renderToolStart(name: string, count: number): void {
  writeLine(
    `${ansi.magenta}${ansi.bold}tool ${count}${ansi.reset} ${ansi.white}${name}${ansi.reset}`,
  );
}

function renderToolArgs(args: Record<string, unknown>): void {
  const entries = Object.entries(args);

  if (entries.length === 0) {
    return;
  }

  for (const [key, value] of entries) {
    writeLine(
      `${ansi.gray}  ${key}:${ansi.reset} ${ansi.dim}${truncate(formatValue(value), 120)}${ansi.reset}`,
    );
  }
}

function renderToolFinish(name: string, isError: boolean): void {
  const color = isError ? ansi.red : ansi.green;
  const status = isError ? "failed" : "finished";
  writeLine(`${color}  ${status}${ansi.reset} ${ansi.dim}${name}${ansi.reset}`);
}

function renderPanel(title: string, body: string, color: string): void {
  const width = Math.min(getWidth(), 96);
  const innerWidth = width - 4;
  const lines = wrap(body, innerWidth);
  const top = `╭─ ${title} ${"─".repeat(Math.max(1, innerWidth - title.length - 1))}╮`;
  const bottom = `╰${"─".repeat(width - 2)}╯`;

  writeLine(`${color}${top}${ansi.reset}`);
  for (const line of lines) {
    writeLine(`${color}│${ansi.reset} ${line}${pad(innerWidth - visibleLength(line))} ${color}│${ansi.reset}`);
  }
  writeLine(`${color}${bottom}${ansi.reset}`);
}

function row(label: string, value: string): string {
  const width = getWidth();
  const left = ` ${ansi.dim}${label.padEnd(7)}${ansi.reset} ${value}`;
  return `${ansi.border}│${ansi.reset}${left}${pad(width - visibleLength(stripAnsi(left)) - 1)}${ansi.border}│${ansi.reset}`;
}

function spinner(): string {
  const frames = ["◐", "◓", "◑", "◒"] as const;
  return frames[Math.floor(Date.now() / 120) % frames.length] ?? "◐";
}

function writeLine(value: string): void {
  process.stdout.write(`${value}\n`);
}

function getWidth(): number {
  return Math.min(Math.max(process.stdout.columns ?? 84, 56), 120);
}

function pad(count: number): string {
  return " ".repeat(Math.max(0, count));
}

function formatElapsed(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function wrap(value: string, width: number): string[] {
  const sourceLines = value.split("\n");
  const lines: string[] = [];

  for (const sourceLine of sourceLines) {
    let remaining = sourceLine;

    if (remaining.length === 0) {
      lines.push("");
      continue;
    }

    while (visibleLength(remaining) > width) {
      let sliceAt = remaining.lastIndexOf(" ", width);

      if (sliceAt <= 0) {
        sliceAt = width;
      }

      lines.push(remaining.slice(0, sliceAt));
      remaining = remaining.slice(sliceAt).trimStart();
    }

    lines.push(remaining);
  }

  return lines;
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
