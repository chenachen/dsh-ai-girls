import { execFileSync } from "node:child_process";
import { desktopExecutable } from "../src/desktop-path.js";

if (process.platform !== "darwin") throw new Error("原生像素检查目前使用 macOS AppKit；请在 macOS 构建后运行。");
execFileSync(desktopExecutable(), ["--verify-assets"], { stdio: "inherit" });
