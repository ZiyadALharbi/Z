/*
The tool should:

Accept { path: string }
Resolve relative paths from a configured cwd
List immediate children only for now
Return a string the model can read
Respect AbortSignal
Avoid recursive listing in Phase 1
*/

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, Tool } from "../types";

export type ListFilesToolOptions = {
  cwd: string;
};

export function createListFilesTool(options: ListFilesToolOptions): Tool {
  return {
    definition: {
      name: "list_files",
      description: "List files and directories at a given path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list. Relative paths are resolved from the current working directory.",
          },
        },
        required: ["path"],
      },
    },

    handler: async (args, signal) => {
      throwIfAborted(signal);

      const targetPath = getStringArg(args, "path");
      const absolutePath = path.resolve(options.cwd, targetPath);

      const entries = await readdir(absolutePath, { withFileTypes: true });

      throwIfAborted(signal);

      if (entries.length === 0) {
        return "Directory is empty.";
      }

      return entries
        .map((entry) => {
          const suffix = entry.isDirectory() ? "/" : "";
          return `${entry.name}${suffix}`;
        })
        .sort()
        .join("\n");
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