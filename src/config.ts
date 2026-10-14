// Every tunable the dashboard uses, in one place, so nothing is a hidden magic
// number. These are the only "hardcoded" values in the app.

/** How often the signal is re-evaluated even when no events arrive. */
export const TICK_MS = 5_000

/** Signal reads "risky" if no successful step for this long. */
export const STALLED_AFTER_MS = 60_000

/** Signal reads "risky" if at least this fraction of tool calls failed. */
export const FAILURE_RATIO = 0.3

/** The activity feed keeps at most this many items. */
export const FEED_LIMIT = 20

/** Default local port for the dashboard. */
export const DEFAULT_PORT = 4317

/** Shown in the UI so the signal's meaning is never a mystery. */
export const SIGNAL_POLICY = {
  stalledAfterMs: STALLED_AFTER_MS,
  failureRatio: FAILURE_RATIO,
} as const
