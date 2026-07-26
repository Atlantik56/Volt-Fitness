import assert from "node:assert/strict";
import test from "node:test";
import { createSubmissionGuard } from "../app/submission-guard.ts";

function deferred<T>() {
 let resolve!: (v: T) => void, reject!: (e: any) => void;
 const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej });
 return { promise, resolve, reject };
}

test("двойной синхронный вызов до завершения первого — выполняется только один раз", async () => {
 const guard = createSubmissionGuard();
 let calls = 0;
 const first = deferred<void>();
 const runA = guard.run(async () => { calls++; await first.promise });
 const runB = guard.run(async () => { calls++ });
 assert.equal(guard.pending, true);
 first.resolve();
 await Promise.all([runA, runB]);
 assert.equal(calls, 1);
});

test("после успешного завершения guard снова свободен", async () => {
 const guard = createSubmissionGuard();
 await guard.run(async () => {});
 assert.equal(guard.pending, false);
 let calls = 0;
 await guard.run(async () => { calls++ });
 assert.equal(calls, 1);
});

test("после ошибки guard снимается — повторная попытка разрешена", async () => {
 const guard = createSubmissionGuard();
 await assert.rejects(guard.run(async () => { throw new Error("network") }));
 assert.equal(guard.pending, false);
 let calls = 0;
 const result = await guard.run(async () => { calls++; return "ok" });
 assert.equal(calls, 1);
 assert.equal(result, "ok");
});

test("второй вызов, пока первый ещё выполняется, возвращает undefined без запуска fn", async () => {
 const guard = createSubmissionGuard();
 const first = deferred<void>();
 const runA = guard.run(async () => { await first.promise; return "a" });
 const runB = await guard.run(async () => "b");
 assert.equal(runB, undefined);
 first.resolve();
 assert.equal(await runA, "a");
});
