import { describe, expect, it } from "vitest";
import {
  attemptBreakthrough as attemptRaw,
  autoTribulation,
  canBreakthrough,
  canChooseWave,
  currentFailLoss,
  faceWave,
  waveBaseChance,
  waveChance,
  wardItem,
} from "../../src/core/character/breakthrough";
import { canZuohua } from "../../src/core/actions";
import { stageNeed } from "../../src/core/formulas";
import { nextRandom } from "../../src/core/rng";
import { deserialize, serialize } from "../../src/core/save";
import { tick } from "../../src/core/tick";
import { gameData as data } from "../../src/data/load";
import { validateRealms, validateTribulation } from "../../src/data/validate";
import { formatLogEntry } from "../../src/ui/format";
import { emptyMeta } from "../../src/core/state";
import type { GameState } from "../../src/core/state";
import { living } from "../helpers";

const zhuji = data.realms.find((r) => r.id === "zhuji")!;
const atCap = (patch: Partial<GameState> = {}): GameState =>
  living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 6 }, ...patch });

describe("天劫資料", () => {
  it("築基、金丹、元嬰的突破有天劫（3、5、7 道），練氣沒有", () => {
    const waves = Object.fromEntries(data.realms.map((r) => [r.id, r.breakthroughRule?.tribulation?.waves]));
    expect(waves).toMatchObject({ lianqi: undefined, zhuji: 3, jindan: 5, yuanying: 7 });
  });
  it("避雷符是唯一的 tribulationWard 物品", () => {
    expect(wardItem(data)).toEqual({ id: "bilei_fu", bonus: 0.15 });
  });
  it("格式錯誤指出欄位", () => {
    const bad = JSON.parse(JSON.stringify(data.tribulation));
    bad.guard.max = 2;
    expect(() => validateTribulation(bad)).toThrow("guard");
    delete bad.images;
    expect(() => validateTribulation({ ...data.tribulation, images: [] })).toThrow("images");
  });
  it("天劫文字不洩漏來源", () => {
    const all = JSON.stringify(data.tribulation) + data.text.log.tribulationFail;
    for (const w of ["天光", "絕通", "太衡宗"]) expect(all.includes(w), w).toBe(false);
  });
  it("道數與跨檔案：引用不存在的欄位時報錯", () => {
    const realms = JSON.parse(JSON.stringify(data.realms));
    realms[2].breakthroughRule.tribulation = { waves: 1 };
    expect(() => validateRealms(realms)).toThrow("waves");
  });
});

describe("天劫過程", () => {
  it("開始：抽一次亂數、時間暫停、不能再突破或坐化", () => {
    const s = atCap({ rngSeed: 4321 });
    const t = attemptRaw(s, false);
    expect(t.tribulation).toMatchObject({ waves: 3, wave: 0, threshold: 1 });
    expect(t.tribulation!.roll).toBe(nextRandom(4321)[0]);
    expect(t.rngSeed).toBe(nextRandom(4321)[1]);
    expect(canBreakthrough(t)).toBe(false);
    expect(canZuohua(t)).toBe(false);
    expect(tick(t, 12)).toBe(t);
  });
  it("不做準備時各道連乘等於整體成功率，結果與一鍵突破逐一相同", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = atCap({ rngSeed: seed });
      const begun = attemptRaw(s, false);
      const base = waveBaseChance(begun);
      expect(base ** 3).toBeCloseTo(begun.tribulation!.rate);
      const done = autoTribulation(begun);
      const wins = nextRandom(seed)[0] < begun.tribulation!.rate;
      expect(done.realmId === "jindan", `seed ${seed}`).toBe(wins);
      expect(done.tribulation).toBeNull();
      expect(done.phase === "dead").toBe(false);
    }
  });
  it("自動抉擇開啟時直接硬抗到結束", () => {
    const s = atCap({ autoChoice: true, rngSeed: 77 });
    expect(attemptRaw(s, false).tribulation).toBeNull();
  });
  it("三種選擇的成功率：硬抗＝基礎；護體加心性（有上限）；符籙加 15%，沒有符時不能選", () => {
    const begun = attemptRaw(atCap({ rngSeed: 9 }), false);
    const base = waveBaseChance(begun);
    expect(waveChance(begun, "brace", data)).toBeCloseTo(base);
    expect(waveChance(begun, "guard", data)).toBeCloseTo(base + 0.06);
    const highMind = { ...begun, attributes: { ...begun.attributes, mind: 50 } };
    expect(waveChance(highMind, "guard", data)).toBeCloseTo(base + data.tribulation.guard.max);
    expect(canChooseWave(begun, "ward", data)).toBe(false);
    const stocked = { ...begun, items: { bilei_fu: 2 } };
    expect(canChooseWave(stocked, "ward", data)).toBe(true);
    expect(waveChance(stocked, "ward", data)).toBeCloseTo(Math.min(data.tribulation.maxChance, base + 0.15));
    const sure = { ...begun, tribulation: { ...begun.tribulation!, rate: 0.999999 } };
    // 基礎已高過上限時，準備不會讓它變低
    expect(waveChance({ ...sure, items: { bilei_fu: 1 } }, "ward", data)).toBeGreaterThanOrEqual(waveBaseChance(sure));
  });
  it("符籙：用掉一張，無論成敗", () => {
    const begun = { ...attemptRaw(atCap({ rngSeed: 5 }), false), items: { bilei_fu: 2 } };
    const after = faceWave(begun, "ward", data);
    expect(after.items.bilei_fu).toBe(1);
  });
  it("用心準備（護體加符籙）的整體成功率明顯高於硬抗，但不超過 95%", () => {
    let brace = 0;
    let prepared = 0;
    const N = 800;
    for (let seed = 1; seed <= N; seed++) {
      const s = atCap({ rngSeed: seed, items: { bilei_fu: 3 } });
      if (autoTribulation(attemptRaw(s, false)).realmId === "jindan") brace++;
      let t = attemptRaw(s, false);
      while (t.tribulation !== null) t = faceWave(t, canChooseWave(t, "ward", data) ? "ward" : "guard", data);
      if (t.realmId === "jindan") prepared++;
    }
    expect(prepared / brace).toBeGreaterThan(1.3);
    expect(prepared / N).toBeLessThan(0.95);
  });
  it("失敗：不致死，修為照一般損失；護體的那一道失敗額外損失；記下止步的道數", () => {
    let sample: GameState | null = null;
    for (let seed = 1; seed < 500 && !sample; seed++) {
      const begun = attemptRaw(atCap({ rngSeed: seed }), false);
      if (begun.tribulation!.roll > 0.95) sample = begun;
    }
    const begun = sample!;
    const plain = faceWave(begun, "brace", data);
    expect(plain.phase).toBe("living");
    expect(plain.tribulation).toBeNull();
    expect(plain.realmId).toBe("zhuji");
    expect(plain.cultivation).toBeCloseTo(begun.cultivation * (1 - currentFailLoss(begun)));
    expect(plain.log[plain.log.length - 1]).toMatchObject({ kind: "breakthroughFail", wave: 1 });
    const guarded = faceWave(begun, "guard", data);
    expect(guarded.cultivation).toBeCloseTo(begun.cultivation * (1 - currentFailLoss(begun) - data.tribulation.guard.extraLoss));
    expect(canBreakthrough({ ...plain, cultivation: stageNeed(zhuji, 2) })).toBe(true);
  });
  it("失敗日誌帶出第幾道與該道的意象文字", () => {
    const line = formatLogEntry({ month: 600, kind: "breakthroughFail", realmId: "zhuji", stage: 2, wave: 2 }, data);
    expect(line).toContain("第2道");
    expect(line).toContain(data.tribulation.images[1].fail);
  });
  it("存檔往返保留進行中的天劫；v16 遷移補上 null；壞資料指出欄位", () => {
    const begun = attemptRaw(atCap({ rngSeed: 11 }), false);
    const back = deserialize(serialize(begun));
    expect(back.tribulation).toEqual(begun.tribulation);
    const old = JSON.parse(serialize(atCap()));
    old.version = 16;
    delete old.tribulation;
    expect(deserialize(JSON.stringify(old)).tribulation).toBeNull();
    const bad = JSON.parse(serialize(begun));
    bad.tribulation.wave = 9;
    expect(() => deserialize(JSON.stringify(bad))).toThrow("tribulation.wave");
    const wrong = JSON.parse(serialize(begun));
    wrong.tribulation.waves = 4;
    expect(() => deserialize(JSON.stringify(wrong))).toThrow("tribulation.waves");
  });
  it("元嬰、化神的天劫道數更多", () => {
    const yuanying = data.realms.find((r) => r.id === "yuanying")!;
    const s = living(2, {
      realmId: "yuanying",
      stage: 2,
      cultivation: stageNeed(yuanying, 2),
      flags: ["yuanying"],
      attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 },
      meta: { ...emptyMeta(), yuanying: { orphan: 1 }, talents: { ningshen: 6 } },
    });
    expect(attemptRaw(s, false).tribulation?.waves).toBe(7);
  });
});
