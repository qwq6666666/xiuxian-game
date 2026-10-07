import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 遞迴列出資料夾下的 .ts 檔，回傳相對於 dir 的路徑（正斜線） */
export function tsFiles(dir: string): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : f.endsWith(".ts") ? [relative(dir, p).replace(/\\/g, "/")] : [];
    });
  return walk(dir);
}
