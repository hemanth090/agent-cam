import { expect, test } from "bun:test"
import { pickRoot, selectTree } from "../src/sessions"

const s = (id: string, updated: number, parentID: string | null = null, directory: string | null = null) => ({
  id,
  parentID,
  directory,
  time: { updated },
})

test("includes the active session and its descendants", () => {
  const all = [s("p", 1), s("c1", 2, "p"), s("c2", 3, "c1"), s("other", 9)]
  expect(selectTree(all, "p")).toEqual(["p", "c1", "c2"])
})

test("falls back to most recently updated when activeID is null", () => {
  expect(selectTree([s("a", 1), s("b", 5)], null)).toEqual(["b"])
})

test("no sessions yields empty list", () => {
  expect(selectTree([], null)).toEqual([])
})

test("ignores siblings and ancestors of the active session", () => {
  const all = [s("root", 1), s("p", 2, "root"), s("sib", 3, "root"), s("c", 4, "p")]
  expect(selectTree(all, "p")).toEqual(["p", "c"])
})

test("pickRoot prefers the launch directory over a newer session elsewhere", () => {
  const all = [s("here", 100, null, "/work"), s("elsewhere", 999, null, "/other")]
  expect(pickRoot(all, new Set(), "/work")).toBe("here")
})

test("pickRoot prefers the most recently updated running session in the directory", () => {
  const all = [s("old", 100, null, "/work"), s("new", 200, null, "/work"), s("stale", 300, null, "/work")]
  expect(pickRoot(all, new Set(["old", "new"]), "/work")).toBe("new")
})

test("pickRoot falls back to the newest overall when the directory has no sessions", () => {
  const all = [s("a", 1, null, "/x"), s("b", 9, null, "/y")]
  expect(pickRoot(all, new Set(), "/work")).toBe("b")
})
