import  type { AssistantMessage } from "../types";

export type StreamEvents =
    | {type: "text_delta"; text: string}
    | {type: "tool_call"; id: string; name: string; arguments: unknown}
    | {type: "done"; message: AssistantMessage}
    | {type: "error"; message: string}