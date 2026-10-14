import type { FileEdit, RunningCommand, ToolState } from "./model"

// A normalized tool call, assembled by the reducer from the OpenCode event
// stream (`session.tool.input.started` → `.called` → `.success`).
export interface ToolCall {
  name: string
  state: ToolState
  input?: Record<string, unknown>
}

const FILE_TOOLS = new Set(["write", "edit"])

export function extractFileEdit(tool: ToolCall): FileEdit | null {
  if (!FILE_TOOLS.has(tool.name)) return null
  const path = tool.input?.path
  if (typeof path !== "string" || path.length === 0) return null
  // The event stream carries no line counts; unknown is null, not zero.
  return { path, added: null, removed: null }
}

export function extractCommand(tool: ToolCall): RunningCommand | null {
  if (tool.name !== "shell") return null
  const command = tool.input?.command
  if (typeof command !== "string" || command.length === 0) return null
  return { command, state: tool.state }
}
