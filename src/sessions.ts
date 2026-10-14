export interface SessionNode {
  id: string
  parentID?: string | null
  directory?: string | null
  time: { updated: number }
}

/**
 * Choose the session to watch: prefer the launch directory, and within that the
 * most recently updated *running* session; fall back to the newest session.
 */
export function pickRoot(sessions: SessionNode[], activeIDs: Set<string>, directory: string | null): string | null {
  if (sessions.length === 0) return null

  let pool = sessions
  if (directory) {
    const scoped = sessions.filter((s) => s.directory === directory || s.directory?.startsWith(`${directory}/`))
    if (scoped.length > 0) pool = scoped
  }

  const running = pool.filter((s) => activeIDs.has(s.id))
  const newest = (rows: SessionNode[]) => rows.reduce((a, b) => (b.time.updated > a.time.updated ? b : a))
  return (running.length > 0 ? newest(running) : newest(pool)).id
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
