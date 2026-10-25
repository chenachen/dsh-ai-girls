import { TaskStore } from "../src/task-store.js";
import { launchDesktop } from "../src/desktop-bridge.js";
import { desktopExecutable } from "../src/desktop-path.js";
import { Companion } from "../src/companion.js";

// Synthetic fixtures: verify the native window without invoking a model.
const store = new TaskStore();
const companion = new Companion();
const a = { id: "demo-a", header: {} },
  b = { id: "demo-b", header: {} };
let seqA = 0,
  seqB = 0;
const emit = (s, type, data) =>
  store.event(
    s,
    { type, data, time: Date.now(), seq: s === a ? seqA++ : seqB++ },
    s === a ? "联调样例 A（合成事件）" : "联调样例 B（合成事件）",
  );
const bridge = launchDesktop(
  desktopExecutable(),
  {
    onMessage: (m) => {
      if (m.type === "preferences") companion.update(m.patch);
      if (
        m.type === "ready" ||
        (m.type === "rendered" && m.revision % 10 === 0)
      )
        console.log(JSON.stringify(m));
    },
    onError: (e) => console.error(e.message),
    onExit: ({ code, disposed }) =>
      process.exit(disposed || code === 0 ? 0 : 1),
  },
);
emit(a, "turn/start", { turn: 1 });
emit(b, "turn/start", { turn: 1 });
emit(a, "tool/call", {
  callId: "read-a",
  name: "read_file",
  arguments: JSON.stringify({ path: "README.md" }),
});
emit(b, "tool/call", { callId: "search-b", name: "search", arguments: "{}" });
const publish = () => {
  const tasks = store.snapshot();
  bridge.send({
    type: "snapshot",
    protocol: 1,
    hostPid: process.pid,
    tasks,
    companion: companion.snapshot(tasks),
  });
};
const timer = setInterval(publish, 1000);
publish();
setTimeout(() => {
  emit(a, "tool/result", { message: { toolCallId: "read-a", isError: false } });
  emit(a, "tool/call", {
    callId: "test-a",
    name: "bash",
    arguments: '{"command":"npm test"}',
  });
}, 10000);
setTimeout(
  () => emit(b, "turn/end", { turn: 1, reason: { kind: "completed" } }),
  20000,
);
setTimeout(() => {
  emit(a, "approval/asked", { id: "approve-a", toolName: "write_file" });
}, 30000);
setTimeout(() => {
  emit(a, "approval/decided", { id: "approve-a", outcome: "allowed-once" });
}, 40000);
setTimeout(
  () => emit(a, "turn/end", { turn: 1, reason: { kind: "completed" } }),
  50000,
);
setTimeout(() => {
  clearInterval(timer);
  bridge.dispose();
}, 65000);
process.on("SIGINT", () => {
  clearInterval(timer);
  bridge.dispose();
});
