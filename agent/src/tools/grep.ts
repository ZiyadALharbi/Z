/*
Tool Contract
Tool name:

grep
Arguments:

{
  path: string;
  pattern: string;
  regex?: boolean;
  maxResults?: number;
}
Behavior:

path is a file or directory.
pattern is the search text or regex.
regex: false means plain substring search.
regex: true means JavaScript RegExp.
maxResults defaults to something small like 100.
Skip binary-ish files and huge files.
Return matches as:

relative/path.ts:12:matching line text
*/

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, Tool } from "../types";

export type GrepToolOptions = {
  cwd: string;
  maxFileBytes?: number;
  defaultMaxResults?: number;
};

const DEFAULT_MAX_FILE_BYTES = 200_000;
const DEFAULT_MAX_RESULTS = 100;

export function createGrepTool(options: GrepToolOptions): Tool {
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
              "File or directory path to search. Relative paths are resolved from the current working directory.",
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

      const targetPath = getStringArg(args, "path");
      const pattern = getStringArg(args, "pattern");
      const useRegex = getOptionalBooleanArg(args, "regex") ?? false;
      const maxResults =
        getOptionalNumberArg(args, "maxResults") ?? defaultMaxResults;

      if (maxResults < 1) {
        throw new Error("maxResults must be at least 1");
      }

      const absolutePath = path.resolve(options.cwd, targetPath);
      const matcher = createMatcher(pattern, useRegex);
      const matches: string[] = [];

      await searchPath({
        absolutePath,
        cwd: options.cwd,
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


// HELPER FUNCTIONS

type SearchPathOptions = {
    absolutePath: string;
    cwd: string;
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
      const entries = await readdir(options.absolutePath, { withFileTypes: true });
  
      for (const entry of entries) {
        if (options.matches.length >= options.maxResults) {
          return;
        }
  
        if (shouldSkipName(entry.name)) {
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
  
    const relativePath = path.relative(options.cwd, options.absolutePath);
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
  
  function shouldSkipName(name: string): boolean {
    return (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "build" ||
      name === ".DS_Store"
    );
  }
  
  function looksBinary(content: string): boolean {
    return content.includes("\u0000");
  }
  
  function getStringArg(args: JsonObject, key: string): string {
    const value = args[key];
  
    if (typeof value !== "string") {
      throw new Error(`Expected "${key}" to be a string`);
    }
  
    return value;
  }
  
  function getOptionalBooleanArg(args: JsonObject, key: string): boolean | undefined {
    const value = args[key];
  
    if (value === undefined) {
      return undefined;
    }
  
    if (typeof value !== "boolean") {
      throw new Error(`Expected "${key}" to be a boolean`);
    }
  
    return value;
  }
  
  function getOptionalNumberArg(args: JsonObject, key: string): number | undefined {
    const value = args[key];
  
    if (value === undefined) {
      return undefined;
    }
  
    if (typeof value !== "number") {
      throw new Error(`Expected "${key}" to be a number`);
    }
  
    return value;
  }
  
  function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }