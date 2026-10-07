import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 遊戲敘述一律用第一人稱「我」；只有引號「」裡別人對主角說的話可以用「你」（目前沒有這種句子，之後有再放行） */
function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsonFiles(p) : p.endsWith(".json") ? [p] : [];
  });
}

describe("敘述視角", () => {
  it("資料檔的玩家可見文字不稱主角為「你」（引號內的對白除外）", () => {
    const bad: string[] = [];
    for (const file of jsonFiles("src/data")) {
      const text = readFileSync(file, "utf8");
      const outside = text.replace(/「[^」]*」/g, "");
      if (outside.includes("你")) bad.push(file);
    }
    expect(bad, "這些檔案的敘述出現了「你」；改成「我」，或把別人的話放進「」").toEqual([]);
  });

  it("介面程式碼的玩家可見文字也不稱主角為「你」", () => {
    const bad: string[] = [];
    for (const dir of ["src/ui", "src/core"]) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
        const lines = readFileSync(join(dir, f), "utf8").split("\n");
        lines.forEach((line, i) => {
          if (line.includes("你") && !/^\s*(\/\/|\*|\/\*)/.test(line)) bad.push(`${dir}/${f}:${i + 1}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });
});
