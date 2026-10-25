import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { desktopExecutable } from "../src/desktop-path.js";
import { hostEnvironment } from "./host-environment.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = resolve(
  process.env.DSH_PROFILE_DIR ?? join(homedir(), ".dsh", "profiles", "desktop"),
);
const host = hostEnvironment();
const executable = desktopExecutable();
const compiler = join(
  process.env.WINDIR ?? "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe",
);
const patch = join(profile, "cordis.patch.yml");
const names = [
    "cordis",
    "dsh-session",
    "dsh-agent",
    "dsh-session-projection",
    "dsh-session-title",
  ];
const packages = JSON.parse(execFileSync(host.executable, ["--input-type=commonjs", "-e", `
  const fs = require('node:fs'), path = require('node:path');
  console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map(name => {
    const file = path.join(process.argv[1], '@deepseek-ai', name, 'package.json');
    return [name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).version : null];
  }))));
`, host.modules], { env: host.env, encoding: "utf8" }));
const desktopBuilt = Boolean(executable && existsSync(executable));
const packageFile = join(profile, "package.json");
const profilePackage = existsSync(packageFile) ? JSON.parse(readFileSync(packageFile, "utf8")) : {};
const result = {
  platform: process.platform,
  node: process.versions.node,
  project: root,
  compiler: process.platform === "darwin" ? spawnSync("xcrun", ["--find", "swiftc"]).status === 0 : existsSync(compiler),
  desktopBuilt,
  desktopBuiltAt: desktopBuilt
    ? statSync(executable).mtime.toISOString()
    : null,
  profile,
  profilePatchExists: existsSync(patch),
  managedPackageInstalled: Boolean(profilePackage.dependencies?.["dsh-ai-girls"]),
  managedBundleRegistered: profilePackage.dsh?.profile?.bundles?.includes("dsh-ai-girls") ?? false,
  hostModules: host.modules,
  hostPackages: packages,
  note: "这里只检查文件与依赖；宿主实际加载和桌面显示请按 docs/manual-verification.md 验证。",
};
console.log(JSON.stringify(result, null, 2));
if (
  !["win32", "darwin"].includes(process.platform) ||
  Number(process.versions.node.split(".")[0]) < 22 ||
  !result.compiler ||
  !result.desktopBuilt ||
  !result.profilePatchExists ||
  Object.values(packages).some((v) => v === null)
)
  process.exitCode = 1;
