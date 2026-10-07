import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAVE_VERSION } from "../src/core/state";
import { tsFiles } from "./fsutil";

// 守住 AGENTS.md 的架構規則：這些原本只靠文字約定，任何助手寫錯都不會有測試失敗。

const root = join(__dirname, "..");
const read = (path: string): string => readFileSync(join(root, path), "utf-8").replace(/\r\n/g, "\n");
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const coreFiles = (): string[] => tsFiles(join(root, "src/core"));

describe("core/ 的純度", () => {
  it("不使用 Math.random 與 Date.now（亂數走種子，時間由外部傳入）", () => {
    for (const f of coreFiles()) {
      const code = stripComments(read(`src/core/${f}`));
      expect(code, `src/core/${f}`).not.toMatch(/Math\.random\s*\(/);
      expect(code, `src/core/${f}`).not.toMatch(/Date\.now\s*\(/);
      expect(code, `src/core/${f}`).not.toMatch(/new Date\s*\(\s*\)/);
    }
  });

  it("不碰 DOM、瀏覽器儲存，也不 import ui/", () => {
    for (const f of coreFiles()) {
      const code = stripComments(read(`src/core/${f}`));
      expect(code, `src/core/${f}`).not.toMatch(/\b(document|window|localStorage|sessionStorage)\b/);
      expect(code, `src/core/${f}`).not.toMatch(/from\s+["'][^"']*\/ui\//);
    }
  });
});

/** state.ts 裡每個 interface 的欄位名稱，排序後比對 */
function stateShape(): Record<string, string[]> {
  const src = stripComments(read("src/core/state.ts"));
  const shape: Record<string, string[]> = {};
  for (const m of src.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
    shape[m[1]] = [...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]).sort();
  }
  return shape;
}

describe("存檔結構與版本", () => {
  const snapshotPath = "tests/save-shape.json";
  const snapshot = JSON.parse(read(snapshotPath)) as { version: number; shape: Record<string, string[]> };

  it("欄位有變動就必須升 SAVE_VERSION、寫遷移函式，並更新 tests/save-shape.json", () => {
    const shape = stateShape();
    if (JSON.stringify(shape) !== JSON.stringify(snapshot.shape) || snapshot.version !== SAVE_VERSION) {
      throw new Error(
        `存檔結構與 ${snapshotPath} 不一致。改動存檔結構時：1) 升 SAVE_VERSION；2) 在 save.ts 加遷移函式；3) 更新 ${snapshotPath}` +
          `（version 改成 ${SAVE_VERSION}，shape 改成：${JSON.stringify(shape)}）。`,
      );
    }
  });

  it("每個舊版本都有遷移函式", () => {
    const save = stripComments(read("src/core/save.ts"));
    const keys = [...save.matchAll(/^ {2}(\d+): /gm)].map((m) => Number(m[1]));
    for (let v = 1; v < SAVE_VERSION; v++) {
      expect(keys, `缺少從 v${v} 遷移到 v${v + 1} 的函式`).toContain(v);
    }
  });

  it("快照檔存在", () => {
    expect(existsSync(join(root, snapshotPath))).toBe(true);
  });
});
