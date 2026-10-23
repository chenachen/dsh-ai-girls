import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { startHost } from "../../src/host-runtime.js";
import { inject } from "../../src/index.js";

// Explicit integration command: uses installed official DSH, no UI or model calls.
const modules =
  process.env.DSH_NODE_MODULES ??
  join(homedir(), ".dsh", "profiles", "node_modules");
const load = (name) =>
  import(
    pathToFileURL(join(modules, "@deepseek-ai", name, "lib", "index.js")).href
  );
const [
  { Context },
  { SessionStore },
  { AgentRegistry, emitAgentEvent },
  { SessionProjectionRegistry },
  { SessionTitleService },
  { createScope, scopeTarget },
] = await Promise.all(
  [
    "cordis",
    "dsh-session",
    "dsh-agent",
    "dsh-session-projection",
    "dsh-session-title",
    "dsh-scope",
  ].map(load),
);

async function fixture(t) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  for (const [plugin, config] of [
    [SessionStore],
    [AgentRegistry],
    [SessionProjectionRegistry],
    [
      SessionTitleService,
      { fallbackMaxWords: 12, fallbackMaxBytes: 160, maxTitleBytes: 240 },
    ],
  ]) {
    const fiber = ctx.plugin(plugin, config);
    await fiber.inertia;
    assert.equal(fiber.state, 2, plugin.name + " active");
  }
  let driver;
  const driverFiber = ctx.plugin({
    inject: ["sessions", "agents"],
    apply: (child) => {
      driver = child;
    },
  });
  await driverFiber.inertia;
  const snapshots = [];
  let closes = 0,
    launches = 0,
    options;
  const runtime = {
    platform: "win32",
    existsSync: () => true,
    launchDesktop: (_exe, callbacks) => {
      launches++;
      options = callbacks;
      return {
        send: (s) => snapshots.push(structuredClone(s)),
        dispose: async () => {
          closes++;
          await new Promise((r) => setTimeout(r, 5));
        },
      };
    },
  };
  const agent = (id, status = "running", meta = {}) => {
    const agent = {
      id,
      status,
      cancel: () => {
        throw new Error("observer must not cancel");
      },
    };
    const scope = createScope(driver, agent);
    agent.ctx = scope.ctx;
    agent.session = scope.ctx.sessions.create(id, {
      meta: { cwd: process.cwd(), ...meta },
    });
    ctx.agents.enter(agent, undefined);
    return agent;
  };
  const mount = async () => {
    const fiber = ctx.plugin({
      name: "ai-girls-test",
      inject,
      apply: (child) => startHost(child, {}, runtime),
    });
    await fiber.inertia;
    assert.equal(fiber.state, 2);
    return fiber;
  };
  return {
    ctx,
    agent,
    mount,
    snapshots,
    get last() {
      return snapshots.at(-1);
    },
    get closes() {
      return closes;
    },
    get launches() {
      return launches;
    },
    get options() {
      return options;
    },
    emitAgentEvent,
  };
}

test("actual Cordis startup replays current tools; global session changes and unload work", async (t) => {
  const f = await fixture(t),
    a = f.agent("A"),
    b = f.agent("B");
  a.session.append("turn/start", { turn: 1 });
  a.session.append("tool/call", {
    turn: 1,
    step: 1,
    callId: "read",
    name: "read_file",
    arguments: '{"path":"README.md"}',
  });
  b.session.append("turn/start", { turn: 1 });
  const plugin = await f.mount();
  assert.equal(
    f.launches,
    1,
    "launch must occur without a fabricated ready event",
  );
  assert.equal(f.last.tasks.length, 2);
  assert.equal(f.last.tasks.find((x) => x.id === "A").stage, "正在读取");
  assert.ok(f.last.tasks[0].startedAt > 0);
  b.session.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  assert.deepEqual(
    f.last.tasks.map((x) => x.state),
    ["running", "completed"],
  );
  f.emitAgentEvent(f.ctx, a, "agent/assistant-stream", {
    agent: a,
    frame: { type: "chunk" },
  });
  f.options.onMessage({ type: "ready" });
  assert.equal(f.last.tasks.length, 2);
  await plugin.dispose();
  assert.equal(f.closes, 1);
  const count = f.snapshots.length;
  a.session.append("turn/end", {
    turn: 1,
    reason: { kind: "aborted", reason: { kind: "user" } },
  });
  assert.equal(f.snapshots.length, count, "listeners detached after unload");
});

test("question observer preserves answer/errors and remains scoped to the supplied agent", async (t) => {
  const f = await fixture(t),
    a = f.agent("A"),
    b = f.agent("B");
  a.session.append("turn/start", { turn: 1 });
  b.session.append("turn/start", { turn: 1 });
  await f.mount();
  let resolveAnswer;
  const answer = { answers: [{ id: "color", value: "blue" }] };
  const pending = f.ctx.waterfall(
    scopeTarget(a, a),
    "user-questions/request",
    { agent: a, questions: [{ id: "color" }] },
    () => new Promise((r) => (resolveAnswer = r)),
  );
  assert.equal(f.last.tasks.find((x) => x.id === "A").state, "input");
  assert.equal(f.last.tasks.find((x) => x.id === "B").state, "running");
  resolveAnswer(answer);
  assert.equal(await pending, answer);
  assert.equal(f.last.tasks.find((x) => x.id === "A").state, "running");
  const failure = new Error("question canceled");
  await assert.rejects(
    f.ctx.waterfall(
      scopeTarget(b, b),
      "user-questions/request",
      { agent: b, questions: [] },
      () => Promise.reject(failure),
    ),
    (error) => error === failure,
  );
  assert.equal(f.last.tasks.find((x) => x.id === "B").state, "running");
});

test("reload recovers pending approval and ignores idle historical completions", async (t) => {
  const f = await fixture(t),
    a = f.agent("A"),
    b = f.agent("B", "idle");
  a.session.append("turn/start", { turn: 1 });
  a.session.append("tool/call", {
    turn: 1,
    step: 1,
    callId: "write",
    name: "write_file",
    arguments: '{"path":"test.txt"}',
  });
  a.session.append("approval/asked", {
    id: "approval",
    toolName: "write_file",
    callId: "write",
    reason: "test",
  });
  b.session.append("turn/start", { turn: 1 });
  b.session.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  const first = await f.mount();
  assert.equal(f.last.tasks.length, 1);
  assert.equal(f.last.tasks[0].state, "approval");
  await first.dispose();
  const second = await f.mount();
  assert.equal(f.launches, 2);
  assert.equal(f.closes, 1);
  assert.equal(f.last.tasks[0].state, "approval");
  a.session.append("approval/decided", {
    id: "approval",
    outcome: "allowed-once",
  });
  assert.equal(f.last.tasks[0].stage, "正在修改");
  await second.dispose();
});

test("unloading observer does not cancel or consume a pending user answer", async (t) => {
  const f = await fixture(t),
    agent = f.agent("A");
  agent.session.append("turn/start", { turn: 1 });
  const plugin = await f.mount();
  let resolveAnswer;
  const pending = f.ctx.waterfall(
    scopeTarget(agent, agent),
    "user-questions/request",
    { agent, questions: [{ id: "answer" }] },
    () =>
      new Promise((resolve) => {
        resolveAnswer = resolve;
      }),
  );
  assert.equal(f.last.tasks[0].state, "input");
  await plugin.dispose();
  assert.equal(f.closes, 1);
  const count = f.snapshots.length,
    answer = { answers: [] };
  resolveAnswer(answer);
  assert.equal(await pending, answer);
  assert.equal(f.snapshots.length, count);
});
