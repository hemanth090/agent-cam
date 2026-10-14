# Agent Cam

A local, live dashboard that mirrors what your own OpenCode agent is doing, so
you can stop reading terminal scroll.

Panels: **current file**, **running command**, **plan**, **signal** (an honest
momentum/risk light), **tokens**, and a recent **feed**. It updates in real time
over a local WebSocket.

## Run

```sh
bun install
bun start            # serves http://127.0.0.1:4317/ and opens your browser
bun start --directory /path/to/project   # (parsed; not yet scope-applied)
bun test             # unit + integration tests
```

It finds your running OpenCode background service automatically
(`opencode service status`), mirrors the active session **and its subagents**,
and streams live events.

## What it does and does not show

- Everything shown is **observed** from OpenCode. There is no invented
  "confidence" score; the signal comes from real tool outcomes, retries, and
  time since the last successful step.
- Line counts (`+n −m`) are omitted when unknown, rather than shown as `+0 −0`.
- The **Plan** panel says "no plan" unless the agent exposes a task list, which
  is often not the case.

## Limitations

- **Local only.** The server binds to `127.0.0.1`; nothing is exposed and the
  page holds no OpenCode credentials. It is a personal instrument, not a
  shareable stream.
- **Standalone servers are not visible.** If you run your agent with a private
  server (`opencode --standalone`), `Service.ensure()` will not see it and the
  dashboard will have nothing to mirror. Use the normal shared background
  service.

## How it works

A single Bun/TypeScript process:

1. Discovers the local OpenCode service (`@opencode/client` + `/service`).
2. Seeds the active session tree from the read endpoints.
3. Subscribes to the live `/api/event` stream and folds events into a small
   pure state model.
4. Pushes that model to a plain HTML page over a local WebSocket.

The live stream has no replay and no reconnection, so the process re-seeds and
resubscribes on any drop. See `docs/agent-cam-events.md` for the observed event
shapes.
