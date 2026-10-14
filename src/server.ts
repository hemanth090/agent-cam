import { join } from "node:path"
import type { ServerWebSocket } from "bun"
import type { CamState } from "./model"
import { DEFAULT_PORT } from "./config"

export interface CamServer {
  url: string
  broadcast: (s: CamState) => void
  stop: () => void
}

const WEB_DIR = join(import.meta.dir, "web")

const STATIC: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/style.css": "style.css",
}

const CONTENT_TYPE: Record<string, string> = {
  "index.html": "text/html; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "style.css": "text/css; charset=utf-8",
}

/** Only local origins may open the dashboard's WebSocket. */
export function isAllowedOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  } catch {
    return false
  }
}

export function startServer(getState: () => CamState, port = DEFAULT_PORT): CamServer {
  const clients = new Set<ServerWebSocket<unknown>>()

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(req, srv) {
      const url = new URL(req.url)
      if (url.pathname === "/ws") {
        const origin = req.headers.get("origin")
        if (origin && !isAllowedOrigin(origin)) return new Response("forbidden", { status: 403 })
        if (srv.upgrade(req)) return undefined
        return new Response("websocket upgrade failed", { status: 400 })
      }
      const file = STATIC[url.pathname]
      if (!file) return new Response("not found", { status: 404 })
      return new Response(Bun.file(join(WEB_DIR, file)), {
        headers: { "content-type": CONTENT_TYPE[file] ?? "application/octet-stream" },
      })
    },
    websocket: {
      open(ws) {
        clients.add(ws)
        ws.send(JSON.stringify({ type: "state", state: getState() }))
      },
      close(ws) {
        clients.delete(ws)
      },
      message() {
        // the page is read-only; ignore inbound messages
      },
    },
  })

  const url = `http://127.0.0.1:${server.port}/`

  return {
    url,
    broadcast(s) {
      const msg = JSON.stringify({ type: "state", state: s })
      for (const c of clients) c.send(msg)
    },
    stop() {
      for (const c of clients) c.close()
      server.stop(true)
    },
  }
}
