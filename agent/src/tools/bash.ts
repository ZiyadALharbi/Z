import { spawn } from "node:child_process";
import type { JsonObject, Tool } from "../types";

export type BashToolOptions = {
  cwd: string;
  // mode?: BashToolMode;
  maxTimeoutMs?: number;
  defaultTimeoutMs?: number;
  maxOutputLength?: number;
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 30_000;

type BashArgs = JsonObject & {
  command: string;
  timeoutMs: number;
};

function parseBashArgs(
  args: JsonObject,
  defaultTimeoutMs: number,
  maxTimeoutMs: number,
): BashArgs {
  const command = getStringArg(args, "command");
  const requestedTimeoutMs =
    getOptionalNumberArg(args, "timeoutMs") ?? defaultTimeoutMs;

  if (requestedTimeoutMs < 1) {
    throw new Error("timeoutMs must be at least 1");
  }

  validateCommand(command);

  return {
    command,
    timeoutMs: Math.min(requestedTimeoutMs, maxTimeoutMs),
  };
}
export function BashTool(options: BashToolOptions): Tool<BashArgs> {
  const maxTimeoutMs = options.maxTimeoutMs ?? MAX_TIMEOUT_MS;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputLength = options.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

  return {
    definition: {
      name: "bash",
      description:
        "Run a shell command in the project directory and return stdout, stderr, and exit code.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to run.",
          },
          timeoutMs: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
        required: ["command"],
      },
    },

    parseArgs: (args) => parseBashArgs(args, defaultTimeoutMs, maxTimeoutMs),

    handler: async (args, signal) => {
      const result = await runCommand({
        command: args.command,
        cwd: options.cwd,
        timeoutMs: args.timeoutMs,
        signal,
        env: options.env,
      });

      return truncate(formatBashResult(result), maxOutputLength);
    },
  };
}

// RUNNER FUNCTIONS

type RunCommandOptions = {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

type BashResult = {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
};

function runCommand(options: RunCommandOptions): Promise<BashResult> {
  return new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve({
        command: options.command,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "Command aborted before start.",
        timedOut: false,
        aborted: true,
      });
      return;
    }

    const child = spawn(options.command, {
      cwd: options.cwd,
      shell: true,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1_000);
    }, options.timeoutMs);

    const abortHandler = () => {
      aborted = true;
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1_000);
    };

    options.signal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      stderr += error.message;
    });

    child.on("close", (exitCode, signal) => {
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);

      resolve({
        command: options.command,
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        aborted,
      });
    });
  });
}

// FORMATTING

function formatBashResult(result: BashResult): string {
  const status = [
    `Command: ${result.command}`,
    `Exit code: ${result.exitCode ?? "null"}`,
    result.signal ? `Signal: ${result.signal}` : undefined,
    result.timedOut ? "Timed out: true" : undefined,
    result.aborted ? "Aborted: true" : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    status,
    "",
    "STDOUT:",
    result.stdout.trimEnd() || "(empty)",
    "",
    "STDERR:",
    result.stderr.trimEnd() || "(empty)",
  ].join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[Command output truncated]`;
}

// ARGUMENT HELPERS
function getStringArg(args: JsonObject, key: string): string {
  const value = args[key];

  if (typeof value !== "string") {
    throw new Error(`Expected "${key}" to be a string`);
  }

  return value;
}

function getOptionalNumberArg(
  args: JsonObject,
  key: string,
): number | undefined {
  const value = args[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error(`Expected "${key}" to be a number`);
  }

  return value;
}

// Basic Command Guard
// This is not a full sandbox, but it prevents obvious disasters:
function validateCommand(command: string): void {
  const normalized = command.trim();

  if (normalized.length === 0) {
    throw new Error("Command cannot be empty");
  }

  const blockedPatterns = [
    /\brm\s+-rf\s+\//,
    /\brm\s+-rf\s+~/,
    /\bsudo\b/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    />\s*\/dev\/sd[a-z]/,
    /\bchmod\s+-R\s+777\s+\//,
    /\bchown\s+-R\b/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(normalized)) {
      throw new Error(`Blocked potentially destructive command: ${command}`);
    }
  }
}
