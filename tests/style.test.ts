import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI = join(__dirname, "..", "src", "ui");
const tokensText = readFileSync(join(UI, "styles", "tokens.css"), "utf8");

/** 讀出 tokens.css 裡 --name: #rrggbb 的色票 */
function colorTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tokensText.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("樣式 token", () => {
  const c = colorTokens();

  it("文字色在頁面底、面板、凹陷處上的對比 ≥ 4.5:1", () => {
    for (const text of ["text", "muted", "accent", "warn", "bad", "good"]) {
      for (const ground of ["bg", "panel", "sunken"]) {
        expect(contrast(c[text], c[ground]), `${text} 在 ${ground} 上`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("進度條上的文字在填色上的對比 ≥ 4.5:1", () => {
    expect(contrast(c.text, c["accent-dim"])).toBeGreaterThanOrEqual(4.5);
  });

  it("邊線與底色要看得出來，但不能比文字更搶眼", () => {
    expect(contrast(c.line, c.panel)).toBeGreaterThan(1.2);
    expect(contrast(c.line, c.panel)).toBeLessThan(contrast(c.muted, c.panel));
  });

  it("除了 tokens.css，介面樣式與程式都不寫死色碼", () => {
    const files = [
      ...readdirSync(join(UI, "styles")).filter((f) => f !== "tokens.css").map((f) => join(UI, "styles", f)),
      join(UI, "style.css"),
      ...readdirSync(UI).filter((f) => f.endsWith(".ts")).map((f) => join(UI, f)),
    ];
    for (const f of files) {
      const hits = readFileSync(f, "utf8").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
      expect(hits, `${f} 有寫死的色碼`).toEqual([]);
    }
  });

  it("所有 var(--名稱) 都有在 tokens.css 定義", () => {
    const defined = new Set([...tokensText.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const files = [...readdirSync(join(UI, "styles")).map((f) => join(UI, "styles", f)), join(UI, "style.css")];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/var\(--([a-z0-9-]+)/g)) {
        expect(defined.has(m[1]), `${f} 用了未定義的 --${m[1]}`).toBe(true);
      }
    }
  });
});
