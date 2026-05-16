
/*
Workspace path safety:
- First resolve the input lexically to block simple escapes like "../secret.txt".
- Then resolve the real filesystem paths to catch symlinks inside the workspace that point outside of it.
- Return the real target path so file tools operate on the verified location.
*/

import { realpath } from "node:fs/promises";
import path from "node:path";

export type WorkspaceOptions = {
  root: string;
};

export class Workspace {
  readonly root: string;
  private readonly rootRealPathPromise: Promise<string>;

  constructor(options: WorkspaceOptions) {
    this.root = path.resolve(options.root);
    this.rootRealPathPromise = realpath(this.root);
  }

  // Fast lexical check catches simple "../" escapes before touching the filesystem
  async resolveInsideRoot(inputPath: string): Promise<string> {
    const absolutePath = path.resolve(this.root, inputPath);

    if (!isInsideOrEqual(absolutePath, this.root)) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    const [rootRealPath, targetRealPath] = await Promise.all([
      this.rootRealPathPromise,
      realpath(absolutePath),
    ]);

    // Realpath check catches symlinks that point outside the workspace
    if (!isInsideOrEqual(targetRealPath, rootRealPath)) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    return targetRealPath;
  }

  relativePath(absolutePath: string): string {
    return path.relative(this.root, absolutePath);
  }

  shouldSkipName(name: string): boolean {
    return (
      name === "node_modules" ||
      name === ".git" ||
      name === "dist" ||
      name === "build" ||
      name === "coverage" ||
      name === ".next" ||
      name === ".turbo" ||
      name === ".cache" ||
      name === ".vite" ||
      name === ".parcel-cache" ||
      name === "out" ||
      name === "tmp" ||
      name === "temp" ||
      name === "bun.lockb" ||
      name === ".DS_Store"
    );
  }
}

function isInsideOrEqual(targetPath: string, rootPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(rootPath + path.sep);
}
