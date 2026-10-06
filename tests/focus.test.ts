import { describe, expect, it } from "vitest";
import { attemptBreakthrough as attemptRaw, faceWave, waveChance } from "../src/core/breakthrough";
import { canFocus, focus, focusGain } from "../src/core/focus";
import { stageNeed } from "../src/core/formulas";
import { deserialize, serialize } from "../src/core/save";
import { scheduleOf } from "../src/core/progress";
import { monthlyGain, tick } from "../src/core/tick";
import { gameData as data } from "../src/data/load";
import { validateConfig, validateTribulation } from "../src/data/validate";
import { living } from "./helpers";

const lianqi = (patch = {}) => living(1, { realmId: "lianqi", stage: 2, ageMonths: 200, ...patch });

describe("運功（點擊加速）", () => {
  it("額外得到當月修為的一小部分", () => {
    const s = lianqi();
    const gain = monthlyGain(s, scheduleOf(s, data), data) * data.config.focusBonus * data.config.focusCooldown;
    expect(focusGain(s, data)).toBeCloseTo(gain);
    const t = focus(s, data);
    expect(t.cultivation - s.cultivation).toBeCloseTo(gain);
    expect(t.focusMonth).toBe(200);
  });
  it("有冷卻：冷卻內不能再運功，過了就可以", () => {
    const once = focus(lianqi(), data);
    const cd = data.config.focusCooldown;
    expect(canFocus(once, data)).toBe(false);
    expect(focus(once, data)).toBe(once);
    expect(canFocus(tick(once, cd - 1, data), data)).toBe(false);
    expect(canFocus(tick(once, cd, data), data)).toBe(true);
  });
  it("連點的總加成不超過資料設定的比例", () => {
    let plain = lianqi({ eventThreshold: 1e9 });
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
  it("卡在瓶頸、等待抉擇、天劫中、不在修行時不能運功", () => {
    const zhuji = data.realms.find((r) => r.id === "zhuji")!;
    const stuck = living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), ageMonths: 900 });
    expect(canFocus(stuck, data)).toBe(false);
    expect(canFocus(lianqi({ pendingEvent: "x" }), data)).toBe(false);
    expect(canFocus(lianqi({ phase: "dead" }), data)).toBe(false);
    expect(canFocus(attemptRaw(stuck, false, data), data)).toBe(false);
  });
  it("存檔往返保留；v20 遷移補 -1；壞資料指出欄位", () => {
    const s = focus(lianqi(), data);
    expect(deserialize(serialize(s)).focusMonth).toBe(200);
    const old = JSON.parse(serialize(lianqi()));
    old.version = 20;
    delete old.focusMonth;
    expect(deserialize(JSON.stringify(old)).focusMonth).toBe(-1);
    const bad = JSON.parse(serialize(lianqi()));
    bad.focusMonth = "x";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("focusMonth");
  });
  it("格式錯誤指出欄位", () => {
    expect(() => validateConfig({ ...data.config, focusBonus: 2 })).toThrow("focusBonus");
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
