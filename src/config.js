import Schema from "@deepseek-ai/schemastery";
import { loadPreferences, manifest } from "./companion.js";

const initial = loadPreferences();
const character = () => Schema.union(manifest.characters.map(({ id, label }) => Schema.const(id).description(label)));

// DSH exposes volatile Config fields through its settings service.
export const Config = Schema.object({
  preferences: Schema.object({
    id: character().default(initial.id).description("角色形态"),
    scale: Schema.union([0.75, 1, 1.25, 1.5].map((value) => Schema.const(value).description(`${value * 100}%`))).default(initial.scale).description("角色大小"),
    mode: Schema.union([
      ["fixed", "固定当前角色"], ["sequential", "顺序轮换"],
      ["favorites", "收藏轮换"], ["random", "随机轮换"],
    ].map(([value, label]) => Schema.const(value).description(label))).default(initial.mode).description("角色轮换"),
    rotationSeconds: Schema.number().min(1).max(3600).step(1).default(initial.rotationSeconds).description("轮换间隔（秒）"),
    bubbleHidden: Schema.boolean().default(initial.bubbleHidden).description("隐藏任务气泡"),
    favorites: Schema.array(character()).default(initial.favorites).description("收藏的角色形态"),
  }).default(initial).description("角色与显示").volatile(),
});
