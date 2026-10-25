window.__ModuleLoader__.load({
  id: "dsh-ai-girls",
  factory: (require) => {
    const { createElement: h, useState, useRef, useId } = require("react");
    const characters = [
      ["deepseek-normal", "DeepSeek · 常态"], ["deepseek-chibi", "DeepSeek · Q 版"],
      ["gpt-normal", "GPT · 常态"], ["gpt-chibi", "GPT · Q 版"],
      ["claude-normal", "Claude · 常态"], ["claude-chibi", "Claude · Q 版"],
      ["grok-normal", "Grok · 常态"], ["grok-chibi", "Grok · Q 版"],
      ["gemini-normal", "Gemini · 常态"], ["gemini-chibi", "Gemini · Q 版"],
    ];
    const fieldStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "16px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" };
    const controlStyle = { minWidth: 180, maxWidth: "60%", padding: "6px 12px", borderRadius: 10, border: "1px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-layer-1)", font: "inherit" };
    function Preferences(props) {
      const state = props.usePreferences((snapshot) => snapshot);
      const [saving, setSaving] = useState(false);
      const [message, setMessage] = useState("");
      const [pending, setPending] = useState({});
      const [intervalText, setIntervalText] = useState(null);
      const [intervalError, setIntervalError] = useState("");
      const generation = useRef(0);
      const intervalId = useId();
      if (state.status !== "ready") return h("p", null, "请先在「插件」中启用 AI 娘值班室。");
      const value = { ...state.value.preferences, ...pending };
      const disabled = !state.writable;
      const save = async (patch) => {
        const current = ++generation.current;
        setPending(previous => ({ ...previous, ...patch }));
        setSaving(true); setMessage("");
        try {
          const accepted = await props.update(patch);
          if (current === generation.current) setMessage(accepted ? "已保存" : "保存失败，请重试");
        } catch (error) {
          if (current === generation.current) setMessage(`保存失败：${error.message}`);
        } finally {
          if (current === generation.current) { setPending({}); setSaving(false); }
        }
      };
      const commitInterval = () => {
        if (intervalText === null) return;
        const seconds = Number(intervalText);
        if (!intervalText.trim() || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
          setIntervalError("请输入 1–3600 的整数秒数");
          return;
        }
        setIntervalError(""); setIntervalText(null);
        if (seconds !== value.rotationSeconds) void save({ rotationSeconds: seconds });
      };
      const select = (label, key, choices, numeric = false) => h("label", { style: fieldStyle },
        h("span", null, label), h("select", { "aria-label": label, value: value[key], disabled, style: controlStyle,
          onChange: (event) => save({ [key]: numeric ? Number(event.target.value) : event.target.value, ...(key === "id" ? { mode: "fixed" } : {}) }),
        }, choices.map(([id, title]) => h("option", { key: id, value: id }, title))));
      // Match the host's settings hierarchy: 18px heading, 14px fields, 13px introduction.
      return h("section", { style: { width: "100%", maxWidth: 680, color: "var(--dsw-alias-label-primary)", fontFamily: "inherit", fontSize: 14, lineHeight: "22px" } },
        h("h2", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 600, lineHeight: "26px" } }, "AI 娘值班室"),
        h("p", { style: { margin: "0 0 12px", color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: "20px" } }, "选一位桌面伙伴。修改自动保存，也会同步到角色菜单。"),
        select("角色形态", "id", characters),
        select("角色大小", "scale", [[.75, "75%"], [1, "100%"], [1.25, "125%"], [1.5, "150%"]], true),
        select("角色轮换", "mode", [["fixed", "固定当前角色"], ["sequential", "顺序轮换"], ["favorites", "收藏轮换"], ["random", "随机轮换"]]),
        h("div", { style: fieldStyle },
          h("label", { htmlFor: intervalId }, "轮换间隔"),
          h("div", { style: { textAlign: "right" } },
            h("div", { style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 } },
              h("input", { id: intervalId, "aria-label": "轮换间隔（秒）", type: "number", min: 1, max: 3600, step: 1,
                value: intervalText ?? value.rotationSeconds, disabled, "aria-invalid": !!intervalError,
                style: { ...controlStyle, minWidth: 0, maxWidth: "none", width: 88, boxSizing: "border-box" },
                onChange: event => { setIntervalText(event.target.value); setIntervalError(""); },
                onBlur: commitInterval,
                onKeyDown: event => {
                  if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { setIntervalText(null); setIntervalError(""); }
                },
              }), h("span", null, "秒")),
            h("div", { style: { fontSize: 12, lineHeight: "18px", marginTop: 5, color: intervalError ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-secondary)" }, role: intervalError ? "alert" : undefined },
              intervalError || "回车或移开焦点保存"))),
        h("label", { style: fieldStyle }, h("span", null, "显示任务气泡"), h("input", { type: "checkbox", "aria-label": "显示任务气泡", checked: !value.bubbleHidden, disabled, onChange: event => save({ bubbleHidden: !event.target.checked }) })),
        h("fieldset", { style: { border: 0, padding: "20px 0", margin: 0 } },
          h("legend", { style: { paddingTop: 20 } }, "收藏角色"),
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 } },
            characters.map(([id, label]) => h("label", { key: id, style: { display: "flex", alignItems: "center", gap: 8 } },
              h("input", { type: "checkbox", checked: value.favorites.includes(id), disabled,
                onChange: event => save({ favorites: event.target.checked ? [...value.favorites, id] : value.favorites.filter(item => item !== id) }) }), label)))),
        h("p", { role: "status", style: { fontSize: 12, lineHeight: "18px", minHeight: 18, color: "var(--dsw-alias-label-secondary)" } }, saving ? "正在保存…" : message),
        h("p", { style: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)" } }, "拖动角色可移动位置；启停或卸载请前往侧边栏「插件 → AI 娘值班室」。"));
    }
    return {
    inject: ["connection", "uiWorkspace", "slots", "configForms"],
    apply(ctx) {
      const form = ctx.configForms.get("dsh-ai-girls");
      const face = {
        hooks: { preferences: { getSnapshot: () => form.getSnapshot(), subscribe: listener => form.subscribe(listener) } },
        update: patch => form.mutate(Object.entries(patch).map(([field, value]) => ({ op: "set", path: ["preferences", field], value }))),
      };
      for (const [name, identity] of [
        ["settings.section", { id: "dsh-ai-girls", label: "AI 娘值班室", order: 16 }],
        ["plugins.bundle.config", { key: "dsh-ai-girls" }],
      ]) ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({ name, ...identity, inject: () => face }, Preferences)));
      ctx.effect(() => {
        const lifetime = new AbortController();
        let timer, seen = 0;
        const poll = async () => {
          try {
            const result = await ctx.connection.rpc.call("/api", "dsh-ai-girls/navigation", {}, lifetime.signal);
            const request = result.ok && result.value;
            if (request && request.revision !== seen) {
              ctx.uiWorkspace.openSession(request.sessionId);
              seen = request.revision;
              await ctx.connection.rpc.call("/api", "dsh-ai-girls/ack", { revision: seen }, lifetime.signal);
            }
          } catch (error) { if (!lifetime.signal.aborted) console.debug("AI girls navigation:", error.message); }
          finally { if (!lifetime.signal.aborted) timer = setTimeout(poll, 750); }
        };
        poll();
        return () => { lifetime.abort(); clearTimeout(timer); };
      });
    },
  };
  },
});
