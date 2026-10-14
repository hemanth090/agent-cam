import { expect, test } from "bun:test"
import { computeSignal } from "../src/signal"

const base = { idle: false, hasPendingHuman: false, now: 1000, lastSuccessAt: 900, failed: 0, total: 10, stalledAfterMs: 60_000 }

test("no active session is idle", () => expect(computeSignal({ ...base, idle: true }).state).toBe("idle"))
test("pending human outranks a stall", () =>
  expect(computeSignal({ ...base, hasPendingHuman: true, lastSuccessAt: 0 }).state).toBe("waiting"))
test("stale last success is risky", () =>
  expect(computeSignal({ ...base, lastSuccessAt: 1000 - 120_000 }).state).toBe("risky"))
test("no success yet is risky", () => expect(computeSignal({ ...base, lastSuccessAt: null }).state).toBe("risky"))
test("many failures are risky", () => expect(computeSignal({ ...base, failed: 4, total: 10 }).state).toBe("risky"))
test("recent success and few failures is working", () => expect(computeSignal(base).state).toBe("working"))
test("each state carries a reason", () => {
  expect(computeSignal({ ...base, idle: true }).reason.length).toBeGreaterThan(0)
})
