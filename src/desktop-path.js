import { fileURLToPath } from "node:url";

export function desktopExecutable(platform = process.platform) {
  const file = { win32: "AiGirls.Desktop.exe", darwin: "AiGirls.Desktop.app/Contents/MacOS/AiGirls.Desktop" }[
    platform
  ];
  return file ? fileURLToPath(new URL(`../dist/${file}`, import.meta.url)) : null;
}
