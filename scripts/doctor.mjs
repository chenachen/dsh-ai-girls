import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = resolve(
  process.env.DSH_PROFILE_DIR ?? join(homedir(), ".dsh", "profiles", "desktop"),
);
const modules = resolve(
  process.env.DSH_NODE_MODULES ??
    join(homedir(), ".dsh", "profiles", "node_modules"),
);
const executable = join(root, "dist", "AiGirls.Desktop.exe");
const compiler = join(
  process.env.WINDIR ?? "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe",
);
const patch = join(profile, "cordis.patch.yml");
const packages = Object.fromEntries(
  [
    "cordis",
    "dsh-session",
    "dsh-agent",
    "dsh-session-projection",
    "dsh-session-title",
  ].map((name) => {
    const file = join(modules, "@deepseek-ai", name, "package.json");
    return [
      name,
      existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).version : null,
    ];
  }),
);
const patchText = existsSync(patch) ? readFileSync(patch, "utf8") : "";
const result = {
  platform: process.platform,
  node: process.versions.node,
  project: root,
  compiler: existsSync(compiler),
  desktopBuilt: existsSync(executable),
  desktopBuiltAt: existsSync(executable)
    ? statSync(executable).mtime.toISOString()
    : null,
  profile,
  profilePatchExists: existsSync(patch),
  localEntryConfigured: patchText.includes(
    "# BEGIN dsh-ai-girls local development",
  ),
  hostPackages: packages,
  note: "这里只检查文件与依赖；宿主实际加载和桌面显示请按 docs/manual-verification.md 验证。",
};
console.log(JSON.stringify(result, null, 2));
if (
  process.platform !== "win32" ||
  Number(process.versions.node.split(".")[0]) < 22 ||
  !result.compiler ||
  !result.desktopBuilt ||
  !result.profilePatchExists ||
  Object.values(packages).some((v) => v === null)
)
  process.exitCode = 1;
