import { expect, test } from "bun:test"
import { startServer, isAllowedOrigin } from "../src/server"
import { emptyState } from "../src/model"

test("allows only local origins", () => {
  expect(isAllowedOrigin("http://127.0.0.1:4317")).toBe(true)
  expect(isAllowedOrigin("http://localhost:4317")).toBe(true)
  expect(isAllowedOrigin("http://evil.example")).toBe(false)
  expect(isAllowedOrigin("not a url")).toBe(false)
})

test("rejects a websocket upgrade from a foreign origin", async () => {
  const srv = startServer(() => emptyState(), 0)
  try {
    const res = await fetch(`${srv.url}ws`, { headers: { origin: "http://evil.example" } })
    expect(res.status).toBe(403)
  } finally {
    srv.stop()
  }
})

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

test("pushes the current state over the websocket on connect", async () => {
  const srv = startServer(() => ({ ...emptyState(), sessionID: "s1" }), 0)
  try {
    const wsUrl = srv.url.replace(/^http/, "ws") + "ws"
    const msg = await new Promise<{ type: string; state: { sessionID: string } }>((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error("no message"))
      }, 3000)
      ws.onmessage = (e) => {
        clearTimeout(timer)
        ws.close()
        resolve(JSON.parse(e.data as string))
      }
      ws.onerror = () => {
        clearTimeout(timer)
        reject(new Error("ws error"))
      }
    })
    expect(msg.type).toBe("state")
    expect(msg.state.sessionID).toBe("s1")
  } finally {
    srv.stop()
  }
})
