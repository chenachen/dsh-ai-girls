import { existsSync } from "node:fs";
import { TaskStore, short } from "./task-store.js";
import { executionProjection, projectionKey } from "./execution-projection.js";
import { launchDesktop } from "./desktop-bridge.js";
import { desktopExecutable } from "./desktop-path.js";
import { Companion } from "./companion.js";
import { createPreferenceBinding } from "./preference-binding.js";
import { createNavigation } from "./navigation.js";

// Injectable dependencies let integration tests run without opening a desktop window.
export function startHost(ctx, config = {}, runtime = {}) {
  const launch = runtime.launchDesktop ?? launchDesktop;
  const store = new TaskStore();
  const preferences = createPreferenceBinding(ctx, config, runtime);
  const companion = new Companion(preferences.initial, { save: preferences.save });
  const navigate = createNavigation(ctx);
  let bridge,
    timer,
    lastPayload,
    stopped = false,
    started = false;
  ctx.sessionProjections.register(executionProjection);
  const title = (session) => ctx.sessionProjections.stateOf(session, "title");
  const publish = (force = false) => {
    if (!bridge || stopped) return;
    const updatedPreferences = preferences.read();
    if (updatedPreferences) companion.update(updatedPreferences);
    const tasks = store.snapshot();
    const snapshot = {
      type: "snapshot",
      protocol: 1,
      hostPid: process.pid,
      tasks,
      companion: companion.snapshot(tasks),
    };
    const payload = JSON.stringify(snapshot);
    if (force || payload !== lastPayload) {
      lastPayload = payload;
      bridge.send(snapshot);
    }
  };
  ctx.on("session/event", (session, event) => {
    store.event(session, event, title(session));
    publish();
  });
  ctx.on("agent/status", ({ agent, status }) => {
    store.status(agent.session, status, title(agent.session));
    publish();
  });
  ctx.on("agent/assistant-stream", ({ agent, frame }) =>
    store.stream(agent.session, frame),
  );
  ctx.on("session/disposed", (session) => {
    store.remove(session.id);
    publish();
  });
  ctx.on(
    "user-questions/request",
    async (request, next) => {
      const session = request.agent?.session;
      if (!session) return next();
      const token = Symbol("question");
      store.question(
        session,
        token,
        short(request.questions[0]?.question) || `${request.questions.length} 个问题待回答`,
      );
      publish();
      try {
        return await next();
      } finally {
        store.question(session, token, undefined);
        publish();
      }
    },
    { prepend: true },
  );
  ctx.effect(() => {
    const cleanup = async () => {
      stopped = true;
      clearInterval(timer);
      await bridge?.dispose();
    };
    const executable =
      config.executable ??
      desktopExecutable(runtime.platform ?? process.platform);
    if (stopped || started || !executable) return cleanup;
    if (!(runtime.existsSync ?? existsSync)(executable)) {
      ctx.logger.warn("AI 娘桌面程序未构建，请运行 npm run build。");
      return cleanup;
    }
    started = true;
    for (const agent of ctx.agents.list()) {
      if (agent.status === "running") {
        const snapshot = ctx.sessionProjections.stateOf(
          agent.session,
          projectionKey,
        );
        if (snapshot) store.restore(snapshot);
      }
      store.status(agent.session, agent.status, title(agent.session));
    }
    bridge = launch(executable, {
      onMessage(message) {
        if (message.type === "ready") publish(true);
        if (message.type === "preferences" && message.patch && typeof message.patch === "object") {
          try { companion.update(message.patch); publish(true); }
          catch (error) { ctx.logger.warn("AI 娘偏好保存失败：%s", error.message); }
        }
        if (message.type === "navigate" && store.snapshot().some((task) => task.id === message.sessionId)) navigate(message.sessionId);
      },
      onError(error) {
        ctx.logger.warn("AI 娘桌面连接：%s", error.message);
      },
      onExit({ disposed }) {
        clearInterval(timer);
        bridge = undefined;
        if (!disposed)
          ctx.logger.info("AI 娘桌面窗口已关闭；重新启用插件可恢复。");
      },
    });
    timer = setInterval(publish, 1000);
    timer.unref();
    publish(true);
    return cleanup;
  }, "AI girls desktop process");
}
