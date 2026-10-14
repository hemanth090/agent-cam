const $ = (id) => document.getElementById(id);

const el = {
  dot: $("dot"),
  session: $("session"),
  file: $("file"),
  fileDiff: $("file-diff"),
  command: $("command"),
  plan: $("plan"),
  signalDot: $("signal-dot"),
  signalState: $("signal-state"),
  signalReason: $("signal-reason"),
  tokens: $("tokens"),
  feed: $("feed"),
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function formatTokens(t) {
  const total = t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

function render(state) {
  el.session.textContent = state.sessionID ?? "no active session";

  if (state.currentFile) {
    el.file.textContent = state.currentFile.path;
    const { added, removed } = state.currentFile;
    el.fileDiff.textContent = added === null || removed === null ? "" : `+${added} \u2212${removed}`;
  } else {
    el.file.textContent = "\u2014";
    el.fileDiff.textContent = "";
  }

  el.command.textContent = state.runningCommand ? `$ ${state.runningCommand.command}` : "\u2014";

  if (state.plan && state.plan.length) {
    el.plan.classList.remove("muted");
    el.plan.innerHTML = state.plan
      .map((p) => `<div class="plan-step ${p.status}">${escapeHtml(p.text)}</div>`)
      .join("");
  } else {
    el.plan.classList.add("muted");
    el.plan.textContent = "no plan";
  }

  el.signalState.textContent = state.signal.state;
  el.signalReason.textContent = state.signal.reason;
  el.signalDot.dataset.state = state.signal.state;

  el.tokens.textContent = state.sessionID === null ? "\u2014" : `${formatTokens(state.tokens)} tok`;

  el.feed.innerHTML = state.feed
    .map(
      (f) =>
        `<li><span class="tool">${escapeHtml(f.tool)}</span> <span class="muted">\u00b7 ${escapeHtml(
          (f.sessionID || "").slice(-6),
        )}</span></li>`,
    )
    .join("");
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    el.dot.dataset.state = "connected";
  };
  ws.onclose = () => {
    el.dot.dataset.state = "disconnected";
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") render(msg.state);
  };
}

connect();
