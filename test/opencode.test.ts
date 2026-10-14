import { expect, test } from "bun:test"
import { foldEvents } from "../src/opencode"
import { emptyState } from "../src/model"
import { writeStarted, writeCalled, writeSuccess } from "./fixtures/events"

test("foldEvents is available from the connection module", () => {
  const s = foldEvents(emptyState(), [writeStarted, writeCalled, writeSuccess])
  expect(s.currentFile?.path).toBe("src/a.ts")
  expect(s.feed.length).toBe(1)
})
