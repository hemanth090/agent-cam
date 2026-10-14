import { expect, test } from "bun:test"
import { withReconnect } from "../src/index"

test("retries after a failure until the run succeeds", async () => {
  let calls = 0
  await withReconnect(
    async () => {
      calls++
      if (calls === 3) return
      throw new Error("stream dropped")
    },
    { delayMs: 0 },
  )
  expect(calls).toBe(3)
})

test("does not run when the signal is already aborted", async () => {
  const ac = new AbortController()
  ac.abort()
  let calls = 0
  await withReconnect(async () => void calls++, { delayMs: 0, signal: ac.signal })
  expect(calls).toBe(0)
})

test("reports each failure to onError", async () => {
  const errors: unknown[] = []
  let calls = 0
  await withReconnect(
    async () => {
      calls++
      if (calls < 2) throw new Error("boom")
    },
    { delayMs: 0, onError: (e) => errors.push(e) },
  )
  expect(errors.length).toBe(1)
})
