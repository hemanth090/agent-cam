import { expect, test } from "bun:test"
import { foldEvents, stream } from "../src/opencode"
import { emptyState, type CamState } from "../src/model"
import { writeStarted, writeCalled, writeSuccess } from "./fixtures/events"

test("foldEvents is available from the connection module", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled, writeSuccess])
  expect(s.currentFile?.path).toBe("src/a.ts")
  expect(s.feed.length).toBe(1)
})

function fakeClient(events: unknown[]) {
  return {
    event: {
      subscribe: () => (async function* () {
        for (const e of events) yield e
      })(),
    },
  }
}

test("stream ignores events from sessions outside the mirrored set", async () => {
  const events = [
    { type: "session.tool.input.started", created: 1, data: { sessionID: "other", id: "c1", name: "write" } },
    { type: "session.tool.input.started", created: 2, data: { sessionID: "s", id: "c2", name: "write" } },
    { type: "session.tool.called", created: 3, data: { sessionID: "s", id: "c2", input: { path: "a.ts" } } },
  ]
  const states: CamState[] = []
  await stream(fakeClient(events) as never, new Set(["s"]), emptyState(), (s) => states.push(s), new AbortController().signal)
  expect(states.at(-1)?.sessionID).toBe("s")
  expect(states.at(-1)?.currentFile?.path).toBe("a.ts")
})

test("stream adopts a child session created after startup", async () => {
  const events = [
    { type: "session.created", created: 1, data: { sessionID: "child", parentID: "s" } },
    { type: "session.tool.input.started", created: 2, data: { sessionID: "child", id: "c", name: "write" } },
    { type: "session.tool.called", created: 3, data: { sessionID: "child", id: "c", input: { path: "child.ts" } } },
  ]
  const states: CamState[] = []
  await stream(fakeClient(events) as never, new Set(["s"]), emptyState(), (s) => states.push(s), new AbortController().signal)
  expect(states.at(-1)?.currentFile?.path).toBe("child.ts")
})

test("stream drops shell lifecycles from a non-mirrored session", async () => {
  const events = [
    { type: "shell.created", created: 1, data: { info: { id: "sh1", command: "ls", status: "running", metadata: { sessionID: "other" } } } },
    { type: "shell.exited", created: 2, data: { id: "sh1", exit: 0, status: "exited" } },
  ]
  const states: CamState[] = []
  await stream(fakeClient(events) as never, new Set(["s"]), emptyState(), (s) => states.push(s), new AbortController().signal)
  expect(states.length).toBe(0)
})
