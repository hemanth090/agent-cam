// Realistic event payloads, transcribed from docs/agent-cam-events.md.

const loc = { directory: "/work" }

export const writeStarted = {
  type: "session.tool.input.started",
  created: 1000,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_w", name: "write" },
}
export const writeCalled = {
  type: "session.tool.called",
  created: 1002,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_w", input: { path: "src/a.ts", content: "x" }, executed: false },
}
export const writeSuccess = {
  type: "session.tool.success",
  created: 1005,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_w", content: [{ type: "text", text: "ok" }], metadata: {}, executed: false },
}

export const shellStarted = {
  type: "session.tool.input.started",
  created: 1010,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_s", name: "shell" },
}
export const shellCalled = {
  type: "session.tool.called",
  created: 1012,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_s", input: { command: "pnpm test" }, executed: false },
}
export const shellToolSuccess = {
  type: "session.tool.success",
  created: 1020,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_s", content: [], metadata: {}, executed: false },
}

export const shellCreatedEvent = {
  type: "shell.created",
  created: 1013,
  location: loc,
  data: { info: { id: "sh1", status: "running", command: "pnpm test", cwd: "/work", metadata: { sessionID: "s" }, time: { started: 1013 } } },
}
export const shellExitedEvent = {
  type: "shell.exited",
  created: 1021,
  location: loc,
  data: { id: "sh1", exit: 0, status: "exited" },
}

export const usageUpdate = {
  type: "session.usage.updated",
  created: 1030,
  data: { sessionID: "s", cost: 0.1, tokens: { input: 258, output: 99, reasoning: 65, cache: { read: 5120, write: 0 } } },
}

export const usageUpdateChild = {
  type: "session.usage.updated",
  created: 1031,
  data: { sessionID: "child", cost: 0.05, tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } },
}

export const executionStarted = { type: "session.execution.started", created: 1100, data: { sessionID: "s" } }
export const executionSucceeded = { type: "session.execution.succeeded", created: 1110, data: { sessionID: "s" } }

export const permissionAsked = { type: "permission.asked", created: 1120, data: { sessionID: "s", requestID: "p1" } }
export const permissionReplied = { type: "permission.replied", created: 1130, data: { sessionID: "s", requestID: "p1" } }
export const formCreated = { type: "form.created", created: 1140, data: { sessionID: "s", formID: "f1" } }
export const formReplied = { type: "form.replied", created: 1150, data: { sessionID: "s", formID: "f1" } }

export const toolFailed = {
  type: "session.tool.failed",
  created: 1160,
  location: loc,
  data: { sessionID: "s", assistantMessageID: "m", id: "call_w", error: { type: "x", message: "nope" } },
}

export const textEndedShort = {
  type: "session.text.ended",
  created: 1200,
  data: { sessionID: "s", assistantMessageID: "m", ordinal: 0, text: "Done." },
}
export const textEndedLong = {
  type: "session.text.ended",
  created: 1201,
  data: {
    sessionID: "s",
    assistantMessageID: "m",
    ordinal: 1,
    text: "My plan: first read the config, then patch session.ts, then add a regression test.",
  },
}

export const sessionCreatedChild = {
  type: "session.created",
  created: 1210,
  data: { sessionID: "child", parentID: "s", title: "Child work", agent: "general" },
}
export const childExecutionStarted = { type: "session.execution.started", created: 1211, data: { sessionID: "child" } }
export const childExecutionSucceeded = { type: "session.execution.succeeded", created: 1212, data: { sessionID: "child" } }

export const unknownEvent = { type: "totally.made.up", created: 1040, data: {} }
