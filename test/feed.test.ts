import { expect, test } from "bun:test"
import { pushFeed } from "../src/feed"
import type { FeedItem } from "../src/model"

const item = (id: string, at: number): FeedItem => ({ id, sessionID: "s", tool: "write", summary: id, state: "completed", at })

test("newest item is first", () => {
  const f = pushFeed([], item("a", 1), 20)
  expect(pushFeed(f, item("b", 2), 20).map((i) => i.id)).toEqual(["b", "a"])
})

test("caps at limit, dropping oldest", () => {
  let f: FeedItem[] = []
  for (let i = 0; i < 25; i++) f = pushFeed(f, item(String(i), i), 20)
  expect(f.length).toBe(20)
  expect(f[0]!.id).toBe("24")
  expect(f.at(-1)!.id).toBe("5")
})

test("dedupes by id keeping the newest", () => {
  const f = pushFeed([item("x", 1)], item("x", 2), 20)
  expect(f.length).toBe(1)
  expect(f[0]!.at).toBe(2)
})
