import  type { AssistantMessage, JsonObject } from "../types";

export type StreamEvents =
    | {type: "text_delta"; text: string}
    | {type: "tool_call"; id: string; name: string; arguments: JsonObject}
    | {type: "done"; message: AssistantMessage}
    | {type: "error"; message: string}