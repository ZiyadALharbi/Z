/*
Grep Tool

Searches text files inside the workspace and returns matching lines.
Workspace owns path resolution, relative paths, and skip rules.
Tool helpers own argument parsing and abort checks.
*/

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../types";
import type { Workspace } from "../workspace/workspace";
import {
  optionalBoolean,
  optionalNumber,
  requireString,
  throwIfAborted,
} from "./args";

export type GrepToolOptions = {
  workspace: Workspace;
  maxFileBytes?: number;
  defaultMaxResults?: number;
};

const DEFAULT_MAX_FILE_BYTES = 200_000;
const DEFAULT_MAX_RESULTS = 100;

export function GrepTool(options: GrepToolOptions): Tool {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const defaultMaxResults = options.defaultMaxResults ?? DEFAULT_MAX_RESULTS;

  return {
    definition: {
      name: "grep",
      description:
        "Search text files under a file or directory and return matching lines.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "File or directory path to search. Relative paths are resolved from the workspace root.",
          },
          pattern: {
            type: "string",
            description: "Text or regular expression pattern to search for.",
          },
          regex: {
            type: "boolean",
            description:
              "Whether to treat pattern as a JavaScript regular expression.",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of matches to return.",
          },
        },
        required: ["path", "pattern"],
      },
    },

    handler: async (args, signal) => {
      throwIfAborted(signal);

      const targetPath = requireString(args, "path");
      const pattern = requireString(args, "pattern");
      const useRegex = optionalBoolean(args, "regex") ?? false;
      const maxResults =
        optionalNumber(args, "maxResults") ?? defaultMaxResults;

      if (maxResults < 1) {
        throw new Error("maxResults must be at least 1");
      }

      const absolutePath = options.workspace.resolveInsideRoot(targetPath);
      const matcher = createMatcher(pattern, useRegex);
      const matches: string[] = [];

      await searchPath({
        absolutePath,
        workspace: options.workspace,
        matcher,
        matches,
        maxResults,
        maxFileBytes,
        signal,
      });

      if (matches.length === 0) {
        return "No matches found.";
      }

      return matches.join("\n");
    },
  };
}

type SearchPathOptions = {
  absolutePath: string;
  workspace: Workspace;
  matcher: (line: string) => boolean;
  matches: string[];
  maxResults: number;
  maxFileBytes: number;
  signal?: AbortSignal;
};

async function searchPath(options: SearchPathOptions): Promise<void> {
  throwIfAborted(options.signal);

  if (options.matches.length >= options.maxResults) {
    return;
  }

  const fileStat = await stat(options.absolutePath);

  if (fileStat.isDirectory()) {
    const entries = await readdir(options.absolutePath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (options.matches.length >= options.maxResults) {
        return;
      }

      if (options.workspace.shouldSkipName(entry.name)) {
        continue;
      }

      await searchPath({
        ...options,
        absolutePath: path.join(options.absolutePath, entry.name),
      });
    }

    return;
  }

  if (!fileStat.isFile()) {
    return;
  }

  if (fileStat.size > options.maxFileBytes) {
    return;
  }

  const content = await readFile(options.absolutePath, "utf8");

  if (looksBinary(content)) {
    return;
  }

  const relativePath = options.workspace.relativePath(options.absolutePath);
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (options.matches.length >= options.maxResults) {
      return;
    }

    const line = lines[index] ?? "";

    if (options.matcher(line)) {
      options.matches.push(`${relativePath}:${index + 1}:${line}`);
    }
  }
}

function createMatcher(
  pattern: string,
  useRegex: boolean,
): (line: string) => boolean {
  if (!useRegex) {
    return (line) => line.includes(pattern);
  }

  const regex = new RegExp(pattern);
  return (line) => regex.test(line);
}

function looksBinary(content: string): boolean {
  return content.includes("\u0000");
}
