export type ToolState = "streaming" | "running" | "completed" | "error"

export interface TokenUsage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface FileEdit {
  path: string
  // line counts are not present in the event stream; null means "unknown"
  // (see docs/agent-cam-events.md); the page omits counts when null.
  added: number | null
  removed: number | null
}

export interface RunningCommand {
  command: string
  state: ToolState
}

export interface PlanStep {
  text: string
  status: "pending" | "active" | "done"
}

export type SignalState = "waiting" | "risky" | "working" | "idle"

export interface Signal {
  state: SignalState
  reason: string
}

export interface FeedItem {
  id: string
  sessionID: string
  tool: string
  summary: string
  state: ToolState
  at: number
}

export interface CamState {
  sessionID: string | null
  currentFile: FileEdit | null
  runningCommand: RunningCommand | null
  plan: PlanStep[] | null
  signal: Signal
  feed: FeedItem[]
  tokens: TokenUsage
  tokensBySession: Record<string, TokenUsage>
  lastSuccessAt: number | null
  // whether the mirrored session tree is currently executing
  running: boolean
  // signal observables (added per ledger ruling; see progress.md pre-flight)
  toolFailures: number
  toolTotal: number
  hasPendingHuman: boolean
  // call-id → tool name, because the event stream names the tool separately
  // from its arguments (see docs/agent-cam-events.md)
  toolNames: Record<string, string>
}

export const emptyUsage = (): TokenUsage => ({
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
})

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

/** Sum per-session usage into one total. */
export const sumUsage = (bySession: Record<string, TokenUsage>): TokenUsage =>
  Object.values(bySession).reduce(addUsage, emptyUsage())

export const emptyState = (): CamState => ({
  sessionID: null,
  currentFile: null,
  runningCommand: null,
  plan: null,
  signal: { state: "idle", reason: "no active session" },
  feed: [],
  tokens: emptyUsage(),
  tokensBySession: {},
  lastSuccessAt: null,
  running: false,
  toolFailures: 0,
  toolTotal: 0,
  hasPendingHuman: false,
  toolNames: {},
})
