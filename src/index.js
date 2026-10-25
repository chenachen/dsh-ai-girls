import { startHost } from "./host-runtime.js";
import { Config } from "./config.js";
export { Config };
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
export default { name, inject, Config, apply };
