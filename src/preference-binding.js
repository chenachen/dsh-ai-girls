import { loadPreferences, normalizePreferences, savePreferences } from "./companion.js";

// Keep DSH's live Config and the native menu on the same preferences.
// The existing local file seeds first installation and remains the portable copy.
export function createPreferenceBinding(ctx, config = {}, runtime = {}) {
  const reference = config.preferences;
  const saveLocal = runtime.savePreferences ?? savePreferences;
  let lastConfig = reference?.get();
  let pending, writing = false, closed = false;
  const initial = normalizePreferences(lastConfig ?? runtime.preferences ?? loadPreferences());
  const key = (value) => JSON.stringify(normalizePreferences(value));

  async function flush(settings) {
    if (writing) return;
    writing = true;
    try {
      while (pending && !closed) {
        const preferences = pending;
        pending = undefined;
        await settings.update("dsh-ai-girls", { preferences });
        lastConfig = reference.get();
      }
    } catch (error) {
      ctx.logger.warn("AI 娘设置页同步失败：%s", error.message);
    } finally {
      writing = false;
    }
  }
  ctx.effect(() => () => { closed = true; pending = undefined; });
  return {
    initial,
    save(value) {
      saveLocal(value);
      const settings = ctx.get?.("settings");
      if (!closed && reference && settings && key(reference.get()) !== key(value)) {
        pending = normalizePreferences(value);
        void flush(settings);
      }
    },
    read() {
      const current = reference?.get();
      if (current && current !== lastConfig && !writing) {
        lastConfig = current;
        return normalizePreferences(current);
      }
    },
  };
}
