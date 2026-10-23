const begin = "# BEGIN dsh-ai-girls local development";
const end = "# END dsh-ai-girls local development";

export function updateProfilePatch(old, entry, remove = false) {
  const start = old.indexOf(begin),
    finish = old.indexOf(end);
  if (
    start < 0 !== finish < 0 ||
    (start >= 0 &&
      (finish < start ||
        old.indexOf(begin, start + 1) >= 0 ||
        old.indexOf(end, finish + 1) >= 0))
  ) {
    throw new Error("本地开发标记不完整或重复，请先检查 patch。");
  }
  const body = `${begin}\n- insert:\n    - id: dsh-ai-girls\n      name: ${JSON.stringify(entry)}\n${end}`;
  if (start >= 0) {
    const next =
      old.slice(0, start) +
      (remove ? "" : body) +
      old.slice(finish + end.length);
    return next.trim() ? next : "[]\n";
  }
  if (remove) return old;
  if (/^\s*-?\s*id:\s*dsh-ai-girls\s*$/m.test(old))
    throw new Error(
      "profile 中已有非本脚本管理的 dsh-ai-girls，请先确认加载入口。",
    );
  const prefix = old.trim() === "[]" ? "" : old.replace(/\s*$/, "");
  return (prefix ? prefix + "\n\n" : "") + body + "\n";
}
