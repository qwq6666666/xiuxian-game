import { describe, expect, it } from "vitest";
import { LOG_KINDS } from "../src/core/state";
import { gameData } from "../src/data/load";
import { choiceBlockReason, choiceSureCost, formatAgeZh, formatChanges, formatLogEntry, formatOffline, toChineseNumber } from "../src/ui/format";

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
    // 享年與終身境界改由一生回顧呈現，日誌只留一句收束
    const death = formatLogEntry({ month: 119 * 12, kind: "death", realmId: "lianqi", stage: 5 }, gameData);
    expect(death).toBe("你的這一世，至此落幕。");
  });

  it("突破成功的文字：築基用 GDD 範例，不帶吐槽", () => {
    const text = formatLogEntry({ month: 600, kind: "breakthroughSuccess", realmId: "zhuji", stage: 0 }, gameData);
    expect(text).toContain("丹田之中靈氣如潮，百脈俱震。一炷香後，天地復歸寂靜。你已築基。");
  });

  it("事件日誌：見聞用事件文字，抉擇用所選結果的文字，並帶標題", () => {
    const anec = formatLogEntry({ month: 450, kind: "event", realmId: "lianqi", stage: 0, eventId: "mountain_001" }, gameData);
    expect(anec).toBe("三十七歲秋，【山澗靜坐】你於山澗旁靜坐三日，忽有所悟。起身時方知，所悟者不過是腿麻了。");
    const choice = formatLogEntry(
      { month: 450, kind: "event", realmId: "lianqi", stage: 0, eventId: "cave_001", choice: 1, outcome: 0 },
      gameData,
    );
    expect(choice).toBe("三十七歲秋，【山中古洞】你在洞外的山石上刻下記號。");
    expect(() => formatLogEntry({ month: 1, kind: "event", realmId: "lianqi", stage: 0, eventId: "ghost" }, gameData)).toThrow("ghost");
  });

  it("數值變化另外顯示，不寫進敘述", () => {
    expect(formatChanges(undefined, gameData)).toEqual([]);
    expect(
      formatChanges(
        {
          cultivation: 45,
          spiritStones: -30,
          lifespan: -5,
          attributes: { mind: 1, bone: -1 },
          items: { juqi_dan: 2 },
        },
        gameData,
      ),
    ).toEqual(["修為 +45", "靈石 −30", "壽元上限 −5 年", "根骨 −1", "心性 +1", "聚氣丹 +2"]);
    expect(formatChanges({ spiritStones: 0 }, gameData)).toEqual([]);
    // 修為變化是實數：不顯示一長串小數，太小的不顯示
    expect(formatChanges({ cultivation: -0.2831420943732524 }, gameData)).toEqual(["修為 −0.3"]);
    expect(formatChanges({ cultivation: 12.6 }, gameData)).toEqual(["修為 +13"]);
    expect(formatChanges({ cultivation: 0.01 }, gameData)).toEqual([]);
  });

  it("選項前提不足時說明缺什麼", () => {
    const state = { spiritStones: 10, items: { juqi_dan: 1 } };
    expect(choiceBlockReason(undefined, state, gameData)).toBeNull();
    expect(choiceBlockReason({ spiritStones: 10 }, state, gameData)).toBeNull();
    expect(choiceBlockReason({ spiritStones: 30 }, state, gameData)).toBe("需要 30 靈石");
    expect(choiceBlockReason({ spiritStones: 30, items: { zhuji_dan: 1 } }, state, gameData)).toBe(
      "需要 30 靈石、築基丹 ×1",
    );
  });

  it("選項前提：屬性不足寫出門檻，殘卷不足不寫殘卷名稱", () => {
    const state = {
      spiritStones: 0,
      items: {},
      attributes: { bone: 3, insight: 8, fortune: 1, mind: 1 },
      meta: { fragments: ["f05"] },
    };
    expect(choiceBlockReason({ attributes: { insight: 7 } }, state, gameData)).toBeNull();
    expect(choiceBlockReason({ attributes: { bone: 7 } }, state, gameData)).toBe("需要 根骨 7");
    expect(choiceBlockReason({ fragments: ["f05"] }, state, gameData)).toBeNull();
    expect(choiceBlockReason({ fragments: ["f05", "f06"] }, state, gameData)).toBe("需要 一則尚未讀過的舊聞");
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
          { month: 1200 + month, kind, realmId: "lianqi", stage: 1, itemId: "juqi_dan", eventId: "mountain_001", monsterId: "hungry_wolf", trialId: "trial_lianqi" },
          gameData,
        );
        expect(text).not.toMatch(/[{}]/);
        // 去掉年齡前綴後，句號數即句數
        expect((text.match(/。/g) ?? []).length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("閉關見聞日誌", () => {
  const entry = (months: number, stop: "elapsed" | "bottleneck" | "lifespan") =>
    ({ month: 3000, kind: "retreat" as const, realmId: "lianqi", stage: 2, retreatMonths: months, stop, retreatNo: 3, retreatSeed: 99 });
  const { retreat } = gameData.text.log;
  const briefMonths = gameData.config.retreatBriefYears * 12 - 1;

  it("短關用簡短句，長關用拼接句，並帶年齡前綴", () => {
    const brief = formatLogEntry(entry(briefMonths, "elapsed"), gameData);
    expect(brief).toBe(`${formatAgeZh(3000)}，${retreat.brief[briefMonths % retreat.brief.length]}`);
    const long = formatLogEntry(entry(120, "elapsed"), gameData);
    expect(long.startsWith(`${formatAgeZh(3000)}，`)).toBe(true);
    expect(retreat.brief.some((t) => long.includes(t))).toBe(false);
  });

  it("同樣的輸入永遠得到同樣的文字", () => {
    expect(formatLogEntry(entry(100, "elapsed"), gameData)).toBe(formatLogEntry(entry(100, "elapsed"), gameData));
  });

  it("卡瓶頸或壽元將盡時以對應補句收尾，時間用完則不用", () => {
    const bottleneck = formatLogEntry(entry(100, "bottleneck"), gameData);
    const lifespan = formatLogEntry(entry(100, "lifespan"), gameData);
    const elapsed = formatLogEntry(entry(100, "elapsed"), gameData);
    expect(retreat.stop.bottleneck.some((t) => bottleneck.endsWith(t))).toBe(true);
    expect(retreat.stop.lifespan.some((t) => lifespan.endsWith(t))).toBe(true);
    expect([...retreat.stop.bottleneck, ...retreat.stop.lifespan].some((t) => elapsed.endsWith(t))).toBe(false);
  });
});

describe("離線回歸提示", () => {
  it("顯示閉關年月與修為，卡瓶頸或壽元將盡時附註原因", () => {
    expect(formatOffline({ months: 38, gained: 360.4, stop: "elapsed" })).toBe("閉關 3 年 2 個月，修為增加 360。");
    expect(formatOffline({ months: 24, gained: 10, stop: "bottleneck" })).toBe("閉關 2 年，修為增加 10，已至瓶頸。");
    expect(formatOffline({ months: 5, gained: 10, stop: "lifespan" })).toContain("壽元所剩不多");
    expect(formatOffline({ months: 0, gained: 0, stop: "elapsed" })).toBe("");
  });
});

describe("choiceSureCost", () => {
  const out = (stones: number, lifespan?: number) => ({ weight: 1, text: "x", effects: { spiritStones: stones, lifespan } });
  it("所有結果都扣靈石時列出最小值", () => {
    expect(choiceSureCost({ text: "a", outcomes: [out(-8)] })).toEqual(["必付 8 靈石"]);
    expect(choiceSureCost({ text: "a", outcomes: [out(-8), out(-3)] })).toEqual(["必付 3 靈石"]);
  });
  it("有結果不扣就不顯示", () => {
    expect(choiceSureCost({ text: "a", outcomes: [out(-8), out(0)] })).toEqual([]);
    expect(choiceSureCost({ text: "a", outcomes: [out(5)] })).toEqual([]);
  });
});
