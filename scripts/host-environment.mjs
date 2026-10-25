import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Desktop bundles its own DSH modules. The old ~/.dsh/profiles/node_modules
// directory can survive upgrades and must not be mistaken for the active host.
export function hostEnvironment() {
  const app = process.env.DSH_APP_PATH ?? "/Applications/DeepSeek Harness.app";
  const electron = join(app, "Contents/MacOS/DeepSeek Harness");
  const bundled = join(app, "Contents/Resources/app.asar/dsh/node_modules");
  const useBundled = process.platform === "darwin" && !process.env.DSH_NODE_MODULES && existsSync(electron);
  return {
    executable: useBundled ? electron : process.execPath,
    modules: process.env.DSH_NODE_MODULES ?? (useBundled ? bundled : join(homedir(), ".dsh/profiles/node_modules")),
    env: useBundled ? { ...process.env, ELECTRON_RUN_AS_NODE: "1", DSH_NODE_MODULES: bundled } : process.env,
  };
}
