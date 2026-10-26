import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { desktopExecutable } from "../src/desktop-path.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const executable = desktopExecutable();
if (!executable || !existsSync(executable)) throw new Error("请先运行 npm run build，生成当前平台桌面程序。");
const output = resolve(root, "dist/packages");
const stage = resolve(root, "work/release-package");
// This directory belongs only to this packaging script.
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const entry of manifest.files) {
  if (process.platform === "win32" && entry === "dist/AiGirls.Desktop.app") continue;
  if (process.platform === "darwin" && ["dist/AiGirls.Desktop.exe", "dist/assets", "dist/LICENSE"].includes(entry)) continue;
  if (existsSync(join(root, entry))) cpSync(join(root, entry), join(stage, entry), { recursive: true });
}
// Release installs need no compiler or lifecycle scripts. Git installs retain
// the source manifest's prepare hook and compile on the user's platform.
delete manifest.scripts;
delete manifest.files;
manifest.os = [process.platform];
if (process.platform === "darwin") manifest.cpu = [process.arch];
writeFileSync(join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("请通过 npm run package 执行。");
const packed = JSON.parse(execFileSync(process.execPath, [npmCli, "pack", stage, "--ignore-scripts", "--json", "--pack-destination", output], { encoding: "utf8" }))[0];
const target = `${manifest.name}-${manifest.version}-${process.platform}${process.platform === "darwin" ? "-" + process.arch : ""}.tgz`;
renameSync(join(output, packed.filename), join(output, target));
rmSync(stage, { recursive: true, force: true });
console.log(join(output, target));
