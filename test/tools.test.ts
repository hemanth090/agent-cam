import { expect, test } from "bun:test"
import { extractFileEdit, extractCommand } from "../src/tools"

test("write tool yields a FileEdit with the path and unknown counts", () => {
  const r = extractFileEdit({ name: "write", state: "running", input: { path: "src/a.ts", content: "x" } })
  expect(r).toEqual({ path: "src/a.ts", added: null, removed: null })
})

test("edit tool also yields a FileEdit", () => {
  const r = extractFileEdit({ name: "edit", state: "completed", input: { path: "src/b.ts" } })
  expect(r?.path).toBe("src/b.ts")
})

test("non-file tool yields null", () => {
  expect(extractFileEdit({ name: "grep", state: "completed", input: {} })).toBeNull()
})

test("shell tool yields a RunningCommand with its state", () => {
  expect(extractCommand({ name: "shell", state: "streaming", input: { command: "pnpm test" } }))
    .toEqual({ command: "pnpm test", state: "streaming" })
})

test("unknown tool yields null command", () => {
  expect(extractCommand({ name: "read", state: "completed", input: {} })).toBeNull()
})

test("missing input does not throw", () => {
  expect(extractFileEdit({ name: "write", state: "running" })).toBeNull()
  expect(extractCommand({ name: "shell", state: "running" })).toBeNull()
})
