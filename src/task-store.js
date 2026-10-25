import path from "node:path";

export const activeStates = new Set(["running", "approval", "input"]);
export const executionEvents = new Set([
  "session/title",
  "turn/start",
  "turn/end",
  "tool/call",
  "tool/result",
  "approval/asked",
  "approval/decided",
  "step/start",
  "assistant/message",
]);
export const short = (value, length = 90) =>
  String(value ?? "")
    .replace(/[\r\n\t\x00-\x1f]+/g, " ")
    .trim()
    .slice(0, length);

export function executionInfo(name, rawArguments) {
  let args = {};
  try {
    args = JSON.parse(rawArguments || "{}");
  } catch {
    /* Tool may still be composing invalid JSON. */
  }
  if (!args || typeof args !== "object") args = {};
  const tool = short(name, 60);
  const lower = tool.toLowerCase().split(/[/:.]/).at(-1);
  const file = args.path ?? args.file_path ?? args.filePath ?? args.filename;
  let detail = file
    ? path.win32.basename(String(file).replace(/\//g, "\\"))
    : tool;
  let stage = "调用工具";
  if (/(^|[_-])(read|view|list)([_-]|$)/.test(lower)) stage = "正在读取";
  if (/(^|[_-])(search|grep|glob|find)([_-]|$)/.test(lower)) stage = "正在搜索";
  if (/(^|[_-])(edit|write|replace|patch)([_-]|$)/.test(lower))
    stage = "正在修改";
  if (lower === "str_replace_editor")
    stage =
      args.command === "view"
        ? "正在读取"
        : ["create", "str_replace", "insert"].includes(args.command)
          ? "正在修改"
          : "调用工具";
  if (/(^|[_-])(bash|pwsh|shell|exec|terminal)([_-]|$)/.test(lower)) {
    stage = "执行命令";
    // Only the executable name leaves the host. Arguments may contain secrets.
    const command = String(
      args.command ?? args.cmd ?? args.script ?? "",
    ).trim();
    const executable = command.match(/^[\w./\\:-]+/)?.[0];
    if (executable) detail = path.win32.basename(executable);
    if (
      /^(?:rtk\s+(?:proxy\s+)?)?(?:(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?test(?:\s|$)|(?:vitest|pytest|jest)(?:\s|$))/i.test(
        command,
      )
    )
      stage = "运行测试";
  }
  const waiting =
    /^(?:ask_user(?:_question)?|ask-user(?:-question)?|askuser|request_user_input)$/.test(
      lower,
    );
  return {
    stage: waiting ? "等待输入" : stage,
    detail: short(waiting ? args.questions?.[0]?.question || detail : detail),
    waiting,
  };
}

export class TaskStore {
  constructor({ now = Date.now, resultTtlMs = 12000 } = {}) {
    this.tasks = new Map();
    this.now = now;
    this.resultTtlMs = resultTtlMs;
  }

  ensure(session, title) {
    let task = this.tasks.get(session.id);
    if (!task) {
      task = {
        id: session.id,
        title: short(title || "未命名任务"),
        parentId:
          session.header?.origin === "subagent"
            ? session.header.parentSession
            : null,
        state: "idle",
        stage: "",
        detail: "",
        startedAt: null,
        endedAt: null,
        turn: null,
        lastSeq: -1,
        calls: new Map(),
        approvals: new Map(),
        questions: new Map(),
      };
      this.tasks.set(session.id, task);
    }
    if (title) task.title = short(title);
    return task;
  }

  status(session, status, title) {
    const task = this.ensure(session, title);
    if (status === "running" && !activeStates.has(task.state)) {
      Object.assign(task, {
        state: "running",
        stage: "运行中",
        detail: "",
        startedAt: null,
        endedAt: null,
      });
      task.calls.clear();
      task.approvals.clear();
      task.questions.clear();
    } else if (status === "idle" && activeStates.has(task.state)) {
      // A missed end event or maintenance transition is not evidence of success.
      Object.assign(task, {
        state: "idle",
        stage: "",
        detail: "",
        startedAt: null,
      });
      task.calls.clear();
      task.approvals.clear();
      task.questions.clear();
    }
  }

  phase(task) {
    if (task.approvals.size) {
      task.state = "approval";
      task.stage = "等待审批";
      task.detail = [...task.approvals.values()].at(-1);
      return;
    }
    if (task.questions.size) {
      task.state = "input";
      task.stage = "等待输入";
      task.detail = [...task.questions.values()].at(-1);
      return;
    }
    const calls = [...task.calls.values()];
    const call = calls.find((c) => c.waiting) ?? calls.at(-1);
    task.state = call?.waiting ? "input" : "running";
    task.stage = call?.stage ?? "运行中";
    task.detail = call?.detail ?? "";
    if (calls.length > 1) task.detail += ` · ${calls.length} 个工具执行中`;
  }

  event(session, event, title) {
    if (!executionEvents.has(event.type)) return;
    const task = this.ensure(session, title);
    if (event.seq <= task.lastSeq) return;
    task.lastSeq = event.seq;
    const data = event.data ?? {};
    if (event.type === "session/title") {
      task.title = short(data.title);
      return;
    }
    if (event.type !== "turn/start") {
      if (task.endedAt !== null) return;
      if (data.turn != null && task.turn != null && data.turn !== task.turn)
        return;
    }
    if (event.type === "turn/start") {
      Object.assign(task, {
        state: "running",
        stage: "运行中",
        detail: "",
        turn: data.turn,
        startedAt: event.time,
        endedAt: null,
      });
      task.calls.clear();
      task.approvals.clear();
      task.questions.clear();
    } else if (event.type === "turn/end") {
      const kind = data.reason?.kind;
      const result =
        kind === "completed"
          ? ["completed", "本轮结束", "结果待查看"]
          : kind === "error"
            ? [
                "failed",
                "执行失败",
                short(data.reason.error?.message || "请查看会话中的错误"),
              ]
            : kind === "aborted"
              ? [
                  "stopped",
                  data.reason.reason?.kind === "user"
                    ? "已手动停止"
                    : "执行已取消",
                  "",
                ]
              : kind === "blocked"
                ? ["blocked", "本轮被阻止", "请返回会话查看原因"]
                : [
                    "interrupted",
                    kind === "max-tokens" ? "达到输出上限" : "执行已中断",
                    "请返回会话查看",
                  ];
      Object.assign(task, {
        state: result[0],
        stage: result[1],
        detail: result[2],
        endedAt: event.time,
      });
      task.calls.clear();
      task.approvals.clear();
      task.questions.clear();
    } else if (event.type === "tool/call") {
      task.calls.set(data.callId, executionInfo(data.name, data.arguments));
      this.phase(task);
    } else if (event.type === "tool/result") {
      if (!task.calls.delete(data.message?.toolCallId)) return;
      this.phase(task);
      if (
        data.message?.isError &&
        !task.calls.size &&
        !task.approvals.size &&
        !task.questions.size
      )
        task.detail = "工具返回错误，任务仍在运行";
    } else if (event.type === "approval/asked") {
      task.approvals.set(data.id, short(data.toolName));
      this.phase(task);
    } else if (event.type === "approval/decided") {
      if (!task.approvals.delete(data.id)) return;
      this.phase(task);
    } else if (
      (event.type === "step/start" || event.type === "assistant/message") &&
      activeStates.has(task.state) &&
      !task.calls.size &&
      !task.approvals.size &&
      !task.questions.size
    ) {
      task.stage =
        event.type === "step/start" ? "正在请求模型" : "正在处理输出";
      task.detail = "";
    }
  }

  stream(session, frame) {
    const task = this.tasks.get(session.id);
    if (
      !task ||
      !activeStates.has(task.state) ||
      task.calls.size ||
      task.approvals.size ||
      task.questions.size
    )
      return;
    if (frame.type === "start") task.stage = "正在请求模型";
    // Content stays inside DSH. The overlay carries execution metadata only.
    if (frame.type === "chunk") task.stage = "正在接收模型输出";
  }

  remove(id) {
    this.tasks.delete(id);
  }

  question(session, token, summary) {
    const task = this.tasks.get(session.id);
    if (!task || !activeStates.has(task.state)) return;
    if (summary === undefined) task.questions.delete(token);
    else task.questions.set(token, short(summary));
    this.phase(task);
  }

  exportTask(id) {
    const { calls, approvals, questions, ...task } = this.tasks.get(id);
    return {
      ...task,
      calls: [...calls.entries()],
      approvals: [...approvals.entries()],
    };
  }

  restore(task) {
    this.tasks.set(task.id, {
      ...task,
      calls: new Map(task.calls),
      approvals: new Map(task.approvals),
      questions: new Map(),
    });
  }

  snapshot() {
    const rows = [...this.tasks.values()].filter(
      (t) =>
        activeStates.has(t.state) ||
        (t.endedAt !== null && this.now() - t.endedAt < this.resultTtlMs),
    );
    const visibleIds = new Set(rows.map((t) => t.id));
    return rows.map(({ calls, approvals, questions, lastSeq, ...task }) => ({
      ...task,
      parentId: visibleIds.has(task.parentId) ? task.parentId : null,
    }));
  }
}
