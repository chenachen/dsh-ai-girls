import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const suffix = `${process.platform}${process.platform === "darwin" ? "-" + process.arch : ""}`;
const archive = join(root, "dist/packages", `${source.name}-${source.version}-${suffix}.tgz`);
const directory = mkdtempSync(join(tmpdir(), "dsh-ai-girls-install-"));
try {
  writeFileSync(join(directory, "package.json"), '{"private":true,"type":"module"}');
  execFileSync(process.execPath, [process.env.npm_execpath, "install", archive, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: directory, stdio: "inherit" });
  // Resolve from the clean installation, never from this source checkout.
  const probe = `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync } from 'node:fs';
    import * as plugin from 'dsh-ai-girls';
    const root = new URL('./', import.meta.resolve('dsh-ai-girls/package.json'));
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
    assert.equal(pkg.scripts, undefined);
    assert.equal(plugin.name, 'dsh-ai-girls');
    assert.ok(plugin.Config);
    const native = process.platform === 'win32' ? 'dist/AiGirls.Desktop.exe' : 'dist/AiGirls.Desktop.app/Contents/MacOS/AiGirls.Desktop';
    assert.ok(existsSync(new URL(native, root)), native);
    const assets = process.platform === 'win32' ? 'dist/assets/' : 'dist/AiGirls.Desktop.app/Contents/Resources/assets/';
    const manifest = JSON.parse(readFileSync(new URL(assets + 'manifest.json', root), 'utf8'));
    for (const {id} of manifest.characters) assert.ok(existsSync(new URL(assets + 'sprites/' + id + '.png', root)), id);
    console.log('Clean package install: plugin imports, native executable and all 10 sprites present; lifecycle scripts disabled.');
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: directory, stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
