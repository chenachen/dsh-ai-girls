import test from "node:test";
import assert from "node:assert/strict";
import { launchDesktop } from "../src/desktop-bridge.js";

test("stdio transfers Unicode snapshots and disposal waits for process exit", async () => {
  let resolveMessage;
  const received = new Promise((r) => (resolveMessage = r));
  let closed = false;
  const bridge = launchDesktop(process.execPath, {
    args: [
      "-e",
      "process.stdin.on('data', b=>process.stdout.write(b)); process.stdin.on('end',()=>process.exit(0));",
    ],
    onMessage: resolveMessage,
    onExit: () => {
      closed = true;
    },
    onError: (e) => {
      throw e;
    },
  });
  bridge.send({ type: "snapshot", tasks: [{ title: "测试鲸娘" }] });
  assert.equal((await received).tasks[0].title, "测试鲸娘");
  await bridge.dispose();
  assert.equal(closed, true);
  bridge.send({ type: "snapshot", tasks: [] });
  await bridge.dispose();
});

test("spawn failure reports once and closes instead of leaving a live bridge", async () => {
  let errors = 0,
    resolveClosed;
  const done = new Promise((r) => (resolveClosed = r));
  const bridge = launchDesktop("missing-ai-girls-test-executable", {
    onError: () => errors++,
    onExit: resolveClosed,
  });
  await done;
  assert.equal(errors, 1);
  await bridge.dispose();
});

test("backpressure sends the latest snapshot without replaying every intermediate state", async () => {
  const seen = [];
  let complete;
  const done = new Promise((resolve) => {
    complete = resolve;
  });
  const bridge = launchDesktop(process.execPath, {
    args: [
      "-e",
      "require('node:readline').createInterface({input:process.stdin}).on('line',line=>process.stdout.write(JSON.stringify({revision:JSON.parse(line).revision})+'\\n'));",
    ],
    onMessage: (message) => {
      seen.push(message.revision);
      if (message.revision === 49) complete();
    },
    onError: (error) => {
      throw error;
    },
  });
  for (let revision = 0; revision < 50; revision++)
    bridge.send({ revision, payload: "x".repeat(262144) });
  await done;
  await bridge.dispose();
  assert.equal(seen[0], 0);
  assert.equal(seen.at(-1), 49);
  assert.ok(seen.length < 50);
});
