import { startHost } from "./host-runtime.js";
export const name = "dsh-ai-girls";
export const inject = [
  "sessions",
  "agents",
  "sessionProjections",
  "sessionTitle",
];
export function apply(ctx, config = {}) {
  startHost(ctx, config);
}
export default { name, inject, apply };
