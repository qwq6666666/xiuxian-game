import { describe, expect, it } from "vitest";
import { composeRetreat, retreatMood, retreatThemeIndex } from "../src/core/retreattext";
import { pickClosing } from "../src/core/review";
import type { LogEntry } from "../src/core/state";
import { gameData } from "../src/data/load";
import { applyOffline } from "../src/core/offline";
import { deserialize, serialize } from "../src/core/save";
import { validateGameData } from "../src/data/validate";
import { living } from "./helpers";

const { retreat } = gameData.text.log;
const briefMonths = gameData.config.retreatBriefYears * 12;

const entry = (patch: Partial<LogEntry> = {}): LogEntry => ({
  month: 1200,
  kind: "retreat",
  realmId: "lianqi",
  stage: 2,
  retreatMonths: briefMonths + 12,
  stop: "elapsed",
  retreatNo: 0,
  retreatSeed: 7,
  ...patch,
});

describe("閉關見聞：語氣", () => {
  it("卡瓶頸偏焦躁，壽元將盡偏孤寂，其餘看已用壽元", () => {
    expect(retreatMood(entry({ stop: "bottleneck" }))).toBe("anxious");
    expect(retreatMood(entry({ stop: "lifespan" }))).toBe("lonely");
    expect(retreatMood(entry({ month: 12 * 10 }))).toBe("calm");
    const realm = gameData.realms.find((r) => r.id === "lianqi")!;
    expect(retreatMood(entry({ month: Math.ceil(realm.lifespan * 12 * gameData.config.retreatLonelyRatio) }))).toBe("lonely");
  });
});

describe("閉關見聞：意象一世內不重複", () => {
  it("同一個世界種子連續取 30 次，意象互不相同", () => {
    const n = retreat.themes.length;
    expect(n).toBeGreaterThanOrEqual(30);
    for (const seed of [1, 2, 12345]) {
      const picked = Array.from({ length: 30 }, (_, no) => retreatThemeIndex(no, seed, "lonely"));
      expect(new Set(picked).size).toBe(30);
    }
  });

  it("不孤寂的語氣不會抽到孤寂意象", () => {
    for (let no = 0; no < 100; no++) {
      expect(retreat.themes[retreatThemeIndex(no, 5, "calm")].lonely).toBe(false);
    }
  });

  it("不同世界種子的順序不同", () => {
    const a = Array.from({ length: 10 }, (_, no) => retreatThemeIndex(no, 1, "lonely"));
    const b = Array.from({ length: 10 }, (_, no) => retreatThemeIndex(no, 2, "lonely"));
    expect(a).not.toEqual(b);
  });
});

describe("閉關見聞：組句", () => {
  const all = (patch: Partial<LogEntry>): string[] =>
    Array.from({ length: 200 }, (_, no) => composeRetreat(entry({ ...patch, retreatNo: no, retreatSeed: no * 7 + 1 })));

  it("同樣的輸入永遠得到同樣的句子；沒有序號的舊檔也穩定", () => {
    expect(composeRetreat(entry())).toBe(composeRetreat(entry()));
    const old = entry({ retreatNo: undefined, retreatSeed: undefined });
    expect(composeRetreat(old)).toBe(composeRetreat(old));
  });

  it("每句不超過三句、沒有殘留的欄位、也沒有阿拉伯數字", () => {
    for (const patch of [{}, { stop: "bottleneck" as const }, { stop: "lifespan" as const }, { realmId: "zhuji" }, { realmId: "huashen" }, { realmId: "mortal" }]) {
      for (const t of all(patch)) {
        expect((t.match(/[。！？]/g) ?? []).length).toBeLessThanOrEqual(3);
        expect(t).not.toMatch(/[{}0-9]/);
      }
    }
  });

  it("焦躁與孤寂的感受句落在對應的池，罕見句帶「偶得」標記", () => {
    const anxious = all({ stop: "bottleneck" });
    const pool = retreat.feel.lianqi.anxious;
    const normal = anxious.filter((t) => !t.startsWith("【偶得】"));
    expect(normal.every((t) => pool.some((f) => t.includes(f)))).toBe(true);
    const rareShare = all({}).filter((t) => t.startsWith("【偶得】")).length / 200;
    expect(rareShare).toBeGreaterThan(0);
    expect(rareShare).toBeLessThan(gameData.config.retreatRareChance * 3);
  });

  it("吐槽收尾的比例接近設定值", () => {
    const texts = all({}).filter((t) => !t.startsWith("【偶得】"));
    const gag = texts.filter((t) => retreat.themes.some((th) => t.endsWith(th.gag))).length / texts.length;
    expect(Math.abs(gag - gameData.config.retreatGagChance)).toBeLessThan(0.12);
  });

  it("沒有專屬感受句的境界退回 default", () => {
    const t = composeRetreat(entry({ realmId: "mortal", retreatSeed: 3, retreatNo: 1 }));
    expect(t.length).toBeGreaterThan(10);
  });
});

describe("臨終句：條件與輪流", () => {
  const variants = gameData.text.review.lifespan;
  const idx = (pred: (v: (typeof variants)[number]) => boolean) => variants.findIndex(pred);

  it("持有物品、旗標、止步境界符合時優先使用", () => {
    const withFlag = living(1, { flags: ["child_grown"], items: {} });
    expect(variants[pickClosing(withFlag, "lifespan")].ifFlag).toBe("child_grown");
    const withPill = living(1, { items: { juqi_dan: 1 } });
    expect(variants[pickClosing(withPill, "lifespan")].ifItem).toBe("juqi_dan");
    const stuck = living(1, { realmId: "zhuji", items: {}, flags: [] });
    expect(variants[pickClosing(stuck, "lifespan")].ifRealmMax).toBe("zhuji");
  });

  it("沒有具體條件時，只用沒有條件或「有未完成目標」的句子", () => {
    const s = living(1, { realmId: "yuanying", items: {}, flags: [] });
    for (let lives = 0; lives < 30; lives++) {
      const v = variants[pickClosing({ ...s, meta: { ...s.meta, lives } }, "lifespan")];
      expect(v.ifItem ?? v.ifFlag ?? v.ifRealmMax).toBeUndefined();
    }
  });

  it("同樣的條件池，連續兩世不會用同一句", () => {
    const s = living(1, { realmId: "lianqi", items: {}, flags: [] });
    for (let lives = 0; lives < 10; lives++) {
      const a = pickClosing({ ...s, meta: { ...s.meta, lives } }, "lifespan");
      const b = pickClosing({ ...s, meta: { ...s.meta, lives: lives + 1 } }, "lifespan");
      expect(a).not.toBe(b);
    }
    expect(idx((v) => v.ifRealmMax === "lianqi")).toBeGreaterThanOrEqual(0);
  });

  it("沒有條件的句子一定存在，且總量足夠", () => {
    expect(variants.length).toBeGreaterThanOrEqual(24);
    expect(variants.some((v) => v.ifItem === undefined && v.ifFlag === undefined && v.ifRealmMax === undefined && !v.ifGoalMissed)).toBe(true);
  });
});

describe("閉關見聞文案本身", () => {
  it("規模與禁用詞", () => {
    expect(retreat.themes.length).toBeGreaterThanOrEqual(30);
    expect(retreat.themes.filter((t) => t.lonely).length).toBeGreaterThanOrEqual(6);
    const banned = /遊戲|數值|等級|系統|玩家|存檔|修為\s*[+＋]/;
    const lines: string[] = [
      ...retreat.brief,
      ...retreat.rare,
      ...retreat.stop.bottleneck,
      ...retreat.stop.lifespan,
      ...retreat.themes.flatMap((t) => [t.open, t.gag, ...t.exit]),
      ...Object.values(retreat.feel).flatMap((f) => [...f.calm, ...f.anxious, ...f.lonely]),
    ];
    for (const l of lines) {
      expect(l, l).not.toMatch(banned);
      expect(l, l).not.toMatch(/[{}]/);
    }
  });

  it("每個片段都是一句話，拼起來才不會超過三句", () => {
    const parts: string[] = [
      ...retreat.stop.bottleneck,
      ...retreat.stop.lifespan,
      ...retreat.themes.flatMap((t) => [t.open, t.gag, ...t.exit]),
      ...Object.values(retreat.feel).flatMap((f) => [...f.calm, ...f.anxious, ...f.lonely]),
    ];
    for (const p of parts) expect((p.match(/[。！？]/g) ?? []).length, p).toBe(1);
  });

  it("每個意象至少有一句吐槽，且收尾與開頭沒有相同的句子", () => {
    for (const t of retreat.themes) {
      expect(t.gag.length).toBeGreaterThan(0);
      expect(new Set([...t.exit, t.gag, t.open]).size).toBe(t.exit.length + 2);
    }
  });
});

describe("閉關見聞：記錄序號與存檔", () => {
  const away = (s: ReturnType<typeof living>) => applyOffline(s, 100 * gameData.config.msPerMonth, gameData).state;

  it("離線閉關記下世界種子，序號依日誌裡最大的接下去", () => {
    const first = away(living(3));
    const e1 = first.log[first.log.length - 1];
    expect(e1).toMatchObject({ kind: "retreat", retreatNo: 0, retreatSeed: first.worldSeed });
    const second = away(first);
    expect(second.log[second.log.length - 1].retreatNo).toBe(1);
  });

  it("存檔往返保留序號；v26 的舊檔沒有這兩個欄位也能載入", () => {
    const s = away(living(3));
    expect(deserialize(serialize(s))).toEqual(s);
    const old = JSON.parse(serialize(s));
    old.version = 26;
    for (const e of old.log) {
      delete e.retreatNo;
      delete e.retreatSeed;
    }
    const m = deserialize(JSON.stringify(old));
    expect(m.version).toBeGreaterThanOrEqual(27);
    expect(m.log[m.log.length - 1].retreatNo).toBeUndefined();
  });

  it("臨終句的 ifFlag 與 ifRealmMax 寫錯會指出哪個欄位", () => {
    const bad = (v: object) => () =>
      validateGameData({ ...gameData, text: { ...gameData.text, review: { ...gameData.text.review, lifespan: [...gameData.text.review.lifespan, { text: "x", ...v }] } } });
    expect(bad({ ifFlag: "no_such_flag" })).toThrow("no_such_flag");
    expect(bad({ ifRealmMax: "no_such_realm" })).toThrow("no_such_realm");
  });
});
