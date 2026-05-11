#!/usr/bin/env bun

/*
CLI Harness

Owns the interactive readline loop, slash commands, and cancellation. Engine
construction and terminal rendering live in focused CLI modules.
*/

import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createCliEngine } from "./create-engine";
import { TerminalRenderer } from "./terminal-renderer";

const model = "moonshotai/kimi-k2.6";
const maxIterations = 8;
const cwd = process.cwd();

const { engine } = createCliEngine({
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
    engine.abort();
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
    for await (const event of engine.run(prompt)) {
      renderer.renderEvent(event, stats);
    }
  } finally {
    isRunning = false;
  }
}
