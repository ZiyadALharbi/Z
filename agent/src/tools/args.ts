import type { JsonObject } from "../types";

export function requireString(args: JsonObject, key: string): string {
  const value = args[key];

  if (typeof value !== "string") {
    throw new Error(`Expected "${key}" to be a string`);
  }

  return value;
}

export function optionalNumber(
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

export function optionalBoolean(
  args: JsonObject,
  key: string,
): boolean | undefined {
  const value = args[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Expected "${key}" to be a boolean`);
  }

  return value;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}
