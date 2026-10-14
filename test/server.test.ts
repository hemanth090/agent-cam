import { expect, test } from "bun:test"
import { startServer } from "../src/server"
import { emptyState } from "../src/model"

test("serves the page and a websocket on 127.0.0.1", async () => {
  const srv = startServer(() => emptyState(), 0)
  try {
    const res = await fetch(srv.url)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Agent Cam")
    expect(srv.url).toContain("127.0.0.1")
  } finally {
    srv.stop()
  }
})
