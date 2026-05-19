import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { InMemorySessionStore } from "../src/harness/session/in-memory-session-store";
import { JsonlSessionStore } from "../src/harness/session/jsonl-session-store";
import type {
  ConversationEntry,
  SessionMetadata,
  SessionSnapshot,
  TurnMetadata,
} from "../src/harness/types";

function createMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "session_1",
    status: "active",
    createdAt: new Date("2026-05-19T00:00:00.000Z"),
    updatedAt: new Date("2026-05-19T00:00:00.000Z"),
    ...overrides,
  };
}

function createTurn(overrides: Partial<TurnMetadata> = {}): TurnMetadata {
  return {
    id: "turn_1",
    sessionId: "session_1",
    runId: "run_1",
    status: "active",
    startedAt: new Date("2026-05-19T00:01:00.000Z"),
    ...overrides,
  };
}

function createEntry(overrides: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    id: "entry_1",
    sessionId: "session_1",
    runId: "run_1",
    turnId: "turn_1",
    sequence: 1,
    kind: "user_message",
    message: {
      role: "user",
      content: "hello",
    },
    createdAt: new Date("2026-05-19T00:02:00.000Z"),
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    metadata: createMetadata(),
    turns: [],
    entries: [],
    ...overrides,
  };
}

describe("InMemorySessionStore", () => {
  test("saves and loads a copy-safe snapshot", async () => {
    const store = new InMemorySessionStore();
    const snapshot = createSnapshot({
      turns: [createTurn()],
      entries: [createEntry()],
    });

    await store.save(snapshot);

    const loaded = await store.load("session_1");

    expect(loaded).toEqual(snapshot);

    if (!loaded) {
      throw new Error("Expected saved snapshot");
    }

    loaded.metadata.status = "closed";
    loaded.entries[0] = createEntry({ id: "mutated" });

    expect(await store.load("session_1")).toEqual(snapshot);
  });

  test("appends entries after initial save", async () => {
    const store = new InMemorySessionStore();
    const entry = createEntry();

    await store.save(createSnapshot());
    await store.appendEntry(entry);

    const loaded = await store.load("session_1");

    expect(loaded?.entries).toEqual([entry]);
    expect(loaded?.metadata.updatedAt).toEqual(entry.createdAt);
  });

  test("upserts turns by id", async () => {
    const store = new InMemorySessionStore();
    const activeTurn = createTurn();
    const completedTurn = createTurn({
      status: "completed",
      finishedAt: new Date("2026-05-19T00:03:00.000Z"),
    });

    await store.save(createSnapshot({ turns: [activeTurn] }));
    await store.upsertTurn(completedTurn);

    const loaded = await store.load("session_1");

    expect(loaded?.turns).toEqual([completedTurn]);
    expect(loaded?.metadata.updatedAt).toEqual(completedTurn.finishedAt);
  });
});

describe("JsonlSessionStore", () => {
  test("returns undefined for a missing session", async () => {
    const store = new JsonlSessionStore(await createTempDirectory());

    await expect(store.load("missing_session")).resolves.toBeUndefined();
  });

  test("saves, appends, reloads, and restores Date objects", async () => {
    const store = new JsonlSessionStore(await createTempDirectory());
    const entry = createEntry();
    const completedTurn = createTurn({
      status: "completed",
      finishedAt: new Date("2026-05-19T00:03:00.000Z"),
    });

    await store.save(createSnapshot());
    await store.appendEntry(entry);
    await store.upsertTurn(completedTurn);

    const loaded = await store.load("session_1");

    expect(loaded?.entries).toEqual([entry]);
    expect(loaded?.turns).toEqual([completedTurn]);
    expect(loaded?.metadata.createdAt).toBeInstanceOf(Date);
    expect(loaded?.metadata.updatedAt).toBeInstanceOf(Date);
    expect(loaded?.entries[0]?.createdAt).toBeInstanceOf(Date);
    expect(loaded?.turns[0]?.startedAt).toBeInstanceOf(Date);
    expect(loaded?.turns[0]?.finishedAt).toBeInstanceOf(Date);
  });

  test("metadata updates override previous metadata", async () => {
    const store = new JsonlSessionStore(await createTempDirectory());
    const metadata = createMetadata({
      status: "closed",
      updatedAt: new Date("2026-05-19T00:04:00.000Z"),
    });

    await store.save(createSnapshot());
    await store.updateMetadata(metadata);

    const loaded = await store.load("session_1");

    expect(loaded?.metadata).toEqual(metadata);
  });
});

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "z-agent-session-store-"));
}
