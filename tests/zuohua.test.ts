import { describe, expect, it } from "vitest";
import { canZuohua, setSchedule, zuohua, zuohuaDaoYun } from "../src/core/actions";
import { deserialize, serialize } from "../src/core/save";
import { endLife } from "../src/core/review";
import { scheduleOpen } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { validateGameData, validateRealms, validateSchedules } from "../src/data/validate";
import { formatLogEntry, reviewTitle } from "../src/ui/format";
import { living } from "./helpers";

const wander = gameData.schedules.find((s) => s.id === "wander")!;
const jindan = (patch = {}) => living(1, { realmId: "jindan", stage: 0, ageMonths: 100 * 12, ...patch });

describe("走訪渡口", () => {
  it("練氣之後才開放，凡人選不了", () => {
    expect(scheduleOpen(living(1), wander)).toBe(false);
    expect(setSchedule(living(1), "wander").schedule).toBe("retreat");
    const s = living(1, { realmId: "lianqi" });
    expect(scheduleOpen(s, wander)).toBe(true);
    expect(setSchedule(s, "wander").schedule).toBe("wander");
  });

  it("沒有 realmMin 的安排一開始就開放；realmMin 必須是存在的境界", () => {
    expect(scheduleOpen(living(1), gameData.schedules[0])).toBe(true);
    expect(() => validateSchedules([{ ...wander, realmMin: 5 }])).toThrow("realmMin");
    expect(() => validateGameData({ ...gameData, schedules: [{ ...wander, realmMin: "ghost" }] })).toThrow("ghost");
  });
});

describe("閉關坐化", () => {
  it("只有設定了 zuohua 的境界可以，且要在修行中", () => {
    expect(canZuohua(jindan())).toBe(true);
    expect(canZuohua(living(1, { realmId: "zhuji" }))).toBe(false);
    expect(canZuohua(jindan({ phase: "dead" }))).toBe(false);
    expect(canZuohua({ ...jindan(), pendingEvent: "cave_001" })).toBe(false);
    expect(zuohua(living(1, { realmId: "zhuji" }))).toEqual(living(1, { realmId: "zhuji" }));
  });

  it("剩餘壽元每年換得道韻（整年、無條件捨去）", () => {
    // 金丹壽元 500 年，一百歲時剩 400 年
    expect(zuohuaDaoYun(jindan())).toBe(Math.floor(400 * 0.15));
    expect(zuohuaDaoYun(jindan({ ageMonths: 100 * 12 + 11 }))).toBe(Math.floor(399 * 0.15));
    expect(zuohuaDaoYun(living(1, { realmId: "zhuji" }))).toBe(0);
  });

  it("結束這一世：回顧記為 zuohua，道韻比壽盡多出剩餘壽元的部分", () => {
    const s = jindan();
    const t = zuohua(s);
    expect(t.phase).toBe("dead");
    expect(t.review?.cause).toBe("zuohua");
    expect(t.log[t.log.length - 1].kind).toBe("zuohua");
    const died = endLife(s, "lifespan");
    const gain = (x: typeof t) => x.review!.daoYunBase + x.review!.daoYunBonus;
    expect(gain(t) - gain(died)).toBe(zuohuaDaoYun(s));
    expect(t.meta.daoYun - died.meta.daoYun).toBe(zuohuaDaoYun(s));
    expect(t.meta.lives).toBe(s.meta.lives + 1);
    // 坐化不算通關，也不算元嬰
    expect(t.meta.clears).toEqual(s.meta.clears);
    expect(t.meta.yuanying).toEqual(s.meta.yuanying);
  });

  it("日誌與回顧文字、存讀檔", () => {
    const t = zuohua(jindan());
    expect(formatLogEntry(t.log[t.log.length - 1], gameData, t.name)).toContain("靜室");
    expect(reviewTitle(t.review)).toBe("閉關坐化");
    expect(deserialize(serialize(t))).toEqual(t);
  });

  it("realms.json 的 zuohua 欄位檢查", () => {
    const realms = gameData.realms.map((r) => ({ ...r }));
    const j = realms.findIndex((r) => r.id === "jindan");
    const bad = (zuohuaValue: unknown) => () => validateRealms(realms.map((r, i) => (i === j ? { ...r, zuohua: zuohuaValue } : r)));
    expect(bad({ daoYunPerYear: 0 })).toThrow("daoYunPerYear");
    expect(bad({ daoYunPerYear: "x" })).toThrow("daoYunPerYear");
  });
});
