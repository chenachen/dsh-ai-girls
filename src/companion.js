import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));
const characters = JSON.parse(readFileSync(new URL("../assets/characters.json", import.meta.url), "utf8")).characters;
const ids = manifest.characters.map((entry) => entry.id);
export const defaults = { id: "deepseek-chibi", scale: 1, mode: "fixed", rotationSeconds: 10, bubbleHidden: false, favorites: ["deepseek-chibi", "gpt-chibi", "claude-chibi", "grok-chibi", "gemini-chibi"] };

export function normalizePreferences(value = {}) {
  return {
    id: ids.includes(value.id) ? value.id : defaults.id,
    scale: typeof value.scale === "number" && Number.isFinite(value.scale) ? Math.max(0.75, Math.min(1.5, value.scale)) : defaults.scale,
    mode: ["fixed", "sequential", "favorites", "random"].includes(value.mode) ? value.mode : defaults.mode,
    bubbleHidden: value.bubbleHidden === true,
    rotationSeconds: typeof value.rotationSeconds === "number" && Number.isFinite(value.rotationSeconds) ? Math.max(1, Math.min(3600, Math.round(value.rotationSeconds))) : defaults.rotationSeconds,
    favorites: Array.isArray(value.favorites) ? [...new Set(value.favorites.filter((id) => ids.includes(id)))] : [...defaults.favorites],
  };
}

export function preferenceFile() {
  const base = process.platform === "win32" ? process.env.LOCALAPPDATA ?? homedir() : process.platform === "darwin" ? join(homedir(), "Library/Application Support") : join(homedir(), ".config");
  return join(base, "DshAiGirls/preferences.json");
}
export function loadPreferences(path = preferenceFile()) {
  try { return normalizePreferences(JSON.parse(readFileSync(path, "utf8"))); }
  catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; return normalizePreferences(); }
}
export function savePreferences(value, path = preferenceFile()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", JSON.stringify(normalizePreferences(value), null, 2) + "\n", { mode: 0o600 });
  renameSync(path + ".tmp", path);
}

export class Companion {
  constructor(preferences = defaults, { now = Date.now, random = Math.random, save = () => {} } = {}) {
    this.preferences = normalizePreferences(preferences);
    this.now = now; this.random = random; this.save = save;
    this.lastRotation = now(); this.lastIdle = now(); this.lineUntil = 0;
    this.lineKey = ""; this.line = ""; this.previousLine = "";
  }
  update(patch) {
    this.preferences = normalizePreferences({ ...this.preferences, ...patch });
    this.lastRotation = this.now(); this.lineKey = "";
    this.save(this.preferences);
  }
  snapshot(tasks) {
    const now = this.now(), p = this.preferences;
    if (p.mode !== "fixed" && now - this.lastRotation >= p.rotationSeconds * 1000) {
      const pool = p.mode === "favorites" ? p.favorites : ids;
      if (pool.length > 0) {
        const candidates = pool.filter((id) => id !== p.id);
        p.id = p.mode === "random" ? candidates[Math.floor(this.random() * candidates.length)] ?? p.id : pool[(pool.indexOf(p.id) + 1) % pool.length];
        this.save(p); this.lineKey = "";
      }
      this.lastRotation = now;
    }
    const entry = manifest.characters.find((x) => x.id === p.id);
    const busy = tasks.some((t) => t.state === "running");
    const waiting = tasks.some((t) => ["approval", "input"].includes(t.state));
    const latest = tasks.filter((t) => !["running", "approval", "input"].includes(t.state)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
    const state = busy ? "running" : waiting ? "waiting" : latest?.state ?? "idle";
    const animation = manifest.animations[state] ?? manifest.animations.idle;
    // Never choose dialogue while any task is running or waiting for the user.
    if (busy || waiting) { this.line = ""; this.lineKey = ""; this.lastIdle = now; }
    else {
      const key = latest ? `${p.id}:${latest.id}:${latest.turn}:${latest.state}` : `${p.id}:idle:${Math.floor((now - this.lastIdle) / 90000)}`;
      if (key !== this.lineKey && (latest || now - this.lastIdle >= 90000)) {
        const kind = { completed: "complete", stopped: "interrupted" }[state] ?? state;
        const pool = (characters.find((x) => x.id === entry.character).lines[entry.form][kind] ?? []).filter((text) => text !== this.previousLine);
        this.line = pool[Math.floor(this.random() * pool.length)] ?? "";
        this.previousLine = this.line; this.lineUntil = now + 8000; this.lineKey = key;
      }
      if (now >= this.lineUntil) this.line = "";
    }
    return { ...p, label: entry.label, state, animation, line: this.line, options: manifest.characters.map(({ id, label }) => ({ id, label })) };
  }
}
