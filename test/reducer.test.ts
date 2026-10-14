import { expect, test } from "bun:test"
import { emptyState } from "../src/model"
import { applyEvent, foldEvents } from "../src/reducer"
import {
  writeStarted, writeCalled, writeSuccess,
  shellStarted, shellCalled, shellToolSuccess,
  shellCreatedEvent, shellExitedEvent,
  usageUpdate, usageUpdateChild, unknownEvent,
  executionStarted, executionSucceeded,
  permissionAsked, permissionReplied, formCreated, formReplied,
  toolFailed, textEndedShort, textEndedLong,
  sessionCreatedChild, childExecutionStarted, childExecutionSucceeded,
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

test("session.execution.started makes the session running", () => {
  expect(applyEvent(emptyState(), executionStarted, 1100).running).toBe(true)
})

test("session.execution.succeeded returns the signal to idle", () => {
  const working = foldEvents(emptyState(), [writeStarted, writeCalled, writeSuccess])
  expect(working.signal.state).toBe("working")
  const done = applyEvent(working, executionSucceeded, 1110)
  expect(done.running).toBe(false)
  expect(done.signal.state).toBe("idle")
})

test("permission.asked makes the signal waiting while running", () => {
  const s = foldEvents(emptyState(), [executionStarted, permissionAsked])
  expect(s.hasPendingHuman).toBe(true)
  expect(s.signal.state).toBe("waiting")
})

test("permission.replied clears waiting", () => {
  const s = foldEvents(emptyState(), [executionStarted, permissionAsked, permissionReplied])
  expect(s.hasPendingHuman).toBe(false)
})

test("form.created makes the signal waiting and form.replied clears it", () => {
  expect(foldEvents(emptyState(), [executionStarted, formCreated]).signal.state).toBe("waiting")
  expect(foldEvents(emptyState(), [executionStarted, formCreated, formReplied]).hasPendingHuman).toBe(false)
})

test("tool failure increments failures, feeds an error, and prunes the name", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled, toolFailed])
  expect(s.toolFailures).toBe(1)
  expect(s.toolTotal).toBe(1)
  expect(s.feed[0]?.state).toBe("error")
  expect(s.toolNames["call_w"]).toBeUndefined()
})

test("usage is kept per session and summed", () => {
  const s = foldEvents(emptyState(), [usageUpdate, usageUpdateChild])
  expect(s.tokens.input).toBe(258 + 100)
})

test("tool success prunes the stored name but keeps it in the feed", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled, writeSuccess])
  expect(s.toolNames["call_w"]).toBeUndefined()
  expect(s.feed[0]?.tool).toBe("write")
})

test("the plan text is the agent's longest message", () => {
  const s = foldEvents(emptyState(), [textEndedLong, textEndedShort])
  expect(s.planText).toBe(textEndedLong.data.text)
})

test("a child session is listed as an agent with its title", () => {
  const s = applyEvent(emptyState(), sessionCreatedChild, 1210)
  expect(s.agents["child"]?.title).toBe("Child work")
  expect(s.agents["child"]?.parentID).toBe("s")
})

test("child execution marks the agent running, then done", () => {
  const running = foldEvents(emptyState(), [sessionCreatedChild, childExecutionStarted])
  expect(running.agents["child"]?.running).toBe(true)
  const done = applyEvent(running, childExecutionSucceeded, 1212)
  expect(done.agents["child"]?.running).toBe(false)
})

test("a tool call records the agent's last action", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled])
  expect(s.agents["s"]?.lastAction).toBe("write src/a.ts")
})
