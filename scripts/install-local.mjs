import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { updateProfilePatch } from "./profile-patch.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = resolve(
  process.env.DSH_PROFILE_DIR ?? join(homedir(), ".dsh", "profiles", "desktop"),
);
const patch = join(profile, "cordis.patch.yml");
if (!existsSync(patch)) throw new Error("找不到 profile patch：" + patch);
const remove = process.argv.includes("--remove");
if (!remove && !existsSync(join(root, "dist", "AiGirls.Desktop.exe")))
  throw new Error("请先运行 npm run build。");
const old = readFileSync(patch, "utf8");
const next = updateProfilePatch(
  old,
  pathToFileURL(join(root, "src", "index.js")).href,
  remove,
);
if (next !== old) {
  const backup = patch + ".ai-girls-backup-" + Date.now();
  copyFileSync(patch, backup);
  writeFileSync(patch, next, "utf8");
  console.log(
    JSON.stringify({
      profile,
      backup,
      action: remove ? "removed" : "installed",
    }),
  );
} else console.log("Profile already matches.");
