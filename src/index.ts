#!/usr/bin/env bun
import { emptyState, type CamState } from "./model"
import { TICK_MS } from "./config"
import { connect, finalize, listAllSessions, seedTree, stream } from "./opencode"
import { pickRoot, selectTree } from "./sessions"
import { startServer } from "./server"

export interface ReconnectOptions {
  delayMs?: number
  maxDelayMs?: number
  signal?: AbortSignal
  onError?: (e: unknown) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Exponential backoff, capped - so a down service isn't hammered. */
export function backoffDelay(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  return Math.min(baseMs * 2 ** attempt, maxMs)
}

/**
 * Run `run` repeatedly, retrying after a failure until it resolves or the
 * signal aborts. The event stream is live-only, so this is how the dashboard
 * survives a dropped connection.
 */
export async function withReconnect(
  run: (signal: AbortSignal) => Promise<void>,
  options: ReconnectOptions = {},
): Promise<void> {
  const { delayMs = 1000, maxDelayMs = 30_000, signal, onError } = options
  let attempt = 0
  while (!signal?.aborted) {
    try {
      await run(signal ?? new AbortController().signal)
      return
    } catch (e) {
      if (signal?.aborted) return
      onError?.(e)
      await sleep(backoffDelay(attempt, delayMs, maxDelayMs))
      attempt++
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dirFlag = args.indexOf("--directory")
  const directory = (dirFlag >= 0 ? args[dirFlag + 1] : undefined) ?? process.cwd()

  const { client, url } = await connect()

  const sessions = (await listAllSessions(client)).map((s) => ({
    id: s.id,
    parentID: s.parentID,
    directory: s.location?.directory ?? null,
    time: { updated: s.time.updated },
  }))
  const activeIDs = new Set(Object.keys(await client.session.active()))
  const rootID = pickRoot(sessions, activeIDs, directory)
  const ids = new Set(rootID ? selectTree(sessions, rootID) : [])

  let state: CamState = ids.size > 0 ? await seedTree(client, [...ids]) : emptyState()

  const server = startServer(() => state)
  console.log(
    `Agent Cam \u2192 ${server.url}  (watching ${directory}; ${ids.size} session(s) via ${url})`,
  )
  if (process.platform === "darwin") {
    try {
      Bun.spawn(["open", server.url])
    } catch {
      // opening the browser is a convenience; ignore failures
    }
  }

  // The signal must age even when no events arrive, or a stalled agent keeps
  // reading "working" forever. Only broadcast when that actually changed it.
  const tick = setInterval(() => {
    const before = `${state.signal.state}\u0000${state.signal.reason}`
    state = finalize(state, Date.now())
    if (`${state.signal.state}\u0000${state.signal.reason}` !== before) server.broadcast(state)
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
