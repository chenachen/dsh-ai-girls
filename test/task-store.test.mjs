import test from "node:test";
import assert from "node:assert/strict";
import { TaskStore, executionInfo } from "../src/task-store.js";

const session = (id, header = {}) => ({ id, header });
function fixture() {
  let now = 1000,
    seq = 0;
  const store = new TaskStore({ now: () => now });
  return {
    store,
    advance: (n) => (now += n),
    emit: (s, type, data) =>
      store.event(s, { type, data, seq: seq++, time: now }, s.id),
  };
}
test("unselected sessions remain present; ending one does not stop the other", () => {
  const { store, emit } = fixture(),
    a = session("A"),
    b = session("B");
  emit(a, "turn/start", { turn: 1 });
  emit(b, "turn/start", { turn: 1 });
  emit(b, "turn/end", { turn: 1, reason: { kind: "completed" } });
  assert.deepEqual(
    store.snapshot().map((t) => t.state),
    ["running", "completed"],
  );
});
test("parallel tools are correlated with the actual toolCallId result field", () => {
  const { store, emit } = fixture(),
    a = session("A");
  emit(a, "turn/start", { turn: 1 });
  for (const id of ["one", "two"])
    emit(a, "tool/call", {
      callId: id,
      name: "read_file",
      arguments: '{"path":"file.ts"}',
    });
  emit(a, "tool/result", { message: { toolCallId: "one" } });
  assert.equal(store.snapshot()[0].stage, "正在读取");
  emit(a, "tool/result", { message: { toolCallId: "two" } });
  assert.equal(store.snapshot()[0].stage, "运行中");
});
test("tool errors are not terminal failures", () => {
  const { store, emit } = fixture(),
    a = session("A");
  emit(a, "turn/start", { turn: 1 });
  emit(a, "tool/call", { callId: "one", name: "bash", arguments: "{}" });
  emit(a, "tool/result", { message: { toolCallId: "one", isError: true } });
  assert.equal(store.snapshot()[0].state, "running");
});
test("approval has priority; resolving one of two approvals stays waiting", () => {
  const { store, emit } = fixture(),
    a = session("A");
  emit(a, "turn/start", { turn: 1 });
  emit(a, "approval/asked", { id: "1", toolName: "write" });
  emit(a, "approval/asked", { id: "2", toolName: "write" });
  emit(a, "approval/decided", { id: "1" });
  assert.equal(store.snapshot()[0].state, "approval");
  emit(a, "approval/decided", { id: "2" });
  assert.equal(store.snapshot()[0].state, "running");
});
test("waiting for input is factual and clears on tool result", () => {
  const { store, emit } = fixture(),
    a = session("A");
  emit(a, "turn/start", { turn: 1 });
  emit(a, "tool/call", {
    callId: "q",
    name: "ask_user_question",
    arguments: "{}",
  });
  assert.equal(store.snapshot()[0].state, "input");
  emit(a, "tool/result", { message: { toolCallId: "q" } });
  assert.equal(store.snapshot()[0].state, "running");
});
test("completion, error, cancellation and token limit remain distinct", () => {
  for (const [reason, state] of [
    [{ kind: "completed" }, "completed"],
    [{ kind: "error", error: { message: "offline" } }, "failed"],
    [{ kind: "aborted", reason: { kind: "user" } }, "stopped"],
    [{ kind: "max-tokens" }, "interrupted"],
    [{ kind: "blocked" }, "blocked"],
  ]) {
    const { store, emit } = fixture(),
      a = session("A");
    emit(a, "turn/start", { turn: 1 });
    emit(a, "turn/end", { turn: 1, reason });
    store.status(a, "idle");
    assert.equal(store.snapshot()[0].state, state);
  }
});
test("result expires; agent snapshot does not invent elapsed time or success", () => {
  const { store, emit, advance } = fixture(),
    a = session("A");
  store.status(a, "running");
  assert.equal(store.snapshot()[0].startedAt, null);
  store.status(a, "idle");
  assert.equal(store.snapshot().length, 0);
  emit(a, "turn/start", { turn: 1 });
  emit(a, "turn/end", { turn: 1, reason: { kind: "completed" } });
  advance(13000);
  assert.equal(store.snapshot().length, 0);
});
test("subagents group under visible parent; ordinary forks stay independent", () => {
  const { store, emit } = fixture();
  for (const s of [
    session("A"),
    session("child", { origin: "subagent", parentSession: "A" }),
    session("fork", { parentSession: "A" }),
  ])
    emit(s, "turn/start", { turn: 1 });
  assert.deepEqual(
    store.snapshot().map((t) => t.parentId),
    [null, "A", null],
  );
});
test("duplicate and out-of-order events cannot overwrite newer state", () => {
  const store = new TaskStore(),
    a = session("A");
  store.event(a, {
    seq: 2,
    type: "turn/end",
    data: { reason: { kind: "completed" } },
    time: Date.now(),
  });
  store.event(a, {
    seq: 1,
    type: "turn/start",
    data: { turn: 1 },
    time: Date.now(),
  });
  assert.equal(store.snapshot()[0].state, "completed");
});
test("execution summary omits full arguments and handles malformed JSON", () => {
  assert.equal(
    executionInfo(
      "bash",
      '{"command":"curl --header secret-token https://example.com"}',
    ).detail,
    "curl",
  );
  assert.equal(
    executionInfo("read_file", '{"path":"C:/private/file.ts"}').detail,
    "file.ts",
  );
  assert.equal(executionInfo("read_file", "null").stage, "正在读取");
  assert.equal(executionInfo("bash", "{").stage, "执行命令");
});

test("official editor view is read-only and command summaries do not infer a test from quoted text", () => {
  assert.equal(
    executionInfo("str_replace_editor", '{"command":"view","path":"a.ts"}')
      .stage,
    "正在读取",
  );
  assert.equal(
    executionInfo(
      "str_replace_editor",
      '{"command":"str_replace","path":"a.ts"}',
    ).stage,
    "正在修改",
  );
  assert.equal(executionInfo("create_thread", "{}").stage, "调用工具");
  assert.equal(
    executionInfo("pwsh", '{"command":"echo npm test"}').stage,
    "执行命令",
  );
  assert.equal(
    executionInfo("pwsh", '{"command":"rtk proxy pnpm.cmd test"}').stage,
    "运行测试",
  );
});
