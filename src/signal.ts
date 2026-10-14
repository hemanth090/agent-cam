import type { Signal } from "./model"
import { FAILURE_RATIO } from "./config"

export interface SignalInput {
  idle: boolean
  hasPendingHuman: boolean
  now: number
  lastSuccessAt: number | null
  failed: number
  total: number
  stalledAfterMs: number
}

export function computeSignal(input: SignalInput): Signal {
  if (input.idle) return { state: "idle", reason: "no active session" }
  if (input.hasPendingHuman) return { state: "waiting", reason: "waiting on you" }
  if (input.lastSuccessAt === null) return { state: "risky", reason: "no successful step yet" }
  if (input.now - input.lastSuccessAt > input.stalledAfterMs) {
    return { state: "risky", reason: "no progress for a while" }
  }
  if (input.total > 0 && input.failed / input.total >= FAILURE_RATIO) {
    return { state: "risky", reason: "many failed steps" }
  }
  return { state: "working", reason: "making progress" }
}
