import test from "node:test";
import assert from "node:assert/strict";
import { updateProfilePatch as patch } from "../scripts/profile-patch.mjs";
const entry = "file:///D:/my/dsh-ai-girls/src/index.js";
test("installation is idempotent and removal preserves other plugins", () => {
  const old =
    "# user settings\r\n- insert:\r\n    - id: user-plugin\r\n      name: user-plugin\r\n";
  const installed = patch(old, entry);
  assert.ok(installed.includes(old.trimEnd()));
  assert.equal(patch(installed, entry), installed);
  assert.equal(patch(installed, entry, true).trimEnd(), old.trimEnd());
  assert.equal(patch(old, entry, true), old);
});
test("an empty YAML list becomes a valid list patch and returns to an empty list", () => {
  const installed = patch("[]\n", entry);
  assert.ok(!installed.startsWith("[]"));
  assert.equal(patch(installed, entry, true), "[]\n");
});
test("ambiguous markers or an existing unmanaged entry stop the change", () => {
  assert.throws(() => patch("# BEGIN dsh-ai-girls local development", entry));
  const valid = patch("", entry);
  assert.throws(() => patch(valid + valid, entry));
  assert.throws(() =>
    patch("- insert:\n    - id: dsh-ai-girls\n      name: installed", entry),
  );
});
