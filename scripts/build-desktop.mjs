import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(resolve(root, "dist"), { recursive: true });
if (process.platform === "darwin") {
  const contents = resolve(root, "dist/AiGirls.Desktop.app/Contents");
  mkdirSync(join(contents, "MacOS"), { recursive: true });
  cpSync(resolve(root, "assets"), join(contents, "Resources/assets"), { recursive: true });
  cpSync(resolve(root, "LICENSE"), join(contents, "Resources/LICENSE"));
  writeFileSync(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.dsh.ai-girls</string>
<key>CFBundleName</key><string>AI 娘值班室</string>
<key>CFBundleExecutable</key><string>AiGirls.Desktop</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`);
  execFileSync("xcrun", [
    "swiftc", "-swift-version", "5", "-O", "-framework", "AppKit",
    resolve(root, "desktop/Overlay.swift"),
    "-o", join(contents, "MacOS/AiGirls.Desktop"),
  ], { stdio: "inherit" });
  console.log("Built dist/AiGirls.Desktop.app");
  process.exit(0);
}
if (process.platform !== "win32")
  throw new Error("桌面程序支持 Windows 与 macOS。");
const framework = join(
  process.env.WINDIR ?? "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
);
cpSync(resolve(root, "assets"), resolve(root, "dist/assets"), { recursive: true });
cpSync(resolve(root, "LICENSE"), resolve(root, "dist/LICENSE"));
const compiler = join(framework, "csc.exe");
if (!existsSync(compiler))
  throw new Error("需要 Windows .NET Framework 4.x 编译器。");
const references = [
  "System.dll",
  "System.Core.dll",
  "System.Web.Extensions.dll",
  "System.Xaml.dll",
  "WPF/WindowsBase.dll",
  "WPF/PresentationCore.dll",
  "WPF/PresentationFramework.dll",
];
execFileSync(
  compiler,
  [
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:" + resolve(root, "dist/AiGirls.Desktop.exe"),
    ...references.map((p) => "/reference:" + join(framework, p)),
    resolve(root, "desktop/Overlay.cs"),
  ],
  { stdio: "inherit" },
);
console.log("Built dist/AiGirls.Desktop.exe");
