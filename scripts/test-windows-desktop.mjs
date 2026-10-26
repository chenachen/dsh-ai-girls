import assert from "node:assert/strict";
import { launchDesktop } from "../src/desktop-bridge.js";
import { desktopExecutable } from "../src/desktop-path.js";
import { Companion, manifest } from "../src/companion.js";

if (process.platform !== "win32") throw new Error("此检查需要 Windows 桌面环境。");
let pending;
const bridge = launchDesktop(desktopExecutable(), {
  onMessage(message) { if (message.type === "rendered") pending?.resolve(message); },
  onError(error) { pending?.reject(error); },
  onExit({ disposed }) { if (!disposed) pending?.reject(new Error("桌面进程提前退出")); },
});
try {
  for (const entry of manifest.characters) {
    for (const busy of [false, true, false]) {
      const companion = new Companion({ id: entry.id, scale: busy ? 1.5 : 1 });
      const tasks = busy ? [{ id: "native-smoke", title: "桌面显示验证（合成事件）", state: "running", stage: "验证角色布局", startedAt: Date.now() }] : [];
      const rendered = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("桌面程序未报告渲染结果")), 10000);
        pending = { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } };
        bridge.send({ type: "snapshot", protocol: 1, tasks, companion: companion.snapshot(tasks) });
      });
      assert.equal(rendered.character, entry.id);
      assert.equal(rendered.visible, true);
      assert.equal(rendered.spriteVisible, true);
      assert.ok(rendered.frameCount > 0);
      assert.equal(rendered.measured, true);
      const [left, top, right, bottom] = rendered.bounds;
      const [workLeft, workTop, workRight, workBottom] = rendered.workArea;
      assert.ok(left >= workLeft-1 && top >= workTop-1 && right <= workRight+1 && bottom <= workBottom+1, `${entry.id}: ${rendered.bounds} outside ${rendered.workArea}`);
    }
  }
  console.log("Windows native display: all 10 characters visible; idle/work/idle and 150% scale stay inside the current monitor work area.");
} finally {
  pending = undefined;
  await bridge.dispose();
}
