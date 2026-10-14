import { sumUsage, type AgentInfo, type CamState, type TokenUsage, type ToolState } from "./model"
import { extractCommand, extractFileEdit, type ToolCall } from "./tools"
import { pushFeed } from "./feed"
import { computeSignal } from "./signal"
import { STALLED_AFTER_MS } from "./config"

interface RawEvent {
  type?: unknown
  created?: unknown
  data?: Record<string, unknown>
}

function cloneState(s: CamState): CamState {
  return {
    ...s,
    feed: [...s.feed],
    tokens: { ...s.tokens },
    tokensBySession: { ...s.tokensBySession },
    toolNames: { ...s.toolNames },
    agents: { ...s.agents },
  }
}

function refreshSignal(s: CamState, now: number): CamState {
  s.signal = computeSignal({
    idle: !s.running,
    hasPendingHuman: s.hasPendingHuman,
    now,
    lastSuccessAt: s.lastSuccessAt,
    failed: s.toolFailures,
    total: s.toolTotal,
    stalledAfterMs: STALLED_AFTER_MS,
  })
  return s
}

/** Upsert an agent entry for a mirrored session. */
function touch(next: CamState, id: string, patch: Partial<AgentInfo>): void {
  const existing: AgentInfo =
    next.agents[id] ?? { id, parentID: null, title: id.slice(-6), running: false, lastAction: null }
  next.agents[id] = { ...existing, ...patch }
}

function recomputeRunning(next: CamState): void {
  next.running = Object.values(next.agents).some((a) => a.running)
}

function summarize(name: string, input: Record<string, unknown>): string {
  if (typeof input.path === "string") return `${name} ${input.path}`
  if (typeof input.command === "string") return `${name} ${input.command}`
  return name
}

function readUsage(raw: unknown): TokenUsage | null {
  const t = raw as
    | { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
    | undefined
  if (!t) return null
  return {
    input: t.input ?? 0,
    output: t.output ?? 0,
    reasoning: t.reasoning ?? 0,
    cacheRead: t.cache?.read ?? 0,
    cacheWrite: t.cache?.write ?? 0,
  }
}

// Events that can only occur while a session is executing: seeing one means the
// mirrored tree is active, regardless of whether we observed its start.
const ACTIVITY_TYPES = new Set([
  "session.tool.input.started",
  "session.tool.called",
  "session.tool.success",
  "session.tool.failed",
  "shell.created",
  "permission.asked",
  "form.created",
])

function applyEventInner(state: CamState, event: unknown, now = Date.now()): CamState {
  const e = event as RawEvent
  if (typeof e?.type !== "string") return state
  const data = e.data ?? {}
  const at = typeof e.created === "number" ? e.created : now
  const sid = typeof data.sessionID === "string" ? data.sessionID : undefined

  switch (e.type) {
    case "session.tool.input.started": {
      const next = cloneState(state)
      if (sid) {
        next.sessionID = sid
        if (typeof data.id === "string" && typeof data.name === "string") next.toolNames[data.id] = data.name
      }
      if (sid && typeof data.name === "string") touch(next, sid, { running: true, lastAction: data.name })
      return refreshSignal(next, at)
    }
    case "session.tool.called": {
      const next = cloneState(state)
      if (sid) next.sessionID = sid
      const name = typeof data.id === "string" ? next.toolNames[data.id] ?? "" : ""
      const input = (data.input ?? {}) as Record<string, unknown>
      const call: ToolCall = { name, state: "running", input }
      const file = extractFileEdit(call)
      if (file) next.currentFile = file
      const cmd = extractCommand(call)
      if (cmd) next.runningCommand = cmd
      if (sid) touch(next, sid, { running: true, lastAction: summarize(name, input) })
      return refreshSignal(next, at)
    }
    case "session.tool.success": {
      const next = cloneState(state)
      if (sid) next.sessionID = sid
      const id = typeof data.id === "string" ? data.id : String(at)
      const name = next.toolNames[id] ?? "tool"
      next.feed = pushFeed(next.feed, { id, sessionID: next.sessionID ?? "", tool: name, summary: name, state: "completed", at })
      if (name === "shell") next.runningCommand = null
      delete next.toolNames[id]
      if (sid) touch(next, sid, { running: true })
      next.lastSuccessAt = at
      next.toolTotal += 1
      return refreshSignal(next, at)
    }
    case "session.tool.failed": {
      const next = cloneState(state)
      if (sid) next.sessionID = sid
      const id = typeof data.id === "string" ? data.id : String(at)
      const name = next.toolNames[id] ?? "tool"
      next.feed = pushFeed(next.feed, { id, sessionID: next.sessionID ?? "", tool: name, summary: name, state: "error", at })
      if (name === "shell") next.runningCommand = null
      delete next.toolNames[id]
      if (sid) touch(next, sid, { running: true })
      next.toolFailures += 1
      next.toolTotal += 1
      return refreshSignal(next, at)
    }
    case "session.usage.updated": {
      const next = cloneState(state)
      const usage = readUsage(data.tokens)
      const owner = sid ?? next.sessionID
      if (owner && usage) {
        next.tokensBySession[owner] = usage
        next.tokens = sumUsage(next.tokensBySession)
        next.sessionID = owner
      }
      return next
    }
    case "shell.created": {
      const next = cloneState(state)
      const info = data.info as { command?: string; status?: string; metadata?: { sessionID?: string } } | undefined
      const owner = info?.metadata?.sessionID
      if (info && typeof info.command === "string") {
        const st: ToolState = info.status === "exited" ? "completed" : "running"
        next.runningCommand = { command: info.command, state: st }
      }
      if (owner) {
        next.sessionID = owner
        if (typeof info?.command === "string") touch(next, owner, { running: true, lastAction: `shell ${info.command}` })
      }
      return refreshSignal(next, at)
    }
    case "shell.exited":
    case "shell.deleted": {
      const next = cloneState(state)
      next.runningCommand = null
      return refreshSignal(next, at)
    }
    case "session.created": {
      const next = cloneState(state)
      if (sid) {
        const parentID = typeof data.parentID === "string" ? data.parentID : null
        const title = typeof data.title === "string" && data.title ? data.title : typeof data.slug === "string" && data.slug ? data.slug : sid.slice(-6)
        touch(next, sid, { parentID, title, running: true })
        recomputeRunning(next)
      }
      return refreshSignal(next, at)
    }
    case "session.execution.started": {
      const next = cloneState(state)
      if (sid) {
        next.sessionID = sid
        touch(next, sid, { running: true })
      }
      recomputeRunning(next)
      return refreshSignal(next, at)
    }
    case "session.execution.succeeded":
    case "session.execution.failed":
    case "session.execution.interrupted":
    case "session.idle": {
      const next = cloneState(state)
      if (sid) touch(next, sid, { running: false })
      recomputeRunning(next)
      return refreshSignal(next, at)
    }
    case "permission.asked":
    case "form.created": {
      const next = cloneState(state)
      if (sid) next.sessionID = sid
      next.hasPendingHuman = true
      return refreshSignal(next, at)
    }
    case "permission.replied":
    case "form.replied":
    case "form.cancelled": {
      const next = cloneState(state)
      next.hasPendingHuman = false
      return refreshSignal(next, at)
    }
    case "session.text.ended": {
      const next = cloneState(state)
      const text = data.text
      // the agent's plan is its own prose; keep the longest block we have seen
      if (typeof text === "string" && text.length > 0 && (next.planText === null || text.length > next.planText.length)) {
        next.planText = text
      }
      return next
    }
    default:
      return state
  }
}

function eventSessionID(e: RawEvent): string | undefined {
  const data = e.data ?? {}
  if (typeof data.sessionID === "string") return data.sessionID
  const info = data.info as { metadata?: { sessionID?: string } } | undefined
  return info?.metadata?.sessionID
}

export function applyEvent(state: CamState, event: unknown, now = Date.now()): CamState {
  const next = applyEventInner(state, event, now)
  const e = event as RawEvent
  if (next !== state) {
    // lock onto the first session we see; the header must not follow subagents
    if (next.rootID === null) {
      const sid = eventSessionID(e)
      if (sid) next.rootID = sid
    }
    if (typeof e?.type === "string" && ACTIVITY_TYPES.has(e.type) && !next.running) {
      next.running = true
      return refreshSignal(next, typeof e.created === "number" ? e.created : now)
    }
  }
  return next
}

export function foldEvents(state: CamState, events: unknown[], now?: number): CamState {
  let s = state
  for (const ev of events) {
    const created = (ev as RawEvent)?.created
    s = applyEvent(s, ev, now ?? (typeof created === "number" ? created : Date.now()))
  }
  return s
}
