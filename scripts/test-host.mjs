import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hostEnvironment } from "./host-environment.mjs";

const host = hostEnvironment();
const directory = fileURLToPath(new URL("../test/integration/", import.meta.url));
console.log("DSH modules:", host.modules);
const result = spawnSync(host.executable, [
  "--test", ...readdirSync(directory).filter((p) => p.endsWith(".test.mjs")).map((p) => directory + p),
], { env: host.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
