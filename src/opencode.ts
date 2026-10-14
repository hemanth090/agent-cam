import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { emptyState, sumUsage, type CamState, type TokenUsage, type ToolState } from "./model"
import { applyEvent, foldEvents } from "./reducer"
import { computeSignal } from "./signal"
import { extractCommand, extractFileEdit } from "./tools"
import { pushFeed } from "./feed"
import { STALLED_AFTER_MS } from "./config"

export type CamClient = ReturnType<typeof OpenCode.make>

// Re-exported so callers can fold a batch of events without reaching into
// the reducer directly.
export { foldEvents }

export async function connect(): Promise<{ client: CamClient; url: string }> {
  const endpoint = await Service.ensure()
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  return { client, url: endpoint.url }
}

type SessionPage = Awaited<ReturnType<CamClient["session"]["list"]>>
export type SessionRow = SessionPage["data"][number]

// The generated SessionListInput type is misleading; the API honors a flat
// { limit, cursor } (verified against v2.0.29).
type ListInput = { limit?: number; cursor?: string }
type ListFn = (input?: ListInput, options?: unknown) => Promise<SessionPage>

/** List every session, following the cursor to the last page. */
export async function listAllSessions(client: CamClient): Promise<SessionRow[]> {
  const list = client.session.list as unknown as ListFn
  const all: SessionRow[] = []
  let cursor: string | undefined
  for (let page = 0; page < 50; page++) {
    const res = await list({ limit: 200, cursor })
    all.push(...res.data)
    const next = res.cursor?.next ?? undefined
    if (!next || res.data.length === 0) break
    cursor = next
  }
  return all
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

function toUsage(t: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }): TokenUsage {
  return { input: t.input, output: t.output, reasoning: t.reasoning, cacheRead: t.cache.read, cacheWrite: t.cache.write }
}

export function finalize(state: CamState, now = Date.now()): CamState {
  state.signal = computeSignal({
    idle: !state.running,
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

  const active = await client.session.active().catch(() => ({}) as Record<string, unknown>)
  state.running = ids.some((id) => id in active)
  state.rootID = ids[0] ?? null

  for (const id of ids) {
    if (state.sessionID === null) state.sessionID = id

    try {
      const s = await client.session.get({ sessionID: id })
      state.tokensBySession[id] = toUsage(s.tokens)
      state.agents[id] = {
        id,
        parentID: s.parentID ?? null,
        title: s.title ?? id.slice(-6),
        running: id in active,
        lastAction: null,
      }
      if (s.outcome === "failed") state.toolFailures += 1
    } catch {
      // session unreadable — skip
    }

    try {
      const perms = await client.permission.list({ sessionID: id })
      if (perms.length > 0) state.hasPendingHuman = true
    } catch {
      // permission read unavailable — skip
    }

    try {
      const forms = await client.session.form.list({ sessionID: id })
      if (forms.length > 0) state.hasPendingHuman = true
    } catch {
      // form read unavailable — skip
    }

    try {
      const messages = await client.session.context({ sessionID: id })
      for (const m of messages) {
        if (m.type !== "assistant") continue
        for (const part of m.content) {
          if (part.type === "text") {
            // the agent's plan is its own prose; keep the longest block
            if (state.planText === null || part.text.length > state.planText.length) state.planText = part.text
            continue
          }
          if (part.type !== "tool") continue
          const toolState = toToolState(part.state.status)
          const input = "input" in part.state ? (part.state.input as Record<string, unknown>) : {}
          if (toolState === "completed") {
            const at = part.time.completed ?? part.time.created
            state.feed = pushFeed(state.feed, { id: part.id, sessionID: id, tool: part.name, summary: part.name, state: "completed", at })
            state.lastSuccessAt = Math.max(state.lastSuccessAt ?? 0, at)
            state.toolTotal += 1
          } else if (toolState === "error") {
            state.toolFailures += 1
            state.toolTotal += 1
          } else {
            state.toolNames[part.id] = part.name
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

  state.tokens = sumUsage(state.tokensBySession)
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
 * with the new state after each. Newly created child sessions of a mirrored
 * session are adopted into `ids`. The caller owns reconnection: this stream is
 * live-only and ends on failure (see docs/agent-cam-events.md).
 */
export async function stream(
  client: CamClient,
  ids: Set<string>,
  initial: CamState,
  onState: (s: CamState) => void,
  signal: AbortSignal,
): Promise<void> {
  const shellSession = new Map<string, string>()
  let state = initial

  for await (const event of client.event.subscribe({ signal })) {
    const e = event as { type?: string; data?: Record<string, unknown> }
    const type = e?.type

    if (type === "session.created") {
      // adopt a child of a mirrored session, then let the reducer record it
      const childID = e.data?.sessionID
      const parentID = e.data?.parentID
      if (typeof childID === "string" && typeof parentID === "string" && ids.has(parentID)) ids.add(childID)
    }

    if (type === "shell.created") {
      // record ownership for every shell, so we can later tell whose exit it is
      const info = e.data?.info as { id?: string; metadata?: { sessionID?: string } } | undefined
      const owner = info?.metadata?.sessionID
      if (typeof info?.id === "string" && owner) shellSession.set(info.id, owner)
      if (owner !== undefined && !ids.has(owner)) continue
    } else if (type === "shell.exited" || type === "shell.deleted") {
      const key = e.data?.id
      const owner = typeof key === "string" ? shellSession.get(key) : undefined
      if (typeof key === "string") shellSession.delete(key)
      if (owner !== undefined && !ids.has(owner)) continue
    } else {
      const sid = eventSessionID(event)
      if (sid !== undefined && !ids.has(sid)) continue
    }

    const next = applyEvent(state, event)
    if (next !== state) {
      state = next
      onState(state)
    }
  }
}
