import { expect, test } from "bun:test"
import { emptyState } from "../src/model"
import { applyEvent, foldEvents } from "../src/reducer"
import {
  writeStarted, writeCalled, writeSuccess,
  shellStarted, shellCalled, shellToolSuccess,
  shellCreatedEvent, shellExitedEvent,
  usageUpdate, unknownEvent,
} from "./fixtures/events"

test("a write tool call sets currentFile", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled])
  expect(s.currentFile?.path).toBe("src/a.ts")
})

test("a shell tool call sets runningCommand", () => {
  const s = foldEvents(emptyState(), [shellStarted, shellCalled])
  expect(s.runningCommand?.command).toBe("pnpm test")
})

test("shell.created sets runningCommand and shell.exited clears it", () => {
  const s = foldEvents(emptyState(), [shellCreatedEvent])
  expect(s.runningCommand?.command).toBe("pnpm test")
  expect(foldEvents(s, [shellExitedEvent]).runningCommand).toBeNull()
})

test("tool success records a feed item, a success time, and a working signal", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled, writeSuccess])
  expect(s.feed[0]?.tool).toBe("write")
  expect(s.feed[0]?.state).toBe("completed")
  expect(s.lastSuccessAt).toBe(1005)
  expect(s.signal.state).toBe("working")
})

test("tool success clears a running command", () => {
  const s = foldEvents(emptyState(), [shellStarted, shellCalled, shellToolSuccess])
  expect(s.runningCommand).toBeNull()
})

test("usage event sets the session's token totals (latest wins)", () => {
  const s = foldEvents(emptyState(), [usageUpdate, usageUpdate])
  expect(s.tokens.input).toBe(258)
  expect(s.tokens.cacheRead).toBe(5120)
})

test("an unknown event is ignored without throwing", () => {
  expect(() => applyEvent(emptyState(), unknownEvent, 1)).not.toThrow()
  expect(applyEvent(emptyState(), unknownEvent, 1)).toEqual(emptyState())
})

test("input state is not mutated", () => {
  const s = emptyState()
  applyEvent(s, writeStarted, 1)
  expect(s.currentFile).toBeNull()
  expect(s.toolNames).toEqual({})
})
