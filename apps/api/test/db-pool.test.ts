import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../src/config/db.js";
import { ConfigurationError, databasePoolConfig } from "../src/config/environment.js";

const keys = ["DB_POOL_MAX", "DB_POOL_ACQUIRE_TIMEOUT_MS", "DB_POOL_MAX_WAITING"] as const;

function withConfig(operation: () => void) {
  const saved = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  try {
    operation();
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
}

function createDatabase(pool: { waitingCount: number; connect: () => Promise<PoolClient> }) {
  const db = new DatabaseService();
  Object.assign(db, { pool });
  return db;
}

function busy(error: unknown) {
  assert.ok(error instanceof ServiceUnavailableException);
  assert.equal(error.getStatus(), 503);
  assert.equal((error.getResponse() as { code: string }).code, "DATABASE_BUSY");
  return true;
}

test("pool configuration has bounded defaults and rejects invalid environment values", () => {
  withConfig(() => {
    assert.deepEqual(databasePoolConfig(), { max: 20, acquireTimeoutMs: 30000, maxWaiting: 6000 });
    for (const key of keys) {
      for (const value of ["", "NaN", "0", "-1", "1.5", "9999999"]) {
        process.env[key] = value;
        assert.throws(databasePoolConfig, ConfigurationError);
      }
      delete process.env[key];
    }
    process.env.DB_POOL_MAX = "4";
    process.env.DB_POOL_ACQUIRE_TIMEOUT_MS = "5000";
    process.env.DB_POOL_MAX_WAITING = "20";
    assert.deepEqual(databasePoolConfig(), { max: 4, acquireTimeoutMs: 5000, maxWaiting: 20 });
  });
});

test("full queue rejects queries and transactions before acquiring a client", async () => {
  let acquired = 0;
  const db = createDatabase({
    waitingCount: 20000,
    connect: async () => { acquired++; throw new Error("must not acquire"); },
  });
  let called = false;
  await assert.rejects(db.query("SELECT 1"), busy);
  await assert.rejects(db.withTransaction(async () => { called = true; }), busy);
  assert.equal(acquired, 0);
  assert.equal(called, false);
});

test("acquisition failure returns a safe 503 and does not run the operation", async () => {
  const db = createDatabase({
    waitingCount: 0,
    connect: async () => { throw new Error("timeout with sensitive connection details"); },
  });
  await assert.rejects(db.query("SELECT 1"), (error) => {
    busy(error);
    assert.doesNotMatch(String(error), /sensitive/);
    return true;
  });
  let called = false;
  await assert.rejects(db.withTransaction(async () => { called = true; }), busy);
  assert.equal(called, false);
});

test("query releases its client once and preserves SQL errors", async () => {
  const failure = new Error("SQL constraint failure");
  let released = 0;
  const client = new EventEmitter() as PoolClient;
  Object.assign(client, {
    query: async (sql: string, parameters: unknown[]) => {
      assert.deepEqual(parameters, [1]);
      if (sql === "FAIL") throw failure;
      return { rows: [{ value: 1 }], rowCount: 1 };
    },
    release: () => { released++; },
  });
  const db = createDatabase({ waitingCount: 0, connect: async () => client });
  assert.deepEqual((await db.query("SELECT $1", [1])).rows, [{ value: 1 }]);
  assert.equal(released, 1);
  await assert.rejects(db.query("FAIL", [1]), (error) => error === failure);
  assert.equal(released, 2);
});

test("transaction commits before returning and releases exactly once", async () => {
  const events: string[] = [];
  const client = new EventEmitter() as PoolClient;
  Object.assign(client, {
    query: async (sql: string) => { events.push(sql); },
    release: (discard: boolean) => { events.push(`release:${discard}`); },
  });
  const db = createDatabase({ waitingCount: 0, connect: async () => client });
  const value = await db.withTransaction(async (received) => {
    assert.equal(received, client);
    await received.query("operation");
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(events, ["BEGIN", "operation", "COMMIT", "release:false"]);
});

test("query releases a client on a socket error and consumes the later query rejection", async () => {
  const failure = new Error("socket reset");
  const client = new EventEmitter() as PoolClient;
  let rejectQuery!: (error: Error) => void;
  let releasedWith: Error | boolean | undefined;
  Object.assign(client, {
    query: () => new Promise((_, reject) => { rejectQuery = reject; }),
    release: (error?: Error | boolean) => { releasedWith = error; },
  });
  const db = createDatabase({ waitingCount: 0, connect: async () => client });
  const request = db.query("SELECT 1");
  client.emit("error", failure);
  await assert.rejects(request, (error) => error === failure);
  assert.equal(releasedWith, failure);
  rejectQuery(failure);
});

test("transaction consumes socket errors and discards the broken client", async () => {
  const events: string[] = [];
  const failure = new Error("socket reset");
  const client = new EventEmitter() as PoolClient;
  Object.assign(client, {
    query: async (sql: string) => { events.push(sql); },
    release: (error?: Error | boolean) => { events.push(error instanceof Error ? "release:error" : `release:${error}`); },
  });
  const db = createDatabase({ waitingCount: 0, connect: async () => client });
  await assert.rejects(db.withTransaction(async () => {
    client.emit("error", failure);
    return 1;
  }), (error) => error === failure);
  assert.deepEqual(events, ["BEGIN", "ROLLBACK", "release:error"]);
});

test("transaction failure rolls back; rollback failure discards the client without hiding the cause", async () => {
  for (const rollbackFails of [false, true]) {
    const events: string[] = [];
    const failure = new Error("operation failed");
    const client = new EventEmitter() as PoolClient;
    Object.assign(client, {
      query: async (sql: string) => {
        events.push(sql);
        if (rollbackFails && sql === "ROLLBACK") throw new Error("connection lost");
      },
      release: (discard: boolean) => { events.push(`release:${discard}`); },
    });
    const db = createDatabase({ waitingCount: 0, connect: async () => client });
    await assert.rejects(db.withTransaction(async () => { throw failure; }), (error) => error === failure);
    assert.deepEqual(events, ["BEGIN", "ROLLBACK", `release:${rollbackFails}`]);
  }
});
