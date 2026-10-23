import test from "node:test";
import assert from "node:assert/strict";
import { executionProjection as p } from "../src/execution-projection.js";
import { TaskStore } from "../src/task-store.js";

test("projection rehydrates executing tool and pending approval without raw arguments", () => {
  let state = p.init({ id: "A" });
  const events = [
    ["turn/start", { turn: 1 }],
    [
      "tool/call",
      {
        turn: 1,
        callId: "x",
        name: "bash",
        arguments: '{"command":"npm test --token PRIVATE"}',
      },
    ],
    ["approval/asked", { id: "q", toolName: "bash" }],
  ];
  events.forEach(([type, data], seq) => {
    const old = structuredClone(state);
    const next = p.apply(state, { type, data, seq, time: 1000 });
    assert.deepEqual(state, old);
    state = next;
  });
  const parsed = p.stateSchema.parse(JSON.parse(JSON.stringify(state)));
  const store = new TaskStore();
  store.restore(parsed);
  assert.equal(store.snapshot()[0].state, "approval");
  assert.equal(store.snapshot()[0].startedAt, 1000);
  assert.ok(!JSON.stringify(state).includes("PRIVATE"));
  assert.equal(p.apply(state, { type: "user/message" }), state);
});

test("late results and previous-turn end cannot resurrect or terminate another turn", () => {
  const store = new TaskStore(),
    s = { id: "A" },
    emit = (seq, type, data) =>
      store.event(s, { seq, type, data, time: Date.now() });
  emit(0, "turn/start", { turn: 1 });
  emit(1, "turn/end", { turn: 1, reason: { kind: "completed" } });
  emit(2, "tool/result", { turn: 1, message: { toolCallId: "late" } });
  assert.equal(store.snapshot()[0].state, "completed");
  emit(3, "turn/start", { turn: 2 });
  emit(4, "turn/end", { turn: 1, reason: { kind: "error" } });
  assert.equal(store.snapshot()[0].state, "running");
});

test("question finalizer never revives a stopped or disposed task", () => {
  const store = new TaskStore(),
    s = { id: "A" };
  store.status(s, "running");
  store.question(s, "q", "2 个问题待回答");
  assert.equal(store.snapshot()[0].state, "input");
  store.event(s, {
    seq: 0,
    type: "turn/end",
    data: { reason: { kind: "aborted", reason: { kind: "user" } } },
    time: Date.now(),
  });
  store.question(s, "q", undefined);
  assert.equal(store.snapshot()[0].state, "stopped");
  store.remove(s.id);
  store.question(s, "q", undefined);
  assert.deepEqual(store.snapshot(), []);
});

test("tool result does not replace an independent pending question", () => {
  const store = new TaskStore(),
    s = { id: "A" };
  store.event(s, { seq: 0, type: "turn/start", time: 1000, data: { turn: 1 } });
  store.event(s, {
    seq: 1,
    type: "tool/call",
    time: 1000,
    data: { callId: "x", name: "read", arguments: "{}" },
  });
  store.question(s, "q", "1 个问题待回答");
  store.event(s, {
    seq: 2,
    type: "tool/result",
    time: 1000,
    data: { message: { toolCallId: "x", isError: true } },
  });
  assert.equal(store.snapshot()[0].state, "input");
  assert.equal(store.snapshot()[0].detail, "1 个问题待回答");
});
