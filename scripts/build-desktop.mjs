import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32")
  throw new Error("桌面程序当前仅支持 Windows。");
const root = fileURLToPath(new URL("..", import.meta.url));
const framework = join(
  process.env.WINDIR ?? "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
);
const compiler = join(framework, "csc.exe");
if (!existsSync(compiler))
  throw new Error("需要 Windows .NET Framework 4.x 编译器。");
mkdirSync(resolve(root, "dist"), { recursive: true });
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
