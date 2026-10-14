import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { emptyState, type CamState, type ToolState } from "./model"
import { applyEvent, foldEvents } from "./reducer"
import { computeSignal } from "./signal"
import { extractCommand, extractFileEdit } from "./tools"
import { pushFeed } from "./feed"

export type CamClient = ReturnType<typeof OpenCode.make>

// Re-exported so callers can fold a batch of events without reaching into
// the reducer directly.
export { foldEvents }

const STALLED_AFTER_MS = 60_000

export async function connect(): Promise<{ client: CamClient; url: string }> {
  const endpoint = await Service.ensure()
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  return { client, url: endpoint.url }
}

function toToolState(status: string): ToolState {
  switch (status) {
    case "completed":
      return "completed"
    case "error":
      return "error"
    case "running":
      return "running"
    default:
      return "streaming"
  }
}

export function finalize(state: CamState, now = Date.now()): CamState {
  state.signal = computeSignal({
    idle: state.sessionID === null,
    hasPendingHuman: state.hasPendingHuman,
    now,
    lastSuccessAt: state.lastSuccessAt,
    failed: state.toolFailures,
    total: state.toolTotal,
    stalledAfterMs: STALLED_AFTER_MS,
  })
  return state
}

/**
 * Rebuild as much state as the read endpoints allow, for the given sessions.
 * Best-effort: any session that cannot be read is skipped rather than fatal.
 */
export async function seedTree(client: CamClient, ids: string[]): Promise<CamState> {
  const state = emptyState()
  for (const id of ids) {
    if (state.sessionID === null) state.sessionID = id
    try {
      const s = await client.session.get({ sessionID: id })
      state.tokens = {
        input: state.tokens.input + s.tokens.input,
        output: state.tokens.output + s.tokens.output,
        reasoning: state.tokens.reasoning + s.tokens.reasoning,
        cacheRead: state.tokens.cacheRead + s.tokens.cache.read,
        cacheWrite: state.tokens.cacheWrite + s.tokens.cache.write,
      }
      if (s.outcome === "failed") state.toolFailures += 1
    } catch {
      // session unreadable — skip
    }
    try {
      const messages = await client.session.context({ sessionID: id })
      for (const m of messages) {
        if (m.type !== "assistant") continue
        for (const part of m.content) {
          if (part.type !== "tool") continue
          const toolState = toToolState(part.state.status)
          state.toolNames[part.id] = part.name
          const input = ("input" in part.state ? (part.state.input as Record<string, unknown>) : {})
          if (toolState === "completed") {
            const at = part.time.completed ?? part.time.created
            state.feed = pushFeed(state.feed, { id: part.id, sessionID: id, tool: part.name, summary: part.name, state: "completed", at })
            state.lastSuccessAt = Math.max(state.lastSuccessAt ?? 0, at)
            state.toolTotal += 1
          } else if (toolState === "error") {
            state.toolFailures += 1
            state.toolTotal += 1
          }
          const file = extractFileEdit({ name: part.name, state: toolState, input })
          if (file) state.currentFile = file
          const cmd = extractCommand({ name: part.name, state: toolState, input })
          if (cmd && toolState !== "completed" && toolState !== "error") state.runningCommand = cmd
        }
      }
    } catch {
      // context unreadable — skip
    }
  }
  return finalize(state)
}

function eventSessionID(event: unknown): string | undefined {
  const data = (event as { data?: Record<string, unknown> })?.data ?? {}
  if (typeof data.sessionID === "string") return data.sessionID
  const info = data.info as { metadata?: { sessionID?: string } } | undefined
  return info?.metadata?.sessionID
}

/**
 * Fold live events for the mirrored sessions into `initial`, calling `onState`
 * with the new state after each. The caller owns reconnection: this stream is
 * live-only and ends on failure (see docs/agent-cam-events.md).
 */
export async function stream(
  client: CamClient,
  ids: string[],
  initial: CamState,
  onState: (s: CamState) => void,
  signal: AbortSignal,
): Promise<void> {
  const idSet = new Set(ids)
  let state = initial
  for await (const event of client.event.subscribe({ signal })) {
    const sid = eventSessionID(event)
    if (sid !== undefined && !idSet.has(sid)) continue
    const next = applyEvent(state, event)
    if (next !== state) {
      state = next
      onState(state)
    }
  }
}
