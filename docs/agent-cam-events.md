# OpenCode V2 event stream - observed shapes

Recorded by `scripts/probe-events.ts` (Task 2) against a live service
(`opencode service status` → `http://127.0.0.1:<port>`), watching a subagent
session that wrote a file and ran `ls -la`.

Reproduce:

```bash
# terminal 1
bun scripts/probe-events.ts
# terminal 2: make an agent edit a file and run a shell command
```

The client's `client.event.subscribe()` yields the event object directly (the
SSE `data` field, already JSON-parsed).

## Envelope

```json
{
  "id": "evt_...",
  "created": 1791983034824,          // ms epoch
  "type": "session.tool.called",
  "location": { "directory": "/abs/path" },
  "data": { "...": "varies by type" },
  "durable": { "aggregateID": "ses_...", "seq": 13, "version": 1 }
}
```

`data.sessionID` identifies the session (may be a child/subagent session).

## Event catalog (observed)

| type | key `data` fields | drives |
|---|---|---|
| `session.created` | session info | session tree |
| `session.execution.started` / `.succeeded` | `sessionID` | session active/idle |
| `session.step.started` / `.ended` | `sessionID` | pacing |
| `session.tool.input.started` | `sessionID`, `assistantMessageID`, `id` (call id), `name` (tool) | tool begins → **streaming** |
| `session.tool.input.ended` | `sessionID`, `id`, `text` (raw JSON string of args) | args complete |
| `session.tool.called` | `sessionID`, `id`, `input` (parsed args), `executed` | tool runs → **running** |
| `session.tool.progress` | `sessionID`, `id`, `metadata.status` | live progress |
| `session.tool.success` | `sessionID`, `id`, `content`, `metadata`, `executed` | tool done → **completed** |
| `session.tool.*` (error) | - | **not observed**; handle unknown types gracefully |
| `session.usage.updated` | `sessionID`, `cost`, `tokens.{input,output,reasoning,cache.{read,write}}` | **tokens** panel |
| `shell.created` | `info.{id,status:"running",command,cwd,file,metadata.sessionID,time.started}` | **running command** |
| `shell.exited` | `id`, `exit`, `status` | command finished |
| `shell.deleted` | `id` | command gone |
| `session.text.delta` / `.started` / `.ended` | `sessionID`, text | feed/prose (optional) |
| `session.reasoning.delta` / `.started` / `.ended` | `sessionID` | ignore for v1 |
| `session.inbox.enqueued` / `.delivered` | `sessionID` | user input admitted |
| `server.connected` | `{}` | connection marker (sent on subscribe) |

Not observed in this capture (their types are unknown until they occur):
tool **failure**, **permission** requests, **form** requests. The reducer must
ignore any unrecognized `type` without throwing.

## Findings that change the plan

1. **Tool names**: `write` (file creation/edit) and `shell` (commands); also
   `subagent`. There is no unified `{name,state,input,output}` tool object -
   state is spread across `input.started` → `called` → `success`.
2. **No added/removed line counts** on any tool event. The `session.diff`
   endpoint is the only source of diffs. So `FileEdit.added/removed` must be
   `number | null`; when unknown, the page omits the counts rather than showing
   `+0 −0` (honesty rule).
3. **Running command** is best read from `shell.created` (`info.command`,
   `info.status`) and cleared on `shell.exited`/`shell.deleted`; the `shell`
   tool's `session.tool.called.input.command` corroborates it.
4. **Token usage** arrives in `session.usage.updated` with per-update values
   (`input/output/reasoning/cache`). Treat as the session's running totals
   (latest per session) unless later evidence shows deltas.
5. **Failure event name is unknown.** The signal panel's `failed` count must be
   derived from tool events we do know, and unknown types ignored.
