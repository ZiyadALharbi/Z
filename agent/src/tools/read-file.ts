/*
The tool should:

Accept { path: string }
Resolve relative paths from cwd
Read UTF-8 text files
Reject directories
Return file contents as a string
Respect AbortSignal
*/

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, Tool } from "../types";

export type ReadFileToolOptions = {
  cwd: string;
  maxBytes?: number;
};

const DEFAULT_MAX_BYTES = 200_000;

export function createReadFileTool(options: ReadFileToolOptions): Tool {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  return {
    definition: {
      name: "read_file",
      description: "Read a UTF-8 text file and return its contents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read. Relative paths are resolved from the current working directory.",
          },
        },
        required: ["path"],
      },
    },

    handler: async (args, signal) => {
      throwIfAborted(signal);

      const targetPath = getStringArg(args, "path");
      const absolutePath = path.resolve(options.cwd, targetPath);

      const fileStat = await stat(absolutePath);

      if (fileStat.isDirectory()) {
        throw new Error(`Path is a directory: ${targetPath}`);
      }

      if (fileStat.size > maxBytes) {
        throw new Error(
          `File is too large: ${fileStat.size} bytes. Max allowed is ${maxBytes} bytes.`,
        );
      }

      throwIfAborted(signal);

      return await readFile(absolutePath, "utf8");
    },
  };
}

function getStringArg(args: JsonObject, key: string): string {
  const value = args[key];

  if (typeof value !== "string") {
    throw new Error(`Expected "${key}" to be a string`);
  }

  return value;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}