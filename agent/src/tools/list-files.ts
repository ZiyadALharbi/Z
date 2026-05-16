/*
List Files Tool

Lists the immediate children of a directory inside the workspace.
Path resolution and workspace escape protection are handled by Workspace.
Argument parsing and abort checks are shared through tool helpers.
*/

import { readdir } from "node:fs/promises";
import type { JsonObject, Tool } from "../types";
import type { Workspace } from "../workspace/workspace";
import { requireString, throwIfAborted } from "./args";

export type ListFilesToolOptions = {
  workspace: Workspace;
};

type ListFilesArgs = JsonObject & {
  path: string;
};

function parseListFilesArgs(args: JsonObject): ListFilesArgs {
  return {
    path: requireString(args, "path"),
  };
}

export function ListFilesTool(
  options: ListFilesToolOptions,
): Tool<ListFilesArgs> {
  return {
    definition: {
      name: "list_files",
      description: "List files and directories at a given path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory path to list. Relative paths are resolved from the workspace root.",
          },
        },
        required: ["path"],
      },
    },

    parseArgs: parseListFilesArgs,

    handler: async (args, signal) => {
      throwIfAborted(signal);

      const absolutePath = await options.workspace.resolveInsideRoot(args.path);

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
