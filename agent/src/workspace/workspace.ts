import path from "node:path";

export type WorkspaceOptions = {
  root: string;
};

export class Workspace {
  readonly root: string;

  constructor(options: WorkspaceOptions) {
    this.root = path.resolve(options.root);
  }

  resolveInsideRoot(inputPath: string): string {
    const absolutePath = path.resolve(this.root, inputPath);

    if (
      absolutePath !== this.root &&
      !absolutePath.startsWith(this.root + path.sep)
    ) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    return absolutePath;
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
      name === ".DS_Store"
    );
  }
}
