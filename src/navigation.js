// Uses DSH's authenticated Connection RPC and official client workspace service.
// A short-lived request survives restoring a hidden renderer; it never starts a turn.
export function createNavigation(ctx, { now = Date.now } = {}) {
  let request = null, revision = 0;
  ctx.inject(["connection"], (scope) => {
    for (const method of ["navigation", "ack"]) scope.connection.fetch.register({
      path: `/api/dsh-ai-girls/${method}`,
      methods: ["POST"],
      requestBody: "buffered",
      async fetch(httpRequest) {
        const envelope = await httpRequest.json();
        if (envelope.type !== "client-request" || typeof envelope.rpcId !== "string" || envelope.method !== `dsh-ai-girls/${method}`) return new Response("Invalid navigation request", { status: 400 });
        if (method === "ack" && envelope.payload?.revision === request?.revision) request = null;
        const value = method === "navigation" && request && now() - request.createdAt < 15000 ? request : null;
        return Response.json({ type: "server-response", rpcId: envelope.rpcId, result: { ok: true, value } });
      },
    });
  });
  return (sessionId) => { request = { sessionId, revision: ++revision, createdAt: now() }; };
}
