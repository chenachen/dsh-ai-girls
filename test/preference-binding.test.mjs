import test from "node:test";
import assert from "node:assert/strict";
import { Config } from "../src/config.js";
import { defaults, normalizePreferences } from "../src/companion.js";
import { createPreferenceBinding } from "../src/preference-binding.js";

test("native settings schema exposes live character choices and validates size", () => {
  const value = Config({ preferences: { ...defaults, id: "gemini-chibi", scale: 1.25 } });
  assert.equal(value.preferences.get().id, "gemini-chibi");
  assert.equal(Config.dict.preferences.meta.volatile, true);
  assert.throws(() => Config({ preferences: { ...defaults, scale: 9 } }));
  assert.equal(Config({ preferences: { ...defaults, rotationSeconds: 7 } }).preferences.get().rotationSeconds, 7);
  for (const rotationSeconds of [0, 1.5, 3601]) assert.throws(() => Config({ preferences: { ...defaults, rotationSeconds } }));
});

test("settings and native menu synchronize without a save feedback loop", async () => {
  let value = normalizePreferences(defaults), cleanup, writes = 0;
  const saved = [];
  const ctx = {
    effect(fn) { cleanup = fn(); },
    get() { return { async update(ns, patch) { assert.equal(ns, "dsh-ai-girls"); writes++; value = patch.preferences; } }; },
    logger: { warn() { assert.fail("unexpected synchronization error"); } },
  };
  const binding = createPreferenceBinding(ctx, { preferences: { get: () => value } }, { savePreferences: p => saved.push(p) });
  assert.equal(binding.initial.id, defaults.id);
  value = { ...value, id: "claude-chibi" };
  const fromSettings = binding.read();
  binding.save(fromSettings);
  assert.equal(writes, 0);
  binding.save({ ...fromSettings, scale: 1.25 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(value.scale, 1.25);
  assert.equal(writes, 1);
  assert.equal(binding.read(), undefined);
  cleanup();
  binding.save({ ...value, scale: 1 });
  assert.equal(writes, 1);
  assert.equal(saved.length, 3);
});
