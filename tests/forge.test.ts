import { describe, expect, it } from "vitest";
import { canStartBrew } from "../src/core/alchemy";
import { attemptBreakthrough as attemptRaw, currentFailLoss, waveChance } from "../src/core/breakthrough";
import { artifactBonus, artifactOf, artifactsToKeep, canEquip, canForge, equip, forge, unequip } from "../src/core/forge";
import { stageNeed } from "../src/core/formulas";
import { newLife, reroll } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import { deserialize, serialize } from "../src/core/save";
import { scheduleOf } from "../src/core/progress";
import { monthlyGain } from "../src/core/tick";
import { canBuyItem, canUseItem } from "../src/core/actions";
import { gameData as data } from "../src/data/load";
import { validateItems, validateRecipes } from "../src/data/validate";
import { formatLogEntry } from "../src/ui/format";
import { bonusText, alchemyPanel } from "../src/ui/alchemyinfo";
import { living, seedWhere } from "./helpers";
import type { GameState } from "../src/core/state";

const lianqi = (patch: Partial<GameState> = {}): GameState => living(1, { realmId: "lianqi", stage: 2, ...patch });
const stocked = (patch: Partial<GameState> = {}): GameState => lianqi({ spiritStones: 1000, items: { ling_sha: 20, fu_zhi: 10 }, ...patch });
const withTalent = (s: GameState, level: number): GameState => ({ ...s, meta: { ...s.meta, talents: { ...s.meta.talents, benming: level } } });

describe("法寶資料", () => {
  it("六件法寶：法器三階加修煉速度，護身三階減失敗損失；價格 0、不能買、不能服用", () => {
    const all = data.items.filter((i) => i.effect.kind === "artifact");
    expect(all.map((i) => i.id)).toEqual(["juling_pan", "ningqi_zhu", "yangyuan_ding", "huxin_jing", "zhenhun_pei", "shouyi_huan"]);
    for (const a of all) {
      expect(a.price).toBe(0);
      expect(canBuyItem(lianqi({ spiritStones: 9999 }), a.id, data)).toBe(false);
      expect(canUseItem(lianqi({ items: { [a.id]: 1 } }), a.id, data)).toBe(false);
    }
  });
  it("煉器配方都產出法寶；煉丹配方不產出法寶；開爐煉丹不接受煉器配方", () => {
    for (const r of data.recipes.recipes) expect(r.kind === "forge").toBe(data.items.find((i) => i.id === r.output)!.effect.kind === "artifact");
    expect(canStartBrew(stocked(), "forge_juling_pan", data)).toBe(false);
  });
  it("格式錯誤指出欄位", () => {
    const items = JSON.parse(JSON.stringify(data.items));
    items.find((i: { id: string }) => i.id === "juling_pan").effect.slot = "boots";
    expect(() => validateItems(items)).toThrow("slot");
    const big = JSON.parse(JSON.stringify(data.items));
    big.find((i: { id: string }) => i.id === "juling_pan").effect.bonus.cultivation = 0.5;
    expect(() => validateItems(big)).toThrow("cultivation");
    const none = JSON.parse(JSON.stringify(data.items));
    none.find((i: { id: string }) => i.id === "juling_pan").effect.bonus = {};
    expect(() => validateItems(none)).toThrow("bonus");
    const recipes = JSON.parse(JSON.stringify(data.recipes));
    delete recipes.recipes[0].stones;
    expect(() => validateRecipes(recipes)).toThrow("stones");
  });
  it("宗門、心法、法寶都拿到最大值時，修煉加成合計不超過設定的上限", () => {
    const sectMax = Math.max(...data.sects.ranks.map((r) => r.bonus)) * Math.max(...Object.values(data.sects.scale)) * Math.max(...Object.values(data.sects.bonusState));
    const methodMax = Math.max(...data.methods.map((m) => m.effects.cultivation ?? 0));
    const artMax = data.items.reduce((acc, i) => (i.effect.kind === "artifact" && i.effect.slot === "weapon" ? Math.max(acc, i.effect.bonus.cultivation ?? 0) : acc), 0);
    expect((1 + sectMax) * (1 + methodMax) * (1 + artMax) - 1).toBeLessThanOrEqual(data.config.cultivationBonusCap);
  });
  it("法寶日誌帶出名稱", () => {
    expect(formatLogEntry({ month: 700, kind: "forgeDone", realmId: "lianqi", stage: 1, itemId: "ningqi_zhu" }, data)).toContain("凝氣珠");
    expect(formatLogEntry({ month: 700, kind: "forgeFail", realmId: "lianqi", stage: 1 }, data).length).toBeGreaterThan(0);
  });
});

describe("煉器", () => {
  it("條件：境界、材料、靈石", () => {
    expect(canForge(stocked(), "forge_juling_pan", data)).toBe(true);
    expect(canForge(stocked({ spiritStones: 59 }), "forge_juling_pan", data)).toBe(false);
    expect(canForge(stocked({ items: { ling_sha: 1, fu_zhi: 1 } }), "forge_juling_pan", data)).toBe(false);
    expect(canForge(stocked(), "forge_ningqi_zhu", data)).toBe(false);
    expect(canForge(living(1, { realmId: "zhuji", spiritStones: 500, items: { ling_sha: 4, fu_zhi: 2 } }), "forge_ningqi_zhu", data)).toBe(true);
    expect(canForge(stocked(), "juqi_dan", data)).toBe(false);
  });
  it("成功：得法寶、扣材料與靈石；失敗：退回一半材料、靈石不退", () => {
    const win = seedWhere((v) => v < 0.5);
    const lose = seedWhere((v) => v > 0.95);
    const a = forge(stocked({ rngSeed: win }), "forge_juling_pan", data);
    expect(a.items).toMatchObject({ juling_pan: 1, ling_sha: 18, fu_zhi: 9 });
    expect(a.spiritStones).toBe(940);
    expect(a.log[a.log.length - 1].kind).toBe("forgeDone");
    expect(a.rngSeed).toBe(nextRandom(win)[1]);
    const b = forge(stocked({ rngSeed: lose }), "forge_juling_pan", data);
    expect(b.items.juling_pan ?? 0).toBe(0);
    expect(b.items).toMatchObject({ ling_sha: 19, fu_zhi: 9 });
    expect(b.spiritStones).toBe(940);
    expect(b.log[b.log.length - 1].kind).toBe("forgeFail");
  });
  it("成功率受悟性影響", () => {
    const panel = alchemyPanel(stocked({ attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 } }), data)!;
    expect(panel.forge.find((f) => f.id === "forge_juling_pan")!.ratePct).toBe(90);
    expect(panel.forge.find((f) => f.id === "forge_ningqi_zhu")!.reason).toContain("築基");
    expect(panel.recipes.every((r) => ["juqi_dan", "huxin_dan", "bilei_fu", "zhenyao_fu", "huxin_dan_yao", "bilei_fu_yao"].includes(r.id))).toBe(true);
  });
});

describe("裝備與加成", () => {
  const armed = (ids: string[]) => ids.reduce((s, id) => equip(s, id, data), lianqi({ items: Object.fromEntries(ids.map((i) => [i, 1])) }));

  it("裝備從背包移到欄位；同欄換上新的會把舊的退回背包；卸下放回背包", () => {
    const s1 = armed(["juling_pan"]);
    expect(s1.equipment.weapon).toBe("juling_pan");
    expect(s1.items.juling_pan).toBe(0);
    const s2 = equip({ ...s1, items: { ...s1.items, ningqi_zhu: 1 } }, "ningqi_zhu", data);
    expect(s2.equipment.weapon).toBe("ningqi_zhu");
    expect(s2.items.juling_pan).toBe(1);
    const s3 = unequip(s2, "weapon");
    expect(s3.equipment.weapon).toBeNull();
    expect(s3.items.ningqi_zhu).toBe(1);
    expect(unequip(s3, "ward")).toBe(s3);
    expect(canEquip(lianqi(), "juling_pan", data)).toBe(false);
    expect(canEquip(lianqi({ items: { juqi_dan: 1 } }), "juqi_dan", data)).toBe(false);
  });
  it("修煉速度：法器 +3%、+9%；護身不影響", () => {
    const base = monthlyGain(lianqi(), scheduleOf(lianqi(), data), data);
    const gain = (ids: string[]) => monthlyGain(armed(ids), scheduleOf(lianqi(), data), data);
    expect(gain(["juling_pan"])).toBeCloseTo(base * 1.03);
    expect(gain(["yangyuan_ding"])).toBeCloseTo(base * 1.09);
    expect(gain(["huxin_jing"])).toBeCloseTo(base);
    expect(artifactBonus(armed(["yangyuan_ding", "shouyi_huan"]), "cultivation", data)).toBeCloseTo(0.09);
  });
  const zhuji = data.realms.find((r) => r.id === "zhuji")!;
  const cap = (extra: Partial<GameState> = {}): GameState =>
    living(1, { realmId: "zhuji", stage: 2, cultivation: stageNeed(zhuji, 2), attributes: { bone: 5, insight: 6, fortune: 5, mind: 2 }, ...extra });
  it("突破失敗損失與天劫護體", () => {
    const plain = cap();
    const worn = cap({ equipment: { weapon: null, ward: "zhenhun_pei" } });
    expect(currentFailLoss(worn, data)).toBeCloseTo(currentFailLoss(plain, data) - 0.05);
    const a = attemptRaw(plain, false, data);
    const b = attemptRaw(worn, false, data);
    expect(waveChance(b, "guard", data) - waveChance(a, "guard", data)).toBeCloseTo(0.02);
  });
  it("存檔往返保留裝備與帶來的法寶；v19 遷移補空欄位；壞資料指出欄位", () => {
    const s = armed(["juling_pan", "huxin_jing"]);
    expect(deserialize(serialize(s)).equipment).toEqual({ weapon: "juling_pan", ward: "huxin_jing" });
    const old = JSON.parse(serialize(lianqi()));
    old.version = 19;
    delete old.equipment;
    delete old.meta.keptArtifacts;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated.equipment).toEqual({ weapon: null, ward: null });
    expect(migrated.meta.keptArtifacts).toEqual([]);
    const wrongSlot = JSON.parse(serialize(s));
    wrongSlot.equipment.weapon = "huxin_jing";
    expect(() => deserialize(JSON.stringify(wrongSlot))).toThrow("equipment.weapon");
    const wrongKept = JSON.parse(serialize(s));
    wrongKept.meta.keptArtifacts = ["juqi_dan"];
    expect(() => deserialize(JSON.stringify(wrongKept))).toThrow("keptArtifacts");
  });
});

describe("本命：轉世帶走法寶", () => {
  const dead = (level: number, items: Record<string, number>, equipment = { weapon: null, ward: null } as GameState["equipment"]): GameState => ({
    ...withTalent(lianqi({ items, equipment }), level),
    phase: "dead",
  });

  it("本命是天賦：最多 3 級，每級多帶一件", () => {
    const t = data.talents.find((x) => x.id === "benming")!;
    expect(t.maxLevel).toBe(3);
    expect(t.effect).toBe("keepArtifact");
  });
  it("沒有本命天賦什麼都不帶；有 N 級帶品階最高的 N 件（含身上裝備的）", () => {
    const owned = { juling_pan: 1, ningqi_zhu: 1, huxin_jing: 1, juqi_dan: 3 };
    const eq = { weapon: "yangyuan_ding", ward: null } as GameState["equipment"];
    expect(artifactsToKeep(dead(0, owned, eq), data)).toEqual([]);
    expect(artifactsToKeep(dead(1, owned, eq), data)).toEqual(["yangyuan_ding"]);
    expect(artifactsToKeep(dead(2, owned, eq), data)).toEqual(["yangyuan_ding", "ningqi_zhu"]);
    expect(artifactsToKeep(dead(3, owned, eq), data)).toEqual(["yangyuan_ding", "ningqi_zhu", "huxin_jing"]);
  });
  it("下一世擲骰時法寶已在背包，重擲不會丟，裝備欄是空的", () => {
    const next = newLife(dead(2, { ningqi_zhu: 1, juling_pan: 1, shouyi_huan: 1 }), data);
    expect(next.phase).toBe("rolling");
    expect(next.equipment).toEqual({ weapon: null, ward: null });
    expect(next.items.ningqi_zhu).toBe(1);
    expect(next.items.shouyi_huan).toBe(1);
    expect(next.items.juling_pan ?? 0).toBe(0);
    const again = reroll(next, data);
    expect(again.items.ningqi_zhu).toBe(1);
    expect(again.items.shouyi_huan).toBe(1);
  });
  it("帶來的法寶不會一直累積：下一世沒再煉也沒有本命就清掉", () => {
    const next = newLife(dead(1, { ningqi_zhu: 1 }), data);
    const gone = newLife({ ...next, phase: "dead", meta: { ...next.meta, talents: {} } }, data);
    expect(gone.meta.keptArtifacts).toEqual([]);
    expect(Object.keys(gone.items).includes("ningqi_zhu")).toBe(false);
    expect(artifactOf("ningqi_zhu", data)!.effect.tier).toBe(2);
    expect(bonusText({ cultivation: 0.06 })).toBe("修煉速度 +6%");
  });
});

describe("妖丹配方（M37）", () => {
  it("妖丹只來自怪物掉落，配方產出與原版相同、成本不同，並有區分用的名稱", () => {
    const yao = data.items.find((i) => i.id === "yao_dan")!;
    expect(yao.effect.kind).toBe("material");
    expect(data.monsters.monsters.some((m) => m.drops.some((d) => d.itemId === "yao_dan"))).toBe(true);
    for (const s of data.schedules) expect((s.drops ?? []).some((d) => d.itemId === "yao_dan")).toBe(false);
    const variants = data.recipes.recipes.filter((r) => "yao_dan" in r.inputs);
    expect(variants.length).toBe(5);
    for (const v of variants) {
      expect(v.label).toContain("妖丹");
      const base = data.recipes.recipes.find((r) => r.output === v.output && !("yao_dan" in r.inputs))!;
      expect(base).toBeDefined();
      expect(v.baseRate).toBeGreaterThan(base.baseRate - 0.001);
    }
  });
});
