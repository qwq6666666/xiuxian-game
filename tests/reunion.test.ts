import { describe, expect, it } from "vitest";
import { advanceEvents, eventAvailable } from "../src/core/events";
import { createInitialState, startLife } from "../src/core/life";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta } from "../src/core/state";
import { gameData as data } from "../src/data/load";
import { validateEvents, validateGameData } from "../src/data/validate";
import { acquaintanceRows, formatLogEntry } from "../src/ui/format";
import { living } from "./helpers";

const base = data.events.find((e) => e.type === "anecdote")!;
const reunion = (id: string, gapMin?: number, gapMax?: number) => ({ ...base, id: "reunion_test", conditions: { acquaintance: { id, gapMin, gapMax } } });
const lives = (n: number, met = {}) => living(1, { meta: { ...emptyMeta(), lives: n, met } });

describe("隔世重逢：事件條件 acquaintance", () => {
  it("沒遇過算相隔 0 世；遇過後依相隔世數分階段", () => {
    const first = reunion("gu_yuanzhou", 0, 0);
    const later = reunion("gu_yuanzhou", 1, 3);
    expect(eventAvailable(lives(0), first, data)).toBe(true);
    expect(eventAvailable(lives(0), later, data)).toBe(false);
    const met = { gu_yuanzhou: { firstLife: 0, lastLife: 0 } };
    expect(eventAvailable(lives(1, met), first, data)).toBe(false);
    expect(eventAvailable(lives(1, met), later, data)).toBe(true);
    expect(eventAvailable(lives(4, met), later, data)).toBe(false);
  });
  it("每位故人每世最多遇一次", () => {
    const ev = reunion("gu_yuanzhou", 0);
    const met = { gu_yuanzhou: { firstLife: 0, lastLife: 2 } };
    expect(eventAvailable(lives(2, met), ev, data)).toBe(false);
    expect(eventAvailable(lives(3, met), ev, data)).toBe(true);
  });
  it("抽到故人事件就記下初遇與這一世，之後的世數保留初遇", () => {
    const ev = { ...reunion("su_banxia", 0), weight: 1000, maxPerLife: 1, conditions: { acquaintance: { id: "su_banxia" } } };
    const only = { ...data, events: [ev] };
    const s0 = { ...lives(0), eventClock: 1e9, eventThreshold: 0 };
    const s1 = advanceEvents(s0, 100, only);
    expect(s1.meta.met.su_banxia).toEqual({ firstLife: 0, lastLife: 0 });
    const s2 = advanceEvents({ ...lives(3, s1.meta.met), eventClock: 1e9, eventThreshold: 0 }, 100, only);
    expect(s2.meta.met.su_banxia).toEqual({ firstLife: 0, lastLife: 3 });
  });
  it("格式與引用檢查指出欄位", () => {
    expect(() => validateEvents([{ ...base, conditions: { acquaintance: { id: "x", gapMin: 3, gapMax: 1 } } }])).toThrow("gapMin");
    expect(() => validateEvents([{ ...base, conditions: { acquaintance: { id: "x", extra: 1 } } }])).toThrow("extra");
    const bad = { ...data, events: [...data.events, { ...base, id: "bad_acq", conditions: { acquaintance: { id: "nobody" } } }] };
    expect(() => validateGameData(bad)).toThrow("conditions.acquaintance");
  });
});

describe("隔世重逢：存檔與內容", () => {
  it("存檔往返相同，舊版（v23）補上空紀錄，載入檢查故人 id", () => {
    const s = lives(2, { gu_yuanzhou: { firstLife: 0, lastLife: 1 } });
    expect(deserialize(serialize(s))).toEqual(s);
    const old = JSON.parse(serialize(living(2)));
    delete old.meta.met;
    old.version = 23;
    expect(deserialize(JSON.stringify(old)).meta.met).toEqual({});
    const bad = JSON.parse(serialize(living(2)));
    bad.meta.met = { nobody: { firstLife: 0, lastLife: 0 } };
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/meta\.met\.nobody/);
    bad.meta.met = { gu_yuanzhou: { firstLife: 3, lastLife: 1 } };
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/meta\.met\.gu_yuanzhou\.lastLife/);
  });
  it("每位故人四個階段都有事件（初遇、一至三世、四至八世、九世以上），每段不超過三句，無效果", () => {
    for (const a of data.acquaintances) {
      const evs = data.events.filter((e) => e.conditions.acquaintance?.id === a.id);
      expect(evs, a.id).toHaveLength(4);
      for (const gap of [0, 2, 6, 12]) {
        const hit = evs.filter((e) => (e.conditions.acquaintance!.gapMin ?? 0) <= gap && gap <= (e.conditions.acquaintance!.gapMax ?? Infinity));
        expect(hit, `${a.id} gap ${gap}`).toHaveLength(1);
      }
      for (const e of evs) {
        expect(e.type).toBe("anecdote");
        expect(e.effects).toBeUndefined();
        expect(e.text.split(/[。！？]/).filter(Boolean).length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("開場句依出身與靈根分流", () => {
  it("開場日誌帶出身與靈根；偶數世接出身句、奇數世接靈根句；舊日誌只有通用句", () => {
    const s = startLife({ ...createInitialState(1), originId: "orphan", spiritRootId: "tian" });
    const entry = s.log[0];
    expect(entry.originId).toBe("orphan");
    expect(entry.spiritRootId).toBe("tian");
    const text0 = formatLogEntry(entry, data);
    expect(data.text.era.origin.orphan.some((x) => text0.includes(x))).toBe(true);
    const text1 = formatLogEntry({ ...entry, eraIndex: 1 }, data);
    expect(data.text.era.root.tian.some((x) => text1.includes(x))).toBe(true);
    const { originId: _o, spiritRootId: _r, ...plain } = entry;
    const old = formatLogEntry(plain, data);
    expect(data.text.era.origin.orphan.some((x) => old.includes(x))).toBe(false);
  });
  it("每種出身與靈根都有開場句", () => {
    for (const o of data.origins) expect(data.text.era.origin[o.id]?.length).toBeGreaterThan(0);
    for (const r of data.spiritRoots) expect(data.text.era.root[r.id]?.length).toBeGreaterThan(0);
  });
});

describe("故人收藏摘要（介面用）", () => {
  it("沒遇過只留空位，遇過顯示初遇世數（從 1 起算）與相隔世數", () => {
    const none = acquaintanceRows(emptyMeta(), data);
    expect(none).toHaveLength(data.acquaintances.length);
    expect(none.every((r) => r.firstLife === null && r.gap === null)).toBe(true);
    const meta = { ...emptyMeta(), lives: 5, met: { gu_yuanzhou: { firstLife: 2, lastLife: 4 } } };
    const row = acquaintanceRows(meta, data).find((r) => r.id === "gu_yuanzhou")!;
    expect(row.firstLife).toBe(3);
    expect(row.gap).toBe(3);
  });
});
