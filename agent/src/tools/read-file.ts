import { readFile, stat } from "node:fs/promises";
import type { Tool } from "../types";
import type { Workspace } from "../workspace/workspace";
import { requireString, throwIfAborted } from "./args";

export type ReadFileToolOptions = {
  workspace: Workspace;
  maxBytes?: number;
};

const DEFAULT_MAX_BYTES = 200_000;

export function ReadFileTool(options: ReadFileToolOptions): Tool {
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
            description:
              "File path to read. Relative paths are resolved from the workspace root.",
          },
        },
        required: ["path"],
      },
    },

    handler: async (args, signal) => {
      throwIfAborted(signal);

      const targetPath = requireString(args, "path");
      const absolutePath = options.workspace.resolveInsideRoot(targetPath);

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

      // Read only after validation and size checks pass.
      return await readFile(absolutePath, "utf8");
    },
  };
}
