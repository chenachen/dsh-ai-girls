import { z } from "zod";
import { TaskStore, executionEvents } from "./task-store.js";

export const projectionKey = "aiGirlsExecution";
const nullableTime = z.number().finite().nullable();
const stateSchema = z.object({
  id: z.string(),
  title: z.string(),
  parentId: z.string().nullable(),
  state: z.enum([
    "idle",
    "running",
    "approval",
    "input",
    "completed",
    "failed",
    "stopped",
    "blocked",
    "interrupted",
  ]),
  stage: z.string(),
  detail: z.string(),
  startedAt: nullableTime,
  endedAt: nullableTime,
  turn: z.number().nullable(),
  lastSeq: z.number(),
  calls: z.array(
    z.tuple([
      z.string(),
      z.object({ stage: z.string(), detail: z.string(), waiting: z.boolean() }),
    ]),
  ),
  approvals: z.array(z.tuple([z.string(), z.string()])),
});

// Host owns replay/checkpoints. Keep execution metadata, never model text or tool arguments.
export const executionProjection = {
  key: projectionKey,
  stateVersion: 3,
  stateSchema,
  init(header) {
    const store = new TaskStore();
    store.ensure({ id: header.id, header });
    return store.exportTask(header.id);
  },
  apply(state, event) {
    if (!executionEvents.has(event.type)) return state;
    const store = new TaskStore();
    store.restore(state);
    store.event({ id: state.id }, event);
    return store.exportTask(state.id);
  },
};
