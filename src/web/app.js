const $ = (id) => document.getElementById(id);

const el = {
  topbar: document.querySelector(".topbar"),
  grid: $("grid"),
  dot: $("dot"),
  updated: $("updated"),
  scopeTitle: $("scope-title"),
  scopeCounts: $("scope-counts"),
  file: $("file"),
  fileDiff: $("file-diff"),
  command: $("command"),
  plan: $("plan"),
  tokens: $("tokens"),
  tokensSub: $("tokens-sub"),
  agentsCount: $("agents-count"),
  agents: $("agents"),
  signalDot: $("signal-dot"),
  signalState: $("signal-state"),
  signalReason: $("signal-reason"),
  signalCaption: $("signal-caption"),
  feed: $("feed"),
};

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const totalTokens = (t) => t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;

/* ---- minimal DOM helpers: only touch the node when the value changed ---- */

function setText(node, value) {
  if (node._v !== value) {
    node._v = value;
    node.textContent = value;
  }
}

function setData(node, name, value) {
  if (node._d === undefined) node._d = {};
  if (node._d[name] !== value) {
    node._d[name] = value;
    node.dataset[name] = value;
  }
}

function toggleClass(node, cls, on) {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

/* ---- keyed list: reuse nodes by id so unchanged rows never re-mount ---- */

function reconcile(container, items, nodes, create, update) {
  const present = new Set();
  let prev = null;
  for (const item of items) {
    present.add(item.id);
    let node = nodes.get(item.id);
    if (!node) {
      node = create(item);
      nodes.set(item.id, node);
    }
    update(node, item);
    const next = prev ? prev.nextSibling : container.firstChild;
    if (node !== next) container.insertBefore(node, next);
    prev = node;
  }
  for (const [id, node] of nodes) {
    if (!present.has(id)) {
      node.remove();
      nodes.delete(id);
    }
  }
}

/* ---- sessions panel: the main session first, then its subagents ---- */

const agentNodes = new Map();
let agentsEmpty = null;

function renderAgents(agents, rootID) {
  const sorted = agents
    .slice()
    .sort(
      (a, b) =>
        Number(a.id === rootID ? 0 : 1) - Number(b.id === rootID ? 0 : 1) ||
        Number(b.running) - Number(a.running) ||
        a.title.localeCompare(b.title),
    );

  if (sorted.length === 0) {
    if (!agentsEmpty) {
      agentsEmpty = document.createElement("li");
      agentsEmpty.className = "muted";
      setText(agentsEmpty, "no sessions");
      el.agents.appendChild(agentsEmpty);
    }
    for (const [, node] of agentNodes) node.remove();
    agentNodes.clear();
    return;
  }
  if (agentsEmpty) {
    agentsEmpty.remove();
    agentsEmpty = null;
  }

  reconcile(
    el.agents,
    sorted,
    agentNodes,
    (a) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="agent-dot"></span><span class="agent-title"></span><span class="agent-tag"></span><span class="agent-action"></span>`;
      li.dataset.id = a.id;
      return li;
    },
    (li, a) => {
      const isRoot = a.id === rootID;
      toggleClass(li.children[0], "running", a.running);
      setText(li.children[1], a.title);
      setText(li.children[2], isRoot ? "main" : "subagent");
      toggleClass(li.children[2], "tag-main", isRoot);
      setText(li.children[3], a.lastAction || "");
      toggleClass(li.children[3], "hidden", !a.lastAction);
    },
  );
}

const feedNodes = new Map();

function renderFeed(feed) {
  reconcile(
    el.feed,
    feed,
    feedNodes,
    () => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="tool"></span><span class="feed-session"></span>`;
      return li;
    },
    (li, f) => {
      setText(li.children[0], f.tool);
      toggleClass(li.children[0], "state-error", f.state === "error");
      setText(li.children[1], (f.sessionID || "").slice(-6));
    },
  );
}

/* ---- liveness cue: a shimmer sweep on the header for every update ---- */

let lastUpdate = 0;
let firstRender = true;

function ping() {
  lastUpdate = Date.now();
  if (firstRender) {
    firstRender = false;
    el.grid.classList.remove("loading");
  }
  // restart the sweep animation
  el.topbar.classList.remove("sweep");
  void el.topbar.offsetWidth;
  el.topbar.classList.add("sweep");
}

setInterval(() => {
  if (lastUpdate === 0) return;
  const secs = Math.round((Date.now() - lastUpdate) / 1000);
  setText(el.updated, secs <= 1 ? "updated just now" : `updated ${secs}s ago`);
}, 1000);

/* ---- top-level render: each field is set only when it changed ---- */

function render(state) {
  ping();
  const agents = Object.values(state.agents || {});
  const running = agents.filter((a) => a.running).length;
  const root = agents.find((a) => a.id === state.rootID);

  setText(el.scopeTitle, root ? root.title : state.rootID ? state.rootID.slice(-6) : "no active session");
  setText(el.scopeCounts, agents.length ? `${agents.length} sessions · ${running} active` : "");

  if (state.currentFile) {
    setText(el.file, state.currentFile.path);
    const { added, removed } = state.currentFile;
    setText(el.fileDiff, added === null || removed === null ? "" : `+${added} −${removed}`);
  } else {
    setText(el.file, "—");
    setText(el.fileDiff, "");
  }

  setText(el.command, state.runningCommand ? `$ ${state.runningCommand.command}` : "—");

  setText(el.signalState, state.signal.state);
  setText(el.signalReason, state.signal.reason);
  setData(el.signalDot, "state", state.signal.state);
  if (state.policy) {
    setText(
      el.signalCaption,
      `risky after ${Math.round(state.policy.stalledAfterMs / 1000)}s without a successful step, or ≥${Math.round(
        state.policy.failureRatio * 100,
      )}% failed calls`,
    );
  }

  if (state.rootID === null) {
    setText(el.tokens, "—");
    setText(el.tokensSub, "");
  } else {
    const t = state.tokens;
    setText(el.tokens, `${fmt(totalTokens(t))} tok`);
    setText(el.tokensSub, `across ${agents.length} sessions · in ${fmt(t.input)} · out ${fmt(t.output)} · cache ${fmt(t.cacheRead + t.cacheWrite)}`);
  }

  setText(el.agentsCount, `${agents.length} sessions`);
  renderAgents(agents, state.rootID);

  if (state.planText) {
    toggleClass(el.plan, "muted", false);
    setText(el.plan, state.planText);
  } else {
    toggleClass(el.plan, "muted", true);
    setText(el.plan, "no plan");
  }

  renderFeed(state.feed);
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => setData(el.dot, "state", "connected");
  ws.onclose = () => {
    setData(el.dot, "state", "disconnected");
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") render(msg.state);
  };
}

connect();
