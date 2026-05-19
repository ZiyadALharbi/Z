/*
Tool Argument Parsing

Converts provider tool-call argument text into the internal JsonObject shape.
Invalid arguments are represented as parse-error objects so ToolExecutor can
return a normal Tool Result instead of crashing the AgentEngine Loop.
*/

import type { JsonObject, JsonValue } from "../../z-Agent/src/types";

export function parseToolArguments(argumentsText: string): JsonObject {
  if (argumentsText.trim().length === 0) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(argumentsText);

    if (isJsonObject(parsed)) {
      return parsed;
    }

    return {
      __parseError: true,
      message: "Tool arguments must be a JSON object",
      raw: argumentsText,
    };
  } catch {
    return {
      __parseError: true,
      message: "Failed to parse tool arguments JSON",
      raw: argumentsText,
    };
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}
