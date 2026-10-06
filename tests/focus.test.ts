import { describe, expect, it } from "vitest";
import { attemptBreakthrough as attemptRaw, faceWave, waveChance } from "../src/core/breakthrough";
import { canFocus, focus, focusCharges, focusGain } from "../src/core/focus";
import { applyOffline } from "../src/core/offline";
import { stageNeed } from "../src/core/formulas";
import { deserialize, serialize } from "../src/core/save";
import { scheduleOf } from "../src/core/progress";
import { monthlyGain, tick } from "../src/core/tick";
import { gameData as data } from "../src/data/load";
import { validateConfig, validateTribulation } from "../src/data/validate";
import { living } from "./helpers";

const lianqi = (patch = {}) => living(1, { realmId: "lianqi", stage: 2, ageMonths: 200, ...patch });

describe("運功（點擊加速）", () => {
  it("額外得到當月修為的一小部分（每次積蓄）", () => {
    const s = lianqi({ focusStored: 1, focusMonth: 200 });
    const gain = monthlyGain(s, scheduleOf(s, data), data) * data.config.focusBonus * data.config.focusCooldown;
    expect(focusGain(s, data)).toBeCloseTo(gain);
    const t = focus(s, data);
    expect(t.cultivation - s.cultivation).toBeCloseTo(gain);
    expect(t.focusStored).toBe(0);
  });
  it("每滿冷卻存一次，玩家一次用掉全部，沒有存量時不能運功", () => {
    const cd = data.config.focusCooldown;
    const s = lianqi({ focusMonth: 200 });
    expect(canFocus(s, data)).toBe(false);
    expect(focus(s, data)).toBe(s);
    expect(canFocus(tick(s, cd - 1, data), data)).toBe(false);
    const three = tick(s, cd * 3, data);
    expect(focusCharges(three, data)).toBe(3);
    const one = lianqi({ focusStored: 1, focusMonth: 200 });
    expect(focusGain(three, data) / focusGain(one, data)).toBeGreaterThan(2.9);
    expect(focusCharges(focus(three, data), data)).toBe(0);
  });
  it("存量有上限，多出來的時間浪費", () => {
    const cd = data.config.focusCooldown;
    const cap = data.config.focusMaxCharges;
    const t = tick(lianqi({ focusMonth: 200, eventThreshold: 1e9 }), cd * (cap + 5), data);
    expect(focusCharges(t, data)).toBe(cap);
  });
  it("離線閉關也會積蓄", () => {
    const cap = data.config.focusMaxCharges;
    const { state } = applyOffline(lianqi({ focusMonth: 200 }), 60_000, data);
    expect(state.focusStored).toBeGreaterThan(0);
    expect(state.focusStored).toBeLessThanOrEqual(cap);
  });
  it("連點的總加成不超過資料設定的比例", () => {
    let plain = lianqi({ eventThreshold: 1e9, focusMonth: 200 });
    let clicked = plain;
    for (let i = 0; i < 48; i++) {
      plain = tick(plain, 1, data);
      clicked = focus(tick(clicked, 1, data), data);
    }
    const p = plain.stage * 1000 + plain.cultivation - (lianqi().stage * 1000 + lianqi().cultivation);
    const c = clicked.stage * 1000 + clicked.cultivation - (lianqi().stage * 1000 + lianqi().cultivation);
    expect(c / p).toBeLessThanOrEqual(1 + data.config.focusBonus + 0.02);
    expect(c).toBeGreaterThan(p);
  });
  it("攢著用的總加成也不超過資料設定的比例", () => {
    const base = lianqi({ eventThreshold: 1e9, focusMonth: 200 });
    const plain = tick(base, 48, data);
    const saved = focus(tick(base, 48, data), data);
    const gap = (x: typeof plain): number => x.stage * 1000 + x.cultivation - (base.stage * 1000 + base.cultivation);
    expect(gap(saved) / gap(plain)).toBeLessThanOrEqual(1 + data.config.focusBonus + 0.02);
    expect(gap(saved)).toBeGreaterThan(gap(plain));
  });
  it("卡在瓶頸、等待抉擇、天劫中、不在修行時不能運功", () => {
    const zhuji = data.realms.find((r) => r.id === "zhuji")!;
    const stuck = living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), ageMonths: 900 });
    expect(canFocus(stuck, data)).toBe(false);
    expect(canFocus(lianqi({ pendingEvent: "x" }), data)).toBe(false);
    expect(canFocus(lianqi({ phase: "dead" }), data)).toBe(false);
    expect(canFocus(attemptRaw(stuck, false, data), data)).toBe(false);
  });
  it("存檔往返保留；v20 遷移補 -1；壞資料指出欄位", () => {
    const s = lianqi({ focusStored: 4, focusMonth: 200 });
    expect(deserialize(serialize(s)).focusStored).toBe(4);
    const old = JSON.parse(serialize(lianqi()));
    old.version = 20;
    delete old.focusMonth;
    delete old.focusStored;
    expect(deserialize(JSON.stringify(old)).focusStored).toBe(1);
    const cooling = JSON.parse(serialize(lianqi({ focusMonth: 198 })));
    cooling.version = 24;
    delete cooling.focusStored;
    const m = deserialize(JSON.stringify(cooling));
    expect([m.focusMonth, m.focusStored]).toEqual([198, 0]);
    const badStored = JSON.parse(serialize(lianqi()));
    badStored.focusStored = -1;
    expect(() => deserialize(JSON.stringify(badStored))).toThrow("focusStored");
    const bad = JSON.parse(serialize(lianqi()));
    bad.focusMonth = "x";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("focusMonth");
  });
  it("格式錯誤指出欄位", () => {
    expect(() => validateConfig({ ...data.config, focusBonus: 2 })).toThrow("focusBonus");
    expect(() => validateConfig({ ...data.config, focusMaxCharges: 0 })).toThrow("focusMaxCharges");
    expect(() => validateTribulation({ ...data.tribulation, focusBonus: 0.5 })).toThrow("focusBonus");
  });
});

describe("天劫凝神", () => {
  const zhuji = data.realms.find((r) => r.id === "zhuji")!;
  const begun = () => attemptRaw(living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 6 } }), false, data);
  it("在光圈收攏時選擇，這一道的把握增加固定的量，三種選擇都適用；不凝神與舊結果相同", () => {
    const t = begun();
    for (const c of ["brace", "guard"] as const) {
      expect(waveChance(t, c, data, true) - waveChance(t, c, data, false)).toBeCloseTo(data.tribulation.focusBonus);
      expect(waveChance(t, c, data)).toBe(waveChance(t, c, data, false));
    }
  });
  it("凝神不會超過每道的上限", () => {
    const t = { ...begun(), tribulation: { ...begun().tribulation!, rate: 0.999999 } };
    expect(waveChance(t, "brace", data, true)).toBeLessThanOrEqual(Math.max(data.tribulation.maxChance, waveChance(t, "brace", data)));
  });
  it("凝神讓整體通過率提高；faceWave 的預設行為不變", () => {
    let plain = 0;
    let focused = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = attemptRaw(living(seed, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 6 } }), false, data);
      let a = s;
      let b = s;
      while (a.tribulation) a = faceWave(a, "brace", data);
      while (b.tribulation) b = faceWave(b, "brace", data, true);
      if (a.realmId === "jindan") plain++;
      if (b.realmId === "jindan") focused++;
    }
    expect(focused).toBeGreaterThan(plain);
  });
});
