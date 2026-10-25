import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Companion, defaults, manifest, normalizePreferences } from "../src/companion.js";

test("all ten original atlases have the recorded dimensions and hashes", () => {
  assert.equal(manifest.characters.length, 10);
  for (const entry of manifest.characters) {
    const bytes = readFileSync(new URL(`../assets/sprites/${entry.id}.png`, import.meta.url));
    assert.equal(bytes.readUInt32BE(16), manifest.frameWidth * manifest.columns);
    assert.equal(bytes.readUInt32BE(20), manifest.frameHeight * manifest.rows);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  }
});

test("every shipped dialogue line can be displayed in its intended state", () => {
  const characters = JSON.parse(readFileSync(new URL("../assets/characters.json", import.meta.url), "utf8")).characters;
  const taskStates = { idle: null, complete: "completed", failed: "failed", interrupted: "stopped" };
  for (const character of characters) {
    for (const [form, states] of Object.entries(character.lines)) {
      const id = `${character.id}-${form}`;
      assert.ok(manifest.characters.some((entry) => entry.id === id), id);
      for (const [kind, lines] of Object.entries(states)) {
        assert.ok(Object.hasOwn(taskStates, kind), `${id}: unreachable dialogue state ${kind}`);
        assert.ok(lines.length > 0, `${id}/${kind}`);
        for (const [index, line] of lines.entries()) {
          assert.doesNotMatch(line, /\bCodex\b/);
          let now = 0;
          const pet = new Companion({ ...defaults, id }, { now: () => now, random: () => (index + 0.5) / lines.length });
          now = 90000;
          const tasks = kind === "idle" ? [] : [{ id: "task", state: taskStates[kind], turn: 1, endedAt: now }];
          assert.equal(pet.snapshot(tasks).line, line, `${id}/${kind}/${index}`);
        }
      }
    }
  }
});

test("ten minutes of work, rotation and a completed sibling never emit dialogue", () => {
  let now = 0;
  const pet = new Companion({ ...defaults, mode: "sequential", rotationSeconds: 30 }, { now: () => now });
  const seen = new Set();
  for (now = 0; now <= 600000; now += 1000) {
    const state = pet.snapshot([{ id: "A", state: "running" }, { id: "B", state: "completed", turn: 1 }]);
    assert.equal(state.state, "running");
    assert.equal(state.animation.row, 7);
    assert.equal(state.line, "");
    seen.add(state.id);
  }
  assert.equal(seen.size, 10);
});

test("waiting suppresses dialogue; completion, failure and stop select distinct states", () => {
  let now = 100000;
  const pet = new Companion(defaults, { now: () => now, random: () => 0 });
  for (const state of ["completed", "failed", "stopped"]) {
    const snapshot = pet.snapshot([{ id: "A", state, turn: 1, endedAt: now }]);
    assert.equal(snapshot.state, state);
    assert.ok(snapshot.line);
    assert.ok(!snapshot.line.includes("Codex"));
  }
  assert.equal(pet.snapshot([{ state: "approval" }]).line, "");
  assert.equal(pet.snapshot([{ state: "input" }]).line, "");
  assert.equal(pet.snapshot([]).line, "");
  now += 90000;
  assert.ok(pet.snapshot([]).line);
  now += 8000;
  assert.equal(pet.snapshot([]).line, "");
});

test("random never repeats; favorites stay within the selected set; fixed stays fixed", () => {
  let now = 0;
  const pet = new Companion({ ...defaults, mode: "random", rotationSeconds: 30 }, { now: () => now, random: () => 0 });
  let previous = pet.snapshot([]).id;
  for (let i = 0; i < 20; i++) { now += 30000; const next = pet.snapshot([]).id; assert.notEqual(next, previous); previous = next; }
  pet.update({ mode: "favorites", favorites: ["claude-normal", "gpt-normal"] });
  now += 30000; assert.equal(pet.snapshot([]).id, "claude-normal");
  now += 30000; assert.equal(pet.snapshot([]).id, "gpt-normal");
  pet.update({ mode: "fixed" });
  now += 600000; assert.equal(pet.snapshot([]).id, "gpt-normal");
  const clean = normalizePreferences({ id: "../bad", scale: Infinity, favorites: ["gpt-normal", "gpt-normal", "bad"] });
  assert.equal(clean.id, defaults.id); assert.equal(clean.scale, 1); assert.deepEqual(clean.favorites, ["gpt-normal"]);
});


test("custom short interval rotates at the requested second", () => {
  let now = 0;
  const pet = new Companion({ ...defaults, mode: "sequential", rotationSeconds: 7 }, { now: () => now });
  const first = pet.snapshot([]).id;
  now = 6999;
  assert.equal(pet.snapshot([]).id, first);
  now = 7000;
  assert.notEqual(pet.snapshot([]).id, first);
  assert.equal(pet.preferences.rotationSeconds, 7);
});
