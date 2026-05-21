#!/usr/bin/env bun

/*
CLI Harness

Owns the interactive readline loop, slash commands, and cancellation. Agent
construction and terminal rendering live in focused CLI modules.
*/

import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createCli } from "../../z-Agent/src/create-cli";
import { TerminalRenderer } from "./terminal-renderer";

const model = "moonshotai/kimi-k2.6";
const maxIterations = 20;
const cwd = process.cwd();

const { cli } = createCli({
  model,
  maxIterations,
  cwd,
});

const renderer = new TerminalRenderer({
  model,
  maxIterations,
  cwd,
});

const rl = createInterface({ input, output });
let isRunning = false;

process.on("SIGINT", () => {
  if (isRunning) {
    cli.abort();
    return;
  }

  renderer.goodbye();
  rl.close();
  process.exit(0);
});

renderer.renderShell();

while (true) {
  const prompt = (await rl.question(renderer.promptLabel())).trim();

  if (prompt === "/exit" || prompt === "/quit") {
    break;
  }

  if (prompt === "/help") {
    renderer.renderHelp();
    continue;
  }

  if (prompt === "/clear") {
    renderer.clear();
    renderer.renderShell();
    continue;
  }

  if (prompt.length === 0) {
    continue;
  }

  await runPrompt(prompt);
}

rl.close();
renderer.sessionClosed();

async function runPrompt(prompt: string): Promise<void> {
  const stats = renderer.createRunStats();
  isRunning = true;
  renderer.renderUserPrompt(prompt);

  try {
    for await (const event of cli.run(prompt)) {
      renderer.renderEvent(event, stats);
    }
  } finally {
    isRunning = false;
  }
}
