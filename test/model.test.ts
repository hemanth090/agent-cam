import { expect, test } from "bun:test"
import { emptyUsage, emptyState } from "../src/model"

test("emptyUsage is all zeros", () => {
  expect(emptyUsage()).toEqual({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 })
})

test("emptyState starts idle with empty feed and null panels", () => {
  const s = emptyState()
  expect(s.signal.state).toBe("idle")
  expect(s.sessionID).toBeNull()
  expect(s.currentFile).toBeNull()
  expect(s.runningCommand).toBeNull()
  expect(s.plan).toBeNull()
  expect(s.feed).toEqual([])
})

test("emptyState defaults the signal observables", () => {
  const s = emptyState()
  expect(s.toolFailures).toBe(0)
  expect(s.toolTotal).toBe(0)
  expect(s.hasPendingHuman).toBe(false)
})
