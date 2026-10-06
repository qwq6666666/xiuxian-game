import { describe, expect, it } from "vitest";
import { currentFailLoss, canChooseWave, waveChance, attemptBreakthrough as attemptRaw } from "../src/core/breakthrough";
import { advanceEvents } from "../src/core/events";
import { monthlyGain } from "../src/core/tick";
import { scheduleOf } from "../src/core/progress";
import { createInitialState, newLife, startLife } from "../src/core/life";
import { methodEffect, methodUnlocked, setMethod } from "../src/core/method";
import { deserialize, serialize } from "../src/core/save";
import { stageNeed } from "../src/core/formulas";
import { gameData as data } from "../src/data/load";
import { validateMethods } from "../src/data/validate";
import { effectSummary, methodRows } from "../src/ui/methodinfo";
import { living } from "./helpers";
import type { GameState } from "../src/core/state";

const withFragments = (s: GameState, n: number): GameState => ({
  ...s,
  meta: { ...s.meta, fragments: data.fragments.items.slice(0, n).map((f) => f.id) },
});
const rolling = (n = 0): GameState => withFragments(createInitialState(5), n);

describe("心法資料", () => {
  it("四個心法，第一個是無相訣（無效果、不需解鎖）", () => {
    expect(data.methods.map((m) => m.id)).toEqual(["wuxiang", "wenjin", "jixing", "youchen"]);
    expect(data.methods[0].effects).toEqual({});
    expect(data.methods.map((m) => m.unlock.fragments)).toEqual([0, 4, 8, 12]);
  });
  it("格式錯誤指出欄位", () => {
    const bad = JSON.parse(JSON.stringify(data.methods));
    bad[1].effects.cultivation = 5;
    expect(() => validateMethods(bad)).toThrow("cultivation");
    const unknown = JSON.parse(JSON.stringify(data.methods));
    unknown[1].effects.magic = 1;
    expect(() => validateMethods(unknown)).toThrow("magic");
    const first = JSON.parse(JSON.stringify(data.methods));
    first[0].effects = { cultivation: 0.1 };
    expect(() => validateMethods(first)).toThrow("第一個心法");
  });
  it("文字不洩漏來源", () => {
    const all = JSON.stringify(data.methods);
    for (const w of ["天光", "絕通", "太衡宗"]) expect(all.includes(w)).toBe(false);
  });
});

describe("選心法", () => {
  it("預設無相訣；只能在擲骰階段、殘卷夠了才能換", () => {
    expect(rolling().methodId).toBe("wuxiang");
    expect(setMethod(rolling(3), "wenjin", data).methodId).toBe("wuxiang");
    expect(setMethod(rolling(4), "wenjin", data).methodId).toBe("wenjin");
    expect(setMethod(rolling(14), "youchen", data).methodId).toBe("youchen");
    expect(setMethod(rolling(14), "nope", data).methodId).toBe("wuxiang");
    const going = startLife(setMethod(rolling(14), "jixing", data), data);
    expect(setMethod(going, "wenjin", data)).toBe(going);
  });
  it("轉世時沿用上一世的選擇", () => {
    const dead = { ...startLife(setMethod(rolling(14), "jixing", data), data), phase: "dead" as const };
    expect(newLife(dead, data).methodId).toBe("jixing");
  });
  it("介面列表：未解鎖有條件說明，已選有標記", () => {
    const rows = methodRows(setMethod(rolling(5), "wenjin", data), data);
    expect(rows.map((r) => r.unlocked)).toEqual([true, true, false, false]);
    expect(rows[1].selected).toBe(true);
    expect(rows[2].lockText).toContain("8 份");
    expect(rows[0].effectText).toBe("無加成也無代價");
    expect(effectSummary({ cultivation: 0.06, eventRate: -0.15 })).toBe("修煉速度 +6%・事件頻率 −15%");
    expect(methodUnlocked(rolling(8), data.methods[2])).toBe(true);
  });
  it("存檔往返；v18 遷移補上無相訣；壞資料指出欄位", () => {
    const s = living(1, { methodId: "jixing" });
    expect(deserialize(serialize(s)).methodId).toBe("jixing");
    const old = JSON.parse(serialize(s));
    old.version = 18;
    delete old.methodId;
    expect(deserialize(JSON.stringify(old)).methodId).toBe("wuxiang");
    const bad = JSON.parse(serialize(s));
    bad.methodId = "nope";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("methodId");
  });
});

describe("心法效果", () => {
  const sched = (s: GameState) => scheduleOf(s, data);
  it("修煉速度：疾行 +6%、穩進 −4%，無相不變", () => {
    const base = monthlyGain(living(1), sched(living(1)), data);
    expect(monthlyGain(living(1, { methodId: "jixing" }), sched(living(1)), data)).toBeCloseTo(base * 1.06);
    expect(monthlyGain(living(1, { methodId: "wenjin" }), sched(living(1)), data)).toBeCloseTo(base * 0.96);
    expect(methodEffect(living(1), "cultivation", data)).toBe(0);
  });
  it("事件頻率：疾行 −15%、遊塵 +20%", () => {
    const clockAfter = (id: string) => advanceEvents(living(1, { methodId: id, eventThreshold: 1e9 }), 1, data).eventClock;
    const base = clockAfter("wuxiang");
    expect(clockAfter("jixing")).toBeCloseTo(base * 0.85);
    expect(clockAfter("youchen")).toBeCloseTo(base * 1.2);
  });
  const zhuji = data.realms.find((r) => r.id === "zhuji")!;
  const cap = (id: string) =>
    living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 2 }, methodId: id });
  it("突破失敗損失：穩進少 6 個百分點", () => {
    expect(currentFailLoss(cap("wenjin"), data)).toBeCloseTo(currentFailLoss(cap("wuxiang"), data) - 0.06);
  });
  it("天劫護體：穩進多 3%", () => {
    const begun = (id: string) => attemptRaw(cap(id), false, data);
    const a = begun("wuxiang");
    const b = begun("wenjin");
    expect(canChooseWave(b, "guard", data)).toBe(true);
    expect(waveChance(b, "guard", data) - waveChance(a, "guard", data)).toBeCloseTo(0.03);
    expect(waveChance(b, "brace", data)).toBeCloseTo(waveChance(a, "brace", data));
  });
});
