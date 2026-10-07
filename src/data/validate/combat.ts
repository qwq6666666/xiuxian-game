import {
  HUNT_ACTIONS,
  type HuntAction,
  type HuntActionDef,
  type HuntTraitDef,
  type HuntRules,
  type MonsterDef,
  type MonstersData,
  type TribulationData,
  type TrialsData,
} from "../types";
import { fail, intRecord, obj, list, num, str, strList, uniqueIds } from "./common";

/** 歷練遇怪的規則與怪物（monsters.json） */
export function validateMonsters(raw: unknown, realmIds: string[], itemIds: string[], file = "monsters.json"): MonstersData {
  const o = obj(raw, file);
  const rw = `${file} 欄位 rules`;
  const r = obj(o.rules, rw);
  const power = obj(r.realmPower, `${rw}.realmPower`);
  const realmPower: Record<string, number> = {};
  for (const id of realmIds) realmPower[id] = num(power, id, `${rw}.realmPower`, { gt: 0 });
  const fw = `${rw}.flee`;
  const f = obj(r.flee, fw);
  const aw = `${rw}.actions`;
  const a = obj(r.actions, aw);
  const actions = {} as Record<HuntAction, HuntActionDef>;
  for (const key of HUNT_ACTIONS) {
    const w = `${aw}.${key}`;
    const ao = obj(a[key], w);
    actions[key] = { name: str(ao, "name", w), hit: num(ao, "hit", w, { gt: 0, max: 1 }), dmg: num(ao, "dmg", w, { gt: 0, max: 1 }), taken: num(ao, "taken", w, { min: 0, max: 1 }) };
  }
  const traitsW = `${rw}.traits`;
  const traitsRaw = obj(r.traits, traitsW);
  const traits: Record<string, HuntTraitDef> = {};
  for (const key of Object.keys(traitsRaw)) {
    const w = `${traitsW}.${key}`;
    const to = obj(traitsRaw[key], w);
    const def: HuntTraitDef = { name: str(to, "name", w), desc: str(to, "desc", w) };
    if (to.steadyDmg !== undefined) def.steadyDmg = num(to, "steadyDmg", w, { gt: 0, max: 1 });
    if (to.takenMul !== undefined) def.takenMul = num(to, "takenMul", w, { min: 1, max: 2 });
    if (to.fleePenalty !== undefined) def.fleePenalty = num(to, "fleePenalty", w, { gt: 0, max: 0.5 });
    if (def.steadyDmg === undefined && def.takenMul === undefined && def.fleePenalty === undefined) fail(w, "steadyDmg", "steadyDmg、takenMul、fleePenalty 至少要寫一個");
    traits[key] = def;
  }
  const tw = `${rw}.text`;
  const t = obj(r.text, tw);
  const text = { lose: str(t, "lose", tw), fleeOk: str(t, "fleeOk", tw), fleeFail: str(t, "fleeFail", tw), draw: str(t, "draw", tw) };
  for (const [k, v] of Object.entries(text)) if (!v.includes("{monster}")) fail(tw, k, "必須含 {monster}");
  const rules: HuntRules = {
    schedule: str(r, "schedule", rw),
    chance: num(r, "chance", rw, { min: 0, max: 1 }),
    rounds: num(r, "rounds", rw, { min: 1, max: 6, integer: true }),
    realmPower,
    stagePower: num(r, "stagePower", rw, { min: 0, max: 0.3 }),
    bonePower: num(r, "bonePower", rw, { min: 0, max: 0.2 }),
    ratioHit: num(r, "ratioHit", rw, { min: 0, max: 1 }),
    variance: num(r, "variance", rw, { min: 0, max: 0.5 }),
    lossFrac: num(r, "lossFrac", rw, { min: 0, max: 0.5 }),
    drawLossFrac: num(r, "drawLossFrac", rw, { min: 0, max: 0.5 }),
    flee: {
      base: num(f, "base", fw, { min: 0, max: 1 }),
      perRatio: num(f, "perRatio", fw, { min: 0, max: 1 }),
      perFortune: num(f, "perFortune", fw, { min: 0, max: 0.2 }),
      min: num(f, "min", fw, { min: 0, max: 1 }),
      max: num(f, "max", fw, { min: 0, max: 1 }),
      failLoss: num(f, "failLoss", fw, { min: 0, max: 0.5 }),
    },
    autoMinRatio: num(r, "autoMinRatio", rw, { min: 0 }),
    actions,
    traits,
    text,
  };
  if (rules.flee.min > rules.flee.max) fail(fw, "min", "不可大於 max");
  const monsters = list(o.monsters, `${file} 欄位 monsters`).map((raw, i): MonsterDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const m = obj(raw, where);
    const id = str(m, "id", where);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const realm = str(m, "realm", w);
    if (!realmIds.includes(realm)) fail(w, "realm", `找不到境界 ${realm}`);
    const sw = `${w}.stones`;
    const so = obj(m.stones, sw);
    const stones = { min: num(so, "min", sw, { min: 0, integer: true }), max: num(so, "max", sw, { min: 0, integer: true }) };
    if (stones.min > stones.max) fail(sw, "min", "不可大於 max");
    if (!Array.isArray(m.drops)) fail(w, "drops", "必須是陣列（可為空）");
    const drops = (m.drops as unknown[]).map((d, j) => {
      const dw = `${w}.drops[${j}]`;
      const dobj = obj(d, dw);
      const itemId = str(dobj, "itemId", dw);
      if (!itemIds.includes(itemId)) fail(dw, "itemId", `找不到物品 ${itemId}`);
      return { itemId, chance: num(dobj, "chance", dw, { gt: 0, max: 1 }) };
    });
    const trait = m.trait === undefined ? undefined : str(m, "trait", w);
    if (trait !== undefined && !(trait in traits)) fail(w, "trait", `找不到特性 ${trait}`);
    return {
      id,
      name: str(m, "name", w),
      realm,
      ...(trait !== undefined ? { trait } : {}),
      power: num(m, "power", w, { gt: 0, max: 3 }),
      reward: num(m, "reward", w, { gt: 0, max: 10 }),
      stones,
      drops,
      appear: str(m, "appear", w),
      win: str(m, "win", w),
      ...Object.fromEntries((["lore", "loseText", "fleeOkText", "fleeFailText", "drawText"] as const).filter((k) => m[k] !== undefined).map((k) => [k, str(m, k, w)])),
    };
  });
  uniqueIds(monsters, file);
  return { rules, monsters };
}

/** 天劫數值與劫波文字（tribulation.json） */
export function validateTribulation(raw: unknown, file = "tribulation.json"): TribulationData {
  const o = obj(raw, file);
  const g = obj(o.guard, `${file} 欄位 guard`);
  const gw = `${file} 欄位 guard`;
  const images = list(o.images, `${file} 欄位 images`).map((r, i) => {
    const iw = `${file} 欄位 images[${i}]`;
    const io = obj(r, iw);
    return { name: str(io, "name", iw), arrive: str(io, "arrive", iw), pass: str(io, "pass", iw), fail: str(io, "fail", iw) };
  });
  return {
    guard: { perMind: num(g, "perMind", gw, { min: 0 }), max: num(g, "max", gw, { min: 0, max: 0.5 }), extraLoss: num(g, "extraLoss", gw, { min: 0, max: 0.5 }) },
    maxChance: num(o, "maxChance", file, { gt: 0, max: 1 }),
    focusBonus: num(o, "focusBonus", file, { min: 0, max: 0.1 }),
    images,
  };
}

/** 秘境試煉（trials.json，M47）：層數、花費月數、獎勵；怪物與物品必須存在，怪物須屬於秘境的境界 */
export function validateTrials(raw: unknown, monsters: MonsterDef[], realmIds: string[], itemIds: string[], file = "trials.json"): TrialsData {
  const o = obj(raw, file);
  const rw = `${file} 欄位 rules`;
  const r = obj(o.rules, rw);
  const tw = `${rw}.text`;
  const t = obj(r.text, tw);
  const text = { enter: str(t, "enter", tw), clear: str(t, "clear", tw), fail: str(t, "fail", tw), abandon: str(t, "abandon", tw) };
  for (const [k, v] of Object.entries(text)) if (!v.includes("{trial}")) fail(tw, k, "必須含 {trial}");
  const trials = list(o.trials, `${file} 欄位 trials`).map((raw2, i) => {
    const where = `${file} 第 ${i + 1} 筆`;
    const m = obj(raw2, where);
    const id = str(m, "id", where);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const realm = str(m, "realm", w);
    if (!realmIds.includes(realm)) fail(w, "realm", `找不到境界 ${realm}`);
    const floors = strList(m, "floors", w);
    if (floors.length < 3 || floors.length > 5) fail(w, "floors", `層數必須是 3 到 5，目前為 ${floors.length}`);
    for (const f of floors) {
      const mon = monsters.find((x) => x.id === f);
      if (!mon) fail(w, "floors", `找不到怪物 ${f}`);
      if (mon.realm !== realm) fail(w, "floors", `怪物 ${f} 屬於 ${mon.realm}，與秘境的境界 ${realm} 不同`);
    }
    const rewardW = `${w}.reward`;
    const ro = obj(m.reward, rewardW);
    const sw = `${rewardW}.stones`;
    const so = obj(ro.stones, sw);
    const stones = { min: num(so, "min", sw, { min: 0, integer: true }), max: num(so, "max", sw, { min: 0, integer: true }) };
    if (stones.min > stones.max) fail(sw, "min", "不可大於 max");
    const items = intRecord(ro, "items", rewardW, 1);
    for (const itemId of Object.keys(items)) if (!itemIds.includes(itemId)) fail(rewardW, "items", `找不到物品 ${itemId}`);
    return {
      id,
      name: str(m, "name", w),
      desc: str(m, "desc", w),
      realm,
      months: num(m, "months", w, { min: 1, max: 24, integer: true }),
      floors,
      reward: { cultivationMonths: num(ro, "cultivationMonths", rewardW, { min: 0, max: 6 }), stones, items },
    };
  });
  uniqueIds(trials, file);
  return { rules: { lifespanBuffer: num(r, "lifespanBuffer", rw, { min: 0, max: 60, integer: true }), text }, trials };
}
