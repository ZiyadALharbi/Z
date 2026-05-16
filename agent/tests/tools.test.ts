import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Workspace } from "../src/workspace/workspace";
import { createBashTool } from "../src/tools/bash";
import { GrepTool } from "../src/tools/grep";
import { ListFilesTool } from "../src/tools/list-files";
import { ReadFileTool } from "../src/tools/read-file";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), "z-agent-tests-"));
  tempRoots.push(root);
  return new Workspace({ root });
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("Workspace", () => {
  test("resolves paths inside the root", async () => {
    const workspace = await createTempWorkspace();

    expect(workspace.resolveInsideRoot("src/index.ts")).toBe(
      join(workspace.root, "src/index.ts"),
    );
  });

  test("rejects paths that escape the root", async () => {
    const workspace = await createTempWorkspace();

    expect(() => workspace.resolveInsideRoot("../outside.txt")).toThrow(
      "Path escapes workspace",
    );
  });
});

describe("built-in file tools", () => {
  test("list_files returns sorted immediate children with directory suffixes", async () => {
    const workspace = await createTempWorkspace();
    await mkdir(join(workspace.root, "src"));
    await writeFile(join(workspace.root, "README.md"), "hello");

    const tool = ListFilesTool({ workspace });

    await expect(tool.handler({ path: "." })).resolves.toBe(
      "README.md\nsrc/",
    );
  });

  test("read_file reads UTF-8 text files", async () => {
    const workspace = await createTempWorkspace();
    await writeFile(join(workspace.root, "README.md"), "hello");

    const tool = ReadFileTool({ workspace });

    await expect(tool.handler({ path: "README.md" })).resolves.toBe("hello");
  });

  test("read_file rejects directories and oversized files", async () => {
    const workspace = await createTempWorkspace();
    await mkdir(join(workspace.root, "src"));
    await writeFile(join(workspace.root, "large.txt"), "abcdef");

    const tool = ReadFileTool({ workspace, maxBytes: 3 });

    await expect(tool.handler({ path: "src" })).rejects.toThrow(
      "Path is a directory: src",
    );
    await expect(tool.handler({ path: "large.txt" })).rejects.toThrow(
      "File is too large",
    );
  });

  test("grep searches files recursively and honors maxResults", async () => {
    const workspace = await createTempWorkspace();
    await mkdir(join(workspace.root, "src"));
    await writeFile(
      join(workspace.root, "src", "one.txt"),
      "alpha\nneedle one\nneedle two",
    );

    const tool = GrepTool({ workspace });

    await expect(
      tool.handler({ path: "src", pattern: "needle", maxResults: 2 }),
    ).resolves.toBe("src/one.txt:2:needle one\nsrc/one.txt:3:needle two");
  });

  test("grep returns a friendly empty result", async () => {
    const workspace = await createTempWorkspace();
    await writeFile(join(workspace.root, "README.md"), "hello");

    const tool = GrepTool({ workspace });

    await expect(
      tool.handler({ path: ".", pattern: "missing" }),
    ).resolves.toBe("No matches found.");
  });
});

describe("bash tool", () => {
  test("runs safe commands in the configured cwd", async () => {
    const workspace = await createTempWorkspace();
    const tool = createBashTool({ cwd: workspace.root });

    const result = await tool.handler({ command: "printf hello" });

    expect(result).toContain("Command: printf hello");
    expect(result).toContain("Exit code: 0");
    expect(result).toContain("STDOUT:\nhello");
    expect(result).toContain("STDERR:\n(empty)");
  });

  test("rejects empty and obviously destructive commands", async () => {
    const workspace = await createTempWorkspace();
    const tool = createBashTool({ cwd: workspace.root });

    await expect(tool.handler({ command: "   " })).rejects.toThrow(
      "Command cannot be empty",
    );
    await expect(tool.handler({ command: "sudo ls" })).rejects.toThrow(
      "Blocked potentially destructive command",
    );
  });

  test("caps requested timeout and output length", async () => {
    const workspace = await createTempWorkspace();
    const tool = createBashTool({
      cwd: workspace.root,
      maxTimeoutMs: 10,
      defaultTimeoutMs: 10,
      maxOutputLength: 40,
    });

    const result = await tool.handler({
      command: "printf abcdefghijklmnopqrstuvwxyz",
      timeoutMs: 1_000,
    });

    expect(result).toContain("[Command output truncated]");
  });
});
