import { expect, test } from "bun:test"
import { selectTree } from "../src/sessions"

const s = (id: string, updated: number, parentID: string | null = null) => ({ id, parentID, time: { updated } })

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
