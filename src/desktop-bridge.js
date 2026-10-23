import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function launchDesktop(
  executable,
  {
    args = [],
    onMessage = () => {},
    onError = () => {},
    onExit = () => {},
  } = {},
) {
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let disposed = false;
  let closed = false;
  let disposal;
  let pending = null;
  let blocked = false;
  const flush = () => {
    if (disposed || closed || blocked || !pending || child.stdin.destroyed)
      return;
    const message = pending;
    pending = null;
    blocked = !child.stdin.write(message);
  };
  child.stdin.on("drain", () => {
    blocked = false;
    flush();
  });
  child.stdin.on("error", (error) => {
    if (!disposed) onError(error);
  });
  child.on("error", onError);
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    onMessage(message);
  });
  child.stderr.on("data", (data) =>
    onError(new Error(String(data).slice(0, 500))),
  );
  child.on("close", (code, signal) => {
    closed = true;
    pending = null;
    lines.close();
    onExit({ code, signal, disposed });
  });
  return {
    child,
    send(snapshot) {
      if (disposed || closed) return;
      pending = JSON.stringify(snapshot) + "\n";
      flush();
    },
    dispose() {
      if (disposal) return disposal;
      if (closed) return Promise.resolve();
      disposed = true;
      pending = null;
      child.stdin.end();
      disposal = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!closed) child.kill();
        }, 2000);
        timeout.unref();
        child.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      return disposal;
    },
  };
}
