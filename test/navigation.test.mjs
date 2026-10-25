import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createNavigation } from "../src/navigation.js";

test("navigation survives polling until acknowledged; stale acknowledgements cannot consume a newer click", async () => {
  const routes = new Map();
  let now = 1000;
  const navigate = createNavigation({ inject(_deps, apply) { apply({ connection: { fetch: { register(route) { routes.set(route.path, route); } } } }); } }, { now: () => now });
  async function call(method, payload = {}) {
    const path = `/api/dsh-ai-girls/${method}`;
    const response = await routes.get(path).fetch(new Request("http://localhost" + path, { method: "POST", body: JSON.stringify({ type: "client-request", rpcId: "test", method: `dsh-ai-girls/${method}`, payload }) }));
    const data = await response.json();
    assert.equal(data.rpcId, "test");
    assert.equal(data.type, "server-response");
    return data.result.value;
  }
  navigate("session-A");
  const first = await call("navigation");
  assert.equal(first.sessionId, "session-A");
  assert.deepEqual(await call("navigation"), first);
  navigate("session-B");
  await call("ack", { revision: first.revision });
  const second = await call("navigation");
  assert.equal(second.sessionId, "session-B");
  await call("ack", { revision: second.revision });
  assert.equal(await call("navigation"), null);
  navigate("expired"); now += 16000;
  assert.equal(await call("navigation"), null);
});

test("client uses the official workspace service once and aborts polling on unload", async () => {
  let plugin, dispose, nextPoll, abortSignal;
  const opens = [], calls = [];
  vm.runInNewContext(readFileSync(new URL("../src/client.js", import.meta.url), "utf8"), {
    window: { __ModuleLoader__: { load({ factory }) { plugin = factory(() => ({})); } } },
    AbortController, console,
    setTimeout(callback) { nextPoll = callback; return 1; }, clearTimeout() { nextPoll = null; },
  });
  plugin.apply({
    effect(start) { const cleanup = start(); if (cleanup) dispose = cleanup; },
    slots: { inject() {} },
    configForms: { get() { return {}; } },
    connection: { rpc: { async call(channel, endpoint, payload, signal) { calls.push([channel, endpoint]); abortSignal = signal; return { ok: true, value: endpoint.endsWith("navigation") ? { revision: 1, sessionId: "session-A" } : null }; } } },
    uiWorkspace: { openSession(id) { opens.push(id); } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(opens, ["session-A"]);
  assert.deepEqual(calls[0], ["/api", "dsh-ai-girls/navigation"]);
  await nextPoll();
  assert.deepEqual(opens, ["session-A"]);
  dispose(); assert.equal(abortSignal.aborted, true); assert.equal(nextPoll, null);
});
