import { describe, expect, it } from "vitest";
import { canBuyItem, canUseItem, setSchedule } from "../src/core/actions";
import { cancelBrew, canStartBrew, hasMaterials, recipeOf, recipeRate, startBrew } from "../src/core/alchemy";
import { autoTribulation, currentFailLoss, reliefItem, attemptBreakthrough as attemptRaw } from "../src/core/breakthrough";
import { stageNeed } from "../src/core/formulas";
import { nextRandom } from "../src/core/rng";
import { deserialize, serialize } from "../src/core/save";
import type { GameState } from "../src/core/state";
import { tick } from "../src/core/tick";
import { itemPrice } from "../src/core/worldeffects";
import { gameData as data } from "../src/data/load";
import { validateGameData, validateItems, validateRecipes, validateSchedules } from "../src/data/validate";
import { formatLogEntry } from "../src/ui/format";
import { living, seedWhere } from "./helpers";

const lianqi = (patch = {}) => living(1, { realmId: "lianqi", stage: 2, ...patch });
const juqi = recipeOf("juqi_dan", data)!;

describe("煉丹資料", () => {
  it("三個起步丹方：材料都是材料物品，產出不是材料", () => {
    expect(data.recipes.recipes.map((r) => r.id)).toEqual(["juqi_dan", "huxin_dan", "bilei_fu"]);
    for (const r of data.recipes.recipes) {
      for (const id of Object.keys(r.inputs)) expect(data.items.find((i) => i.id === id)!.effect.kind).toBe("material");
      expect(data.items.find((i) => i.id === r.output)!.effect.kind).not.toBe("material");
    }
  });
  it("格式錯誤指出是哪個欄位", () => {
    const bad = JSON.parse(JSON.stringify(data.recipes));
    bad.rules.maxRate = 2;
    expect(() => validateRecipes(bad)).toThrow("maxRate");
    const noInputs = JSON.parse(JSON.stringify(data.recipes));
    noInputs.recipes[0].inputs = {};
    expect(() => validateRecipes(noInputs)).toThrow("inputs");
  });
  it("跨檔案：材料不是材料、產出是材料、掉落不是材料、缺煉丹安排，都報錯", () => {
    const withRecipes = (mut: (d: typeof data) => void) => {
      const d = JSON.parse(JSON.stringify(data));
      mut(d);
      return () => validateGameData(d);
    };
    expect(withRecipes((d) => (d.recipes.recipes[0].inputs = { juqi_dan: 1 }))).toThrow("不是材料");
    expect(withRecipes((d) => (d.recipes.recipes[0].output = "ling_cao"))).toThrow("是材料");
    expect(withRecipes((d) => (d.schedules[1].drops = [{ itemId: "juqi_dan", chance: 0.1 }]))).toThrow("drops");
    expect(withRecipes((d) => (d.schedules = d.schedules.filter((s: { id: string }) => s.id !== "alchemy")))).toThrow("alchemy");
  });
  it("材料價格必須為 0，其餘物品必須是正數；護心丹減免上限 0.3", () => {
    const items = JSON.parse(JSON.stringify(data.items));
    items.find((i: { id: string }) => i.id === "ling_cao").price = 5;
    expect(() => validateItems(items)).toThrow("price");
    const relief = JSON.parse(JSON.stringify(data.items));
    relief.find((i: { id: string }) => i.id === "huxin_dan").effect.value = 0.9;
    expect(() => validateItems(relief)).toThrow("value");
    const sched = JSON.parse(JSON.stringify(data.schedules));
    sched[2].drops = [{ itemId: "ling_cao", chance: 2 }];
    expect(() => validateSchedules(sched)).toThrow("drops");
  });
  it("煉丹日誌文字帶出丹藥名", () => {
    const line = formatLogEntry({ month: 600, kind: "alchemyDone", realmId: "lianqi", stage: 1, itemId: "juqi_dan" }, data);
    expect(line).toContain("聚氣丹");
  });
});

describe("材料掉落", () => {
  it("採藥掉靈草，機率約等於資料；不消耗存檔的亂數、不寫日誌", () => {
    let got = 0;
    const N = 3000;
    for (let seed = 1; seed <= N; seed++) {
      const s = lianqi({ schedule: "herb", rngSeed: seed });
      const t = tick(s, 1);
      expect(t.rngSeed).toBe(s.rngSeed);
      expect(t.log).toEqual(s.log);
      got += t.items.ling_cao ?? 0;
    }
    const expected = data.schedules.find((x) => x.id === "herb")!.drops![0].chance;
    expect(got / N).toBeGreaterThan(expected - 0.03);
    expect(got / N).toBeLessThan(expected + 0.03);
  });
  it("同樣的狀態掉落結果相同（可重現）", () => {
    const s = lianqi({ schedule: "herb", rngSeed: 4242, ageMonths: 400 });
    expect(tick(s, 60).items).toEqual(tick(s, 60).items);
  });
  it("閉關不掉材料", () => {
    for (let seed = 1; seed <= 200; seed++) expect(tick(lianqi({ rngSeed: seed }), 1).items.ling_cao).toBeUndefined();
  });
  it("材料不能買、不能服用、價格為 0", () => {
    const s = lianqi({ spiritStones: 999, items: { ling_cao: 3 } });
    expect(canBuyItem(s, "ling_cao", data)).toBe(false);
    expect(canUseItem(s, "ling_cao", data)).toBe(false);
    expect(itemPrice(s, "ling_cao", data)).toBe(0);
    expect(canBuyItem(s, "huxin_dan", data)).toBe(true);
  });
});

describe("閉關煉丹", () => {
  const stocked = (patch = {}) => lianqi({ items: { ling_cao: 4 }, ...patch });

  it("成功率：基礎加悟性，不超過上限", () => {
    const s = stocked({ attributes: { bone: 5, insight: 6, fortune: 5, mind: 5 } });
    expect(recipeRate(s, juqi, data)).toBeCloseTo(juqi.baseRate + 0.06);
    const sage = stocked({ attributes: { bone: 5, insight: 99, fortune: 5, mind: 5 } });
    expect(recipeRate(sage, juqi, data)).toBe(data.recipes.rules.maxRate);
  });
  it("開爐需要材料與境界；已有一爐時不能再開；材料下個月才投入", () => {
    expect(canStartBrew(lianqi(), "juqi_dan", data)).toBe(false);
    expect(canStartBrew(living(1, { realmId: "mortal", items: { ling_cao: 4 } }), "juqi_dan", data)).toBe(false);
    const s = startBrew(stocked(), "juqi_dan", data);
    expect(s.schedule).toBe("alchemy");
    expect(s.alchemy).toEqual({ recipeId: "juqi_dan", progress: 0, paid: false });
    expect(s.items.ling_cao).toBe(4);
    expect(canStartBrew(s, "juqi_dan", data)).toBe(false);
    expect(startBrew(s, "huxin_dan", data)).toBe(s);
    // 避雷符要築基才能煉
    expect(canStartBrew({ ...lianqi({ items: { fu_zhi: 2, ling_sha: 1 } }) }, "bilei_fu", data)).toBe(false);
    expect(canStartBrew(living(1, { realmId: "zhuji", items: { fu_zhi: 2, ling_sha: 1 } }), "bilei_fu", data)).toBe(true);
  });
  it("煉一爐：第一個月投入材料，滿月數後成丹或退回一半材料", () => {
    let done = 0;
    let lost = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const begun = startBrew(stocked({ rngSeed: seed }), "juqi_dan", data);
      const m1 = tick(begun, 1);
      expect(m1.items.ling_cao).toBe(0);
      expect(m1.alchemy).toEqual({ recipeId: "juqi_dan", progress: 1, paid: true });
      const m2 = tick(m1, 1);
      expect(m2.alchemy).toEqual({ recipeId: "juqi_dan", progress: 0, paid: false });
      const win = nextRandom(m1.rngSeed)[0] < recipeRate(begun, juqi, data);
      if (win) {
        done++;
        expect(m2.items.juqi_dan).toBe(1);
        expect(m2.items.ling_cao).toBe(0);
        expect(m2.log[m2.log.length - 1].kind).toBe("alchemyDone");
      } else {
        lost++;
        expect(m2.items.juqi_dan ?? 0).toBe(0);
        expect(m2.items.ling_cao).toBe(2);
        expect(m2.log[m2.log.length - 1].kind).toBe("alchemyFail");
      }
    }
    expect(done).toBeGreaterThan(200);
    expect(lost).toBeGreaterThan(30);
  });
  it("煉丹時修為照煉丹安排累積（×0.3）", () => {
    const begun = startBrew(stocked(), "juqi_dan", data);
    const gain = tick(begun, 1).cultivation - begun.cultivation;
    const retreat = tick(setSchedule(stocked({ schedule: "retreat" }), "retreat", data), 1).cultivation - begun.cultivation;
    expect(gain).toBeCloseTo(retreat * 0.3);
  });
  it("可以中斷與恢復：換安排時爐子保留，換回來就接著煉", () => {
    const m1 = tick(startBrew(stocked({ rngSeed: 7 }), "juqi_dan", data), 1);
    const away = setSchedule(m1, "retreat", data);
    expect(away.alchemy).toEqual({ recipeId: "juqi_dan", progress: 1, paid: true });
    const idle = tick(away, 5);
    expect(idle.alchemy).toEqual(away.alchemy);
    const back = setSchedule(idle, "alchemy", data);
    expect(back.schedule).toBe("alchemy");
    expect(tick(back, 1).alchemy).toEqual({ recipeId: "juqi_dan", progress: 0, paid: false });
  });
  it("沒有開爐時不能切到煉丹", () => {
    expect(setSchedule(stocked(), "alchemy", data).schedule).toBe("retreat");
  });
  it("材料不夠下一爐：自動收爐、回到預設安排、寫日誌，可重新開爐", () => {
    let s = tick(startBrew(stocked({ rngSeed: 9 }), "juqi_dan", data), 2);
    expect(s.schedule).toBe("alchemy");
    s = tick(s, 1);
    if (hasMaterials(s, juqi)) throw new Error("測試前提：這一爐的材料已用盡或退不回 4 份");
    expect(s.schedule).toBe("retreat");
    expect(s.alchemy).toBeNull();
    expect(s.log[s.log.length - 1].kind).toBe("alchemyStop");
    const refilled = { ...s, items: { ...s.items, ling_cao: 4 } };
    expect(canStartBrew(refilled, "juqi_dan", data)).toBe(true);
  });
  it("還有材料時連續開下一爐", () => {
    const s = tick(startBrew(stocked({ items: { ling_cao: 8 }, rngSeed: 3 }), "juqi_dan", data), 3);
    expect(s.schedule).toBe("alchemy");
    expect(s.alchemy).toMatchObject({ paid: true, progress: 1 });
    expect(s.items.ling_cao ?? 0).toBeLessThanOrEqual(2 + 2);
  });
  it("熄爐：已投入的材料全數退回", () => {
    const m1 = tick(startBrew(stocked(), "juqi_dan", data), 1);
    const off = cancelBrew(m1, data);
    expect(off.items.ling_cao).toBe(4);
    expect(off.alchemy).toBeNull();
    expect(off.schedule).toBe("retreat");
    // 還沒投入時熄爐不多退
    const fresh = cancelBrew(startBrew(stocked(), "juqi_dan", data), data);
    expect(fresh.items.ling_cao).toBe(4);
  });
  it("存檔往返保留煉丹進度；v17 遷移補上 null；壞資料指出欄位", () => {
    const m1 = tick(startBrew(stocked(), "juqi_dan", data), 1);
    expect(deserialize(serialize(m1)).alchemy).toEqual(m1.alchemy);
    const old = JSON.parse(serialize(stocked()));
    old.version = 17;
    delete old.alchemy;
    expect(deserialize(JSON.stringify(old)).alchemy).toBeNull();
    const bad = JSON.parse(serialize(m1));
    bad.alchemy.recipeId = "nope";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("alchemy.recipeId");
    const far = JSON.parse(serialize(m1));
    far.alchemy.progress = 9;
    expect(() => deserialize(JSON.stringify(far))).toThrow("alchemy.progress");
    const unpaid = JSON.parse(serialize(m1));
    unpaid.alchemy.paid = false;
    expect(() => deserialize(JSON.stringify(unpaid))).toThrow("alchemy.progress");
  });
});

describe("護心丹", () => {
  const zhuji = data.realms.find((r) => r.id === "zhuji")!;
  const cap = (patch = {}) =>
    living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 6 }, ...patch });

  it("帶著護心丹時失敗損失少一成；沒有時不變", () => {
    const plain = cap();
    const armed = cap({ items: { huxin_dan: 2 } });
    expect(reliefItem(plain, data)).toBeNull();
    expect(reliefItem(armed, data)).toEqual({ id: "huxin_dan", value: 0.1 });
    expect(currentFailLoss(armed, data)).toBeCloseTo(Math.max(0, currentFailLoss(plain, data) - 0.1));
  });
  it("突破失敗時自動用掉一顆；成功不消耗", () => {
    const failSeed = seedWhere((v) => v > 0.97);
    const winSeed = seedWhere((v) => v < 0.02);
    const lost = attemptAuto(cap({ items: { huxin_dan: 2 }, rngSeed: failSeed }));
    expect(lost.items.huxin_dan).toBe(1);
    expect(lost.realmId).toBe("zhuji");
    const won = attemptAuto(cap({ items: { huxin_dan: 2 }, rngSeed: winSeed }));
    expect(won.items.huxin_dan).toBe(2);
  });
  it("損失確實比沒帶時少", () => {
    const failSeed = seedWhere((v) => v > 0.97);
    const a = attemptAuto(cap({ rngSeed: failSeed }));
    const b = attemptAuto(cap({ items: { huxin_dan: 1 }, rngSeed: failSeed }));
    expect(b.cultivation).toBeGreaterThan(a.cultivation);
  });
  it("護心丹不能直接服用", () => {
    expect(canUseItem(cap({ items: { huxin_dan: 1 } }), "huxin_dan", data)).toBe(false);
  });
});

/** 嘗試突破並把天劫每一道硬抗到結束 */
const attemptAuto = (s: GameState): GameState => autoTribulation(attemptRaw(s, false), data);
