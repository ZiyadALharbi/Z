/**
 * 
 */
 import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
 import { dirname, join } from "node:path";
 import type {
   ConversationEntry,
   SessionId,
   SessionMetadata,
   SessionSnapshot,
   TurnMetadata,
 } from "../types";
 import type { SessionStore } from "./session-store";
 
 type SessionStoreRecord =
   | { type: "snapshot"; snapshot: SerializedSessionSnapshot }
   | { type: "entry_appended"; entry: SerializedConversationEntry }
   | { type: "turn_upserted"; turn: SerializedTurnMetadata }
   | { type: "metadata_updated"; metadata: SerializedSessionMetadata };
 
 type SerializedSessionSnapshot = {
   metadata: SerializedSessionMetadata;
   turns: SerializedTurnMetadata[];
   entries: SerializedConversationEntry[];
 };
 
 type SerializedSessionMetadata = Omit<
   SessionMetadata,
   "createdAt" | "updatedAt"
 > & {
   createdAt: string;
   updatedAt: string;
 };
 
 type SerializedTurnMetadata = Omit<TurnMetadata, "startedAt" | "finishedAt"> & {
   startedAt: string;
   finishedAt?: string;
 };
 
 type SerializedConversationEntry = Omit<ConversationEntry, "createdAt"> & {
   createdAt: string;
 };
 
 export class JsonlSessionStore implements SessionStore {
   constructor(private readonly directory: string) {}
 
   async load(sessionId: SessionId): Promise<SessionSnapshot | undefined> {
     const filePath = this.getFilePath(sessionId);
 
     let content: string;
     try {
       content = await readFile(filePath, "utf8");
     } catch (error) {
       if (isNodeErrorCode(error, "ENOENT")) {
         return undefined;
       }
 
       throw error;
     }
 
     let snapshot: SessionSnapshot | undefined;
 
     for (const line of content.split("\n")) {
       if (line.trim().length === 0) {
         continue;
       }
 
       const record = JSON.parse(line) as SessionStoreRecord;
 
       if (record.type === "snapshot") {
         snapshot = deserializeSnapshot(record.snapshot);
         continue;
       }
 
       if (!snapshot) {
         throw new Error(`Session log record appeared before snapshot: ${sessionId}`);
       }
 
       if (record.type === "entry_appended") {
         const entry = deserializeEntry(record.entry);
 
         snapshot = {
           ...snapshot,
           entries: [...snapshot.entries, entry],
           metadata: {
             ...snapshot.metadata,
             updatedAt: entry.createdAt,
           },
         };
 
         continue;
       }
 
       if (record.type === "turn_upserted") {
         const turn = deserializeTurn(record.turn);
 
         snapshot = {
           ...snapshot,
           turns: [
             ...snapshot.turns.filter((candidate) => candidate.id !== turn.id),
             turn,
           ],
           metadata: {
             ...snapshot.metadata,
             updatedAt: turn.finishedAt ?? turn.startedAt,
           },
         };
 
         continue;
       }
 
       if (record.type === "metadata_updated") {
         snapshot = {
           ...snapshot,
           metadata: deserializeMetadata(record.metadata),
         };
       }
     }
 
     return snapshot;
   }
 
   async save(snapshot: SessionSnapshot): Promise<void> {
     const filePath = this.getFilePath(snapshot.metadata.id);
 
     await mkdir(dirname(filePath), { recursive: true });
 
     const record: SessionStoreRecord = {
       type: "snapshot",
       snapshot: serializeSnapshot(snapshot),
     };
 
     await writeFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
   }
 
   async appendEntry(entry: ConversationEntry): Promise<void> {
     await this.writeRecord(entry.sessionId, {
       type: "entry_appended",
       entry: serializeEntry(entry),
     });
   }
 
   async upsertTurn(turn: TurnMetadata): Promise<void> {
     await this.writeRecord(turn.sessionId, {
       type: "turn_upserted",
       turn: serializeTurn(turn),
     });
   }
 
   async updateMetadata(metadata: SessionMetadata): Promise<void> {
     await this.writeRecord(metadata.id, {
       type: "metadata_updated",
       metadata: serializeMetadata(metadata),
     });
   }
 
   private getFilePath(sessionId: SessionId): string {
     return join(this.directory, `${sessionId}.jsonl`);
   }
 
   private async writeRecord(
     sessionId: SessionId,
     record: SessionStoreRecord,
   ): Promise<void> {
     const filePath = this.getFilePath(sessionId);
 
     await mkdir(dirname(filePath), { recursive: true });
     await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
   }
 }
 
 function serializeSnapshot(snapshot: SessionSnapshot): SerializedSessionSnapshot {
   return {
     metadata: serializeMetadata(snapshot.metadata),
     turns: snapshot.turns.map(serializeTurn),
     entries: snapshot.entries.map(serializeEntry),
   };
 }
 
 function deserializeSnapshot(
   snapshot: SerializedSessionSnapshot,
 ): SessionSnapshot {
   return {
     metadata: deserializeMetadata(snapshot.metadata),
     turns: snapshot.turns.map(deserializeTurn),
     entries: snapshot.entries.map(deserializeEntry),
   };
 }
 
 function serializeMetadata(metadata: SessionMetadata): SerializedSessionMetadata {
   return {
     ...metadata,
     createdAt: metadata.createdAt.toISOString(),
     updatedAt: metadata.updatedAt.toISOString(),
   };
 }
 
 function deserializeMetadata(
   metadata: SerializedSessionMetadata,
 ): SessionMetadata {
   return {
     ...metadata,
     createdAt: new Date(metadata.createdAt),
     updatedAt: new Date(metadata.updatedAt),
   };
 }
 
 function serializeTurn(turn: TurnMetadata): SerializedTurnMetadata {
   return {
     ...turn,
     startedAt: turn.startedAt.toISOString(),
     finishedAt: turn.finishedAt?.toISOString(),
   };
 }
 
 function deserializeTurn(turn: SerializedTurnMetadata): TurnMetadata {
   return {
     ...turn,
     startedAt: new Date(turn.startedAt),
     finishedAt: turn.finishedAt ? new Date(turn.finishedAt) : undefined,
   };
 }
 
 function serializeEntry(entry: ConversationEntry): SerializedConversationEntry {
   return {
     ...entry,
     createdAt: entry.createdAt.toISOString(),
   };
 }
 
 function deserializeEntry(entry: SerializedConversationEntry): ConversationEntry {
   return {
     ...entry,
     createdAt: new Date(entry.createdAt),
   };
 }
 
 function isNodeErrorCode(error: unknown, code: string): boolean {
   return (
     error instanceof Error &&
     "code" in error &&
     typeof error.code === "string" &&
     error.code === code
   );
 }