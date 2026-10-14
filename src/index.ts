import { emptyState, type CamState } from "./model"
import { connect, finalize, seedTree, stream } from "./opencode"
import { selectTree } from "./sessions"
import { startServer } from "./server"

export interface ReconnectOptions {
  delayMs?: number
  signal?: AbortSignal
  onError?: (e: unknown) => void
}

const TICK_MS = 5_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run `run` repeatedly, retrying after a failure until it resolves or the
 * signal aborts. The event stream is live-only, so this is how the dashboard
 * survives a dropped connection.
 */
export async function withReconnect(
  run: (signal: AbortSignal) => Promise<void>,
  options: ReconnectOptions = {},
): Promise<void> {
  const { delayMs = 1000, signal, onError } = options
  while (!signal?.aborted) {
    try {
      await run(signal ?? new AbortController().signal)
      return
    } catch (e) {
      if (signal?.aborted) return
      onError?.(e)
      await sleep(delayMs)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dirFlag = args.indexOf("--directory")
  const directory = dirFlag >= 0 && args[dirFlag + 1] ? args[dirFlag + 1] : process.cwd()

  const { client, url } = await connect()

  const list = await client.session.list()
  const sessions = list.data.map((s) => ({ id: s.id, parentID: s.parentID, time: { updated: s.time.updated } }))
  const active = await client.session.active()
  const activeID = Object.keys(active)[0] ?? null
  const ids = new Set(selectTree(sessions, activeID))

  let state: CamState = ids.size > 0 ? await seedTree(client, [...ids]) : emptyState()

  const server = startServer(() => state)
  console.log(
    `Agent Cam \u2192 ${server.url}  (${ids.size} session(s) via ${url}; directory scoping not yet applied, cwd ${directory})`,
  )
  if (process.platform === "darwin") {
    try {
      Bun.spawn(["open", server.url])
    } catch {
      // opening the browser is a convenience; ignore failures
    }
  }

  // The signal must age even when no events arrive, or a stalled agent keeps
  // reading "working" forever.
  const tick = setInterval(() => {
    state = finalize(state, Date.now())
    server.broadcast(state)
  }, TICK_MS)

  const ac = new AbortController()
  const shutdown = () => {
    clearInterval(tick)
    ac.abort()
    server.stop()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await withReconnect(
    async (signal) => {
      state = ids.size > 0 ? await seedTree(client, [...ids]) : emptyState()
      server.broadcast(state)
      await stream(client, ids, state, (s) => {
        state = s
        server.broadcast(s)
      }, signal)
    },
    {
      signal: ac.signal,
      onError: (e) => console.error("stream dropped, retrying:", e instanceof Error ? e.message : e),
    },
  )
}

if (import.meta.main) {
  await main()
}
