export interface SessionNode {
  id: string
  parentID?: string | null
  time: { updated: number }
}

/**
 * Returns the session to mirror followed by all of its descendants (subagents),
 * breadth-first. Falls back to the most recently updated session when no active
 * session is given.
 */
export function selectTree(sessions: SessionNode[], activeID: string | null): string[] {
  if (sessions.length === 0) return []

  const root =
    (activeID !== null ? sessions.find((s) => s.id === activeID) : undefined) ??
    sessions.reduce((a, b) => (b.time.updated > a.time.updated ? b : a))

  const result: string[] = []
  const queue: string[] = [root.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (result.includes(id)) continue
    result.push(id)
    for (const child of sessions) {
      if (child.parentID === id && !result.includes(child.id)) queue.push(child.id)
    }
  }
  return result
}
