import { describe, expect, it } from "vitest";
import { LOG_KINDS } from "../src/core/state";
import { gameData } from "../src/data/load";
import { formatAgeZh, formatLogEntry, toChineseNumber } from "../src/ui/format";

describe("format", () => {
  it("中文數字", () => {
    expect(toChineseNumber(10)).toBe("十");
    expect(toChineseNumber(11)).toBe("十一");
    expect(toChineseNumber(32)).toBe("三十二");
    expect(toChineseNumber(80)).toBe("八十");
    expect(toChineseNumber(100)).toBe("一百");
    expect(toChineseNumber(105)).toBe("一百零五");
    expect(toChineseNumber(110)).toBe("一百一十");
    expect(toChineseNumber(119)).toBe("一百一十九");
    expect(toChineseNumber(120)).toBe("一百二十");
  });

  it("年齡與季節", () => {
    expect(formatAgeZh(120)).toBe("十歲春");
    expect(formatAgeZh(32 * 12 + 4)).toBe("三十二歲夏");
    expect(formatAgeZh(32 * 12 + 11)).toBe("三十二歲冬");
  });

  it("日誌文字", () => {
    const up = formatLogEntry({ month: 400, kind: "stageUp", realmId: "lianqi", stage: 2 }, gameData);
    expect(up).toContain("三十三歲");
    expect(up).toContain("練氣三層");
    const death = formatLogEntry({ month: 119 * 12, kind: "death", realmId: "lianqi", stage: 5 }, gameData);
    expect(death).toContain("享年一百一十九歲，終身練氣六層");
  });

  it("突破成功的文字：築基用 GDD 範例，不帶吐槽", () => {
    const text = formatLogEntry({ month: 600, kind: "breakthroughSuccess", realmId: "zhuji", stage: 0 }, gameData);
    expect(text).toContain("丹田之中靈氣如潮，百脈俱震。一炷香後，天地復歸寂靜。你已築基。");
  });

  it("購買與拾得會帶入物品名稱", () => {
    const buy = formatLogEntry({ month: 500, kind: "buy", realmId: "mortal", stage: 0, itemId: "juqi_dan" }, gameData);
    expect(buy).toContain("聚氣丹");
    const find = formatLogEntry({ month: 501, kind: "find", realmId: "mortal", stage: 0, itemId: "zhuji_dan" }, gameData);
    expect(find).toContain("築基丹");
  });

  it("日誌文字不含未填入的佔位符，每段不超過三句", () => {
    const kinds = LOG_KINDS;
    for (const kind of kinds) {
      for (let month = 0; month < 8; month++) {
        const text = formatLogEntry(
          { month: 1200 + month, kind, realmId: "lianqi", stage: 1, itemId: "juqi_dan" },
          gameData,
        );
        expect(text).not.toMatch(/[{}]/);
        // 去掉年齡前綴後，句號數即句數
        expect((text.match(/。/g) ?? []).length).toBeLessThanOrEqual(3);
      }
    }
  });
});
