import assert from "node:assert/strict";
import test from "node:test";
import {
  createPromiseQueue,
  createRetryablePromise,
} from "../src/services/ocrRuntime.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test("serializes complete queued worker operations", async () => {
  const enqueue = createPromiseQueue();
  const firstOperation = deferred();
  const events: string[] = [];

  const first = enqueue(async () => {
    events.push("first:parameters");
    await firstOperation.promise;
    events.push("first:recognize");
  });
  const second = enqueue(async () => {
    events.push("second:parameters");
    events.push("second:recognize");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:parameters"]);

  firstOperation.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(events, [
    "first:parameters",
    "first:recognize",
    "second:parameters",
    "second:recognize",
  ]);
});

test("a failed queued operation does not block the next operation", async () => {
  const enqueue = createPromiseQueue();
  const first = enqueue(async () => {
    throw new Error("recognition failed");
  });
  const second = enqueue(async () => "next recognition");

  await assert.rejects(first, /recognition failed/);
  assert.equal(await second, "next recognition");
});

test("retries worker creation after initialization failure", async () => {
  let attempts = 0;
  const manager = createRetryablePromise(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("worker initialization failed");
    return { worker: true };
  });

  await assert.rejects(manager.get(), /worker initialization failed/);
  assert.deepEqual(await manager.get(), { worker: true });
  assert.equal(attempts, 2);
});
