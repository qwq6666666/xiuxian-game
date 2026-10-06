import { describe, expect, it } from "vitest";
import { gameData as data } from "../src/data/load";
import { icon, itemIconName } from "../src/ui/icons";
import { sceneHtml } from "../src/ui/scene";
import { themeOf, vignetteHtml } from "../src/ui/vignette";

describe("圖示", () => {
  it("每個物品都有專屬圖示（不是預設圈圈）", () => {
    for (const item of data.items) expect(itemIconName(item), item.id).not.toBe("fallback");
  });
  it("圖示是純向量：沒有寫死色碼，顏色跟隨文字", () => {
    for (const item of data.items) {
      const svg = icon(itemIconName(item));
      expect(svg).toContain("currentColor");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb/);
    }
  });
});

describe("事件配圖", () => {
  const all = data.events.filter((e) => e.type === "choice");
  it("每則抉擇事件都畫得出來，同一則事件每次都一樣", () => {
    for (const ev of all) {
      const a = vignetteHtml(ev, "zhuji");
      expect(a).toContain("<svg");
      expect(vignetteHtml(ev, "zhuji")).toBe(a);
    }
  });
  it("主題由 id 字眼判斷；沒有的就依雜湊分配，不會全部同一幅", () => {
    expect(themeOf("zhuji_well_001")).toBe("water");
    expect(themeOf("sect_exam_001")).toBe("hall");
    expect(themeOf("zhuji_dream_ferry_001")).toBe("night");
    const themes = new Set(all.map((e) => themeOf(e.id)));
    expect(themes.size).toBeGreaterThanOrEqual(6);
  });
  it("配圖與場景都不含色碼，色彩只走樣式變數", () => {
    for (const html of [sceneHtml(), ...all.slice(0, 20).map((e) => vignetteHtml(e, "lianqi"))]) expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
  });
});
