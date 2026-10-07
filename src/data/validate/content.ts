import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  ENDING_CAUSES,
  ENDS_LIFE,
  type EndingCause,
  type EndsLife,
  type BreakthroughRule,
  type GameConfig,
  type GoalCondition,
  type GoalDef,
  type GoalTilt,
  type ItemDef,
  type ItemEffect,
  ARTIFACT_SLOTS,
  type ArtifactSlot,
  type MethodDef,
  type RecipeDef,
  type RecipesData,
  type OriginDef,
  type RealmDef,
  type ScheduleDef,
  type SpiritRootDef,
  type TalentDef,
} from "../types";
import { fail, obj, list, num, optStrList, str, strList, numRecord, uniqueIds, intRecord } from "./common";
import { validateWhen } from "./world";

export function validateConfig(raw: unknown, file = "config.json"): GameConfig {
  const o = obj(raw, file);
  const msPerMonth = num(o, "msPerMonth", file, { gt: 0 });
  const speeds = o.speeds;
  if (
    !Array.isArray(speeds) ||
    speeds.length === 0 ||
    !speeds.every((s) => typeof s === "number" && s > 0)
  ) {
    fail(file, "speeds", "必須是非空的正數陣列");
  }
  const attributeMin = num(o, "attributeMin", file, { min: 1, integer: true });
  const eventMin = num(o, "eventIntervalMin", file, { gt: 0, integer: true });
  return {
    msPerMonth,
    speeds: speeds as number[],
    maxCatchUpMonths: num(o, "maxCatchUpMonths", file, { gt: 0, integer: true }),
    startAgeYears: num(o, "startAgeYears", file, { gt: 0, integer: true }),
    baseCultivation: num(o, "baseCultivation", file, { gt: 0 }),
    bonePerPoint: num(o, "bonePerPoint", file, { min: 0 }),
    attributeMin,
    attributeMax: num(o, "attributeMax", file, { min: attributeMin, integer: true }),
    startRerolls: num(o, "startRerolls", file, { min: 0, integer: true }),
    logLimit: num(o, "logLimit", file, { gt: 0, integer: true }),
    breakthroughFailLoss: num(o, "breakthroughFailLoss", file, { min: 0 }),
    cultivationBonusCap: num(o, "cultivationBonusCap", file, { gt: 0 }),
    focusBonus: num(o, "focusBonus", file, { min: 0, max: 0.5 }),
    focusCooldown: num(o, "focusCooldown", file, { min: 1, max: 24, integer: true }),
    focusMaxCharges: num(o, "focusMaxCharges", file, { min: 1, max: 30, integer: true }),
    wishWeightMult: num(o, "wishWeightMult", file, { min: 1, max: 10 }),
    chartPowerTolerance: num(o, "chartPowerTolerance", file, { gt: 0, max: 1 }),
    omenLossStones: num(o, "omenLossStones", file, { min: 1, integer: true }),
    mindLossReduction: num(o, "mindLossReduction", file, { min: 0 }),
    priceRefItemId: str(o, "priceRefItemId", file),
    eventIntervalMin: eventMin,
    eventIntervalMax: num(o, "eventIntervalMax", file, { min: eventMin, integer: true }),
    fortuneGoodWeight: num(o, "fortuneGoodWeight", file, { min: 0 }),
    daoYunFirstTimeMult: num(o, "daoYunFirstTimeMult", file, { min: 1 }),
    nameMaxLength: num(o, "nameMaxLength", file, { gt: 0, integer: true }),
    offlineMaxHours: num(o, "offlineMaxHours", file, { gt: 0 }),
    offlineMaxYears: num(o, "offlineMaxYears", file, { gt: 0 }),
    offlineMinSeconds: num(o, "offlineMinSeconds", file, { min: 0 }),
    backgroundMinSeconds: num(o, "backgroundMinSeconds", file, { min: 0 }),
    frameGapSeconds: num(o, "frameGapSeconds", file, { gt: 0 }),
    holdLifespanMonths: num(o, "holdLifespanMonths", file, { gt: 0 }),
    talentTotalShowMax: num(o, "talentTotalShowMax", file, { gt: 0 }),
    offlineStopLifespanRatio: num(o, "offlineStopLifespanRatio", file, { min: 0, max: 1 }),
    breakthroughStudyBonus: num(o, "breakthroughStudyBonus", file, { min: 0, max: 1 }),
    breakthroughStudyCap: num(o, "breakthroughStudyCap", file, { min: 0, max: 1 }),
    retreatBriefYears: num(o, "retreatBriefYears", file, { gt: 0 }),
    retreatGagChance: num(o, "retreatGagChance", file, { min: 0, max: 1 }),
    retreatRareChance: num(o, "retreatRareChance", file, { min: 0, max: 1 }),
    retreatLonelyRatio: num(o, "retreatLonelyRatio", file, { min: 0, max: 1 }),
  };
}

export function validateRealms(raw: unknown, file = "realms.json"): RealmDef[] {
  const realms = list(raw, file).map((r, i): RealmDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const need = obj(o.need, `${where} 欄位 need`);
    const breakthrough = o.breakthrough;
    if (breakthrough !== "auto" && breakthrough !== "manual") {
      fail(where, "breakthrough", `必須是 "auto" 或 "manual"，目前為 ${JSON.stringify(breakthrough)}`);
    }
    let breakthroughRule: BreakthroughRule | undefined;
    if (o.breakthroughRule !== undefined) {
      const rw = `${where} 欄位 breakthroughRule`;
      const r = obj(o.breakthroughRule, rw);
      breakthroughRule = {
        baseRate: num(r, "baseRate", rw, { min: 0 }),
        insightBonus: num(r, "insightBonus", rw, { min: 0 }),
      };
      if (r.pillId !== undefined) {
        breakthroughRule.pillId = str(r, "pillId", rw);
        breakthroughRule.pillBonus = num(r, "pillBonus", rw, { min: 0 });
      }
      if (r.requiresTalent !== undefined) {
        const tw = `${rw}.requiresTalent`;
        const q = obj(r.requiresTalent, tw);
        breakthroughRule.requiresTalent = { id: str(q, "id", tw), level: num(q, "level", tw, { gt: 0, integer: true }) };
      }
      if (r.tribulation !== undefined) {
        const tw = `${rw}.tribulation`;
        breakthroughRule.tribulation = { waves: num(obj(r.tribulation, tw), "waves", tw, { min: 2, max: 12, integer: true }) };
      }
      if (r.gateText !== undefined) breakthroughRule.gateText = str(r, "gateText", rw);
      if (r.talentRate !== undefined) {
        const tw = `${rw}.talentRate`;
        const q = obj(r.talentRate, tw);
        breakthroughRule.talentRate = {
          id: str(q, "id", tw),
          from: num(q, "from", tw, { min: 0, integer: true }),
          perLevel: num(q, "perLevel", tw, { gt: 0 }),
        };
      }
    }
    const endsLife = o.endsLife === undefined ? "never" : o.endsLife;
    if (!(ENDS_LIFE as readonly unknown[]).includes(endsLife)) {
      fail(where, "endsLife", `必須是 ${ENDS_LIFE.map((v) => `"${v}"`).join("、")} 其中之一，目前為 ${JSON.stringify(endsLife)}`);
    }
    const ending = o.ending === undefined ? "cleared" : o.ending;
    if (!(ENDING_CAUSES as readonly unknown[]).includes(ending)) {
      fail(where, "ending", `必須是 ${ENDING_CAUSES.map((v) => `"${v}"`).join("、")} 其中之一，目前為 ${JSON.stringify(ending)}`);
    }
    return {
      id,
      name: str(o, "name", where),
      lifespan: num(o, "lifespan", where, { gt: 0 }),
      cultivationMult: num(o, "cultivationMult", where, { gt: 0 }),
      stageNames: strList(o, "stageNames", where, true),
      need: {
        base: num(need, "base", `${where} 欄位 need`, { gt: 0 }),
        growth: num(need, "growth", `${where} 欄位 need`, { gt: 0 }),
      },
      breakthrough,
      endsLife: endsLife as EndsLife,
      ending: ending as EndingCause,
      daoYun: num(o, "daoYun", where, { min: 0, integer: true }),
      ...(breakthroughRule ? { breakthroughRule } : {}),
      ...(o.zuohua !== undefined
        ? { zuohua: { daoYunPerYear: num(obj(o.zuohua, `${where} 欄位 zuohua`), "daoYunPerYear", `${where} 欄位 zuohua`, { gt: 0 }) } }
        : {}),
    };
  });
  uniqueIds(realms, file);
  const last = realms[realms.length - 1];
  if (last && last.endsLife !== "always") {
    fail(`${file} 第 ${realms.length} 筆（${last.id}）`, "endsLife", `最後一個境界必須是 "always"，否則進入後這一世不會結束，卻沒有下一個境界可走`);
  }
  return realms;
}

export function validateSchedules(raw: unknown, file = "schedules.json"): ScheduleDef[] {
  const schedules = list(raw, file).map((r, i): ScheduleDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const stones = obj(o.stones, `${where} 欄位 stones`);
    const sw = `${where} 欄位 stones`;
    const min = num(stones, "min", sw, { min: 0, integer: true });
    const chance = num(stones, "chance", sw, { min: 0 });
    if (chance > 1) fail(sw, "chance", `必須 ≤ 1，目前為 ${chance}`);
    const chanceList = (key: "finds" | "drops", raw: unknown) => {
      if (!Array.isArray(raw)) fail(where, key, "必須是陣列");
      return raw.map((f, j) => {
        const fw = `${where} 欄位 ${key}[${j}]`;
        const fo = obj(f, fw);
        const c = num(fo, "chance", fw, { min: 0 });
        if (c > 1) fail(fw, "chance", `必須 ≤ 1，目前為 ${c}`);
        return { itemId: str(fo, "itemId", fw), chance: c };
      });
    };
    const finds = chanceList("finds", o.finds);
    const deathChance = num(o, "deathChance", where, { min: 0 });
    if (deathChance > 1) fail(where, "deathChance", `必須 ≤ 1，目前為 ${deathChance}`);
    return {
      id,
      name: str(o, "name", where),
      desc: str(o, "desc", where),
      cultivationMult: num(o, "cultivationMult", where, { min: 0 }),
      eventRateMult: num(o, "eventRateMult", where, { min: 0 }),
      stones: { chance, min, max: num(stones, "max", sw, { min, integer: true }) },
      finds,
      ...(o.drops !== undefined ? { drops: chanceList("drops", o.drops) } : {}),
      deathChance,
      ...(o.realmMin !== undefined ? { realmMin: str(o, "realmMin", where) } : {}),
      ...(o.requiresSect === true ? { requiresSect: true } : {}),
      ...(o.fatigue !== undefined
        ? (() => {
            const fw = `${where} 欄位 fatigue`;
            const fo = obj(o.fatigue, fw);
            return {
              fatigue: {
                ...(fo.realmMin !== undefined ? { realmMin: str(fo, "realmMin", fw) } : {}),
                ...(fo.realmMax !== undefined ? { realmMax: str(fo, "realmMax", fw) } : {}),
                graceMonths: num(fo, "graceMonths", fw, { min: 0, integer: true }),
                perYear: num(fo, "perYear", fw, { min: 0, max: 1 }),
                floor: num(fo, "floor", fw, { min: 0, max: 1 }),
                recoverPerMonth: num(fo, "recoverPerMonth", fw, { min: 1, integer: true }),
              },
            };
          })()
        : {}),
      ...(o.worldHints !== undefined
        ? {
            worldHints: (Array.isArray(o.worldHints) ? o.worldHints : fail(where, "worldHints", "必須是陣列")).map((h: unknown, j: number) => {
              const hw = `${where} 欄位 worldHints[${j}]`;
              const ho = obj(h, hw);
              return { when: validateWhen(ho.when, hw), text: str(ho, "text", hw) };
            }),
          }
        : {}),
    };
  });
  uniqueIds(schedules, file);
  return schedules;
}

export function validateItems(raw: unknown, file = "items.json"): ItemDef[] {
  const items = list(raw, file).map((r, i): ItemDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const ew = `${where} 欄位 effect`;
    const e = obj(o.effect, ew);
    const kind = e.kind;
    let effect: ItemEffect;
    if (kind === "cultivationFraction") {
      const falloff = e.falloff;
      if (!Array.isArray(falloff) || falloff.length === 0 || !falloff.every((x) => typeof x === "number" && x > 0 && x <= 1)) {
        return fail(ew, "falloff", `必須是非空的陣列，每個元素介於 0（不含）與 1 之間，目前為 ${JSON.stringify(falloff)}`);
      }
      effect = { kind, value: num(e, "value", ew, { gt: 0 }), falloff: falloff as number[] };
    } else if (kind === "lifespan") {
      effect = {
        kind,
        years: num(e, "years", ew, { gt: 0, integer: true }),
        maxPerLife: num(e, "maxPerLife", ew, { gt: 0, integer: true }),
      };
    } else if (kind === "breakthrough") {
      effect = { kind };
    } else if (kind === "tribulationWard") {
      effect = { kind, bonus: num(e, "bonus", ew, { gt: 0, max: 0.5 }) };
    } else if (kind === "huntWard") {
      effect = { kind };
    } else if (kind === "failLossRelief") {
      effect = { kind, value: num(e, "value", ew, { gt: 0, max: 0.3 }) };
    } else if (kind === "material") {
      effect = { kind };
    } else if (kind === "artifact") {
      const slot = e.slot;
      if (!(ARTIFACT_SLOTS as readonly unknown[]).includes(slot)) return fail(ew, "slot", `必須是 ${ARTIFACT_SLOTS.join("、")}，目前為 ${JSON.stringify(slot)}`);
      const bw = `${ew} 欄位 bonus`;
      const b = obj(e.bonus, bw);
      for (const k of Object.keys(b)) if (!["cultivation", "failLoss", "guardBonus"].includes(k)) fail(bw, k, "不是法寶加成");
      const opt = (key: string, max: number) => (b[key] !== undefined ? { [key]: num(b, key, bw, { gt: 0, max }) } : {});
      const bonus = { ...opt("cultivation", 0.12), ...opt("failLoss", 0.1), ...opt("guardBonus", 0.1) };
      if (Object.keys(bonus).length === 0) fail(ew, "bonus", "至少要有一項加成");
      effect = { kind, slot: slot as ArtifactSlot, tier: num(e, "tier", ew, { min: 1, max: 3, integer: true }), bonus };
    } else {
      return fail(ew, "kind", `必須是 cultivationFraction、lifespan、breakthrough、tribulationWard、huntWard、failLossRelief、material 或 artifact，目前為 ${JSON.stringify(kind)}`);
    }
    return {
      id,
      name: str(o, "name", where),
      desc: str(o, "desc", where),
      // 材料不在坊市賣，價格固定為 0；其餘必須是正整數
      price: effect.kind === "material" || effect.kind === "artifact" ? num(o, "price", where, { min: 0, max: 0, integer: true }) : num(o, "price", where, { gt: 0, integer: true }),
      effect,
    };
  });
  uniqueIds(items, file);
  return items;
}

export function validateMethods(raw: unknown, file = "methods.json"): MethodDef[] {
  const methods = list(raw, file).map((r, i): MethodDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const ew = `${where} 欄位 effects`;
    const e = obj(o.effects, ew);
    for (const k of Object.keys(e)) {
      if (!["cultivation", "eventRate", "failLoss", "guardBonus", "fragmentChance"].includes(k)) fail(ew, k, "不是心法效果");
    }
    const opt = (key: string, min: number, max: number) => (e[key] !== undefined ? { [key]: num(e, key, ew, { min, max }) } : {});
    const effects = { ...opt("cultivation", -0.5, 0.5), ...opt("eventRate", -0.9, 1), ...opt("failLoss", 0, 0.3), ...opt("guardBonus", 0, 0.2), ...opt("fragmentChance", 0, 1) };
    const uw = `${where} 欄位 unlock`;
    return { id, name: str(o, "name", where), desc: str(o, "desc", where), effects, unlock: { fragments: num(obj(o.unlock, uw), "fragments", uw, { min: 0, integer: true }) } };
  });
  uniqueIds(methods, file);
  const first = methods[0];
  if (first.unlock.fragments !== 0 || Object.keys(first.effects).length > 0) {
    fail(`${file} 第 1 筆（${first.id}）`, "effects", "第一個心法是預設，必須沒有任何效果且不需解鎖");
  }
  return methods;
}

export function validateRecipes(raw: unknown, file = "recipes.json"): RecipesData {
  const o = obj(raw, file);
  const rw = `${file} 欄位 rules`;
  const r = obj(o.rules, rw);
  const rules = {
    insightPerPoint: num(r, "insightPerPoint", rw, { min: 0, max: 0.1 }),
    maxRate: num(r, "maxRate", rw, { gt: 0, max: 1 }),
    failRefund: num(r, "failRefund", rw, { min: 0, max: 1 }),
  };
  const recipes = list(o.recipes, `${file} 欄位 recipes`).map((x, i): RecipeDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const ro = obj(x, where);
    const id = str(ro, "id", where);
    const w = `${where}（${id}）`;
    const inputs = intRecord(ro, "inputs", w, 1);
    if (Object.keys(inputs).length === 0) fail(w, "inputs", "至少要有一種材料");
    const baseRate = num(ro, "baseRate", w, { gt: 0, max: 1 });
    const kind = ro.kind === undefined ? "brew" : ro.kind;
    if (kind !== "brew" && kind !== "forge") fail(w, "kind", `必須是 brew 或 forge，目前為 ${JSON.stringify(kind)}`);
    // 煉丹要經過數個月、不花靈石；煉器即時完成（月數為 0）、要花靈石
    const months = kind === "brew" ? num(ro, "months", w, { gt: 0, integer: true }) : num(ro, "months", w, { min: 0, max: 0, integer: true });
    const stones = kind === "forge" ? num(ro, "stones", w, { gt: 0, integer: true }) : ro.stones === undefined ? 0 : num(ro, "stones", w, { min: 0, max: 0, integer: true });
    return { id, kind, stones, output: str(ro, "output", w), inputs, months, baseRate, realmMin: str(ro, "realmMin", w), ...(ro.label !== undefined ? { label: str(ro, "label", w) } : {}) };
  });
  uniqueIds(recipes, `${file} 欄位 recipes`);
  return { rules, recipes };
}

export function validateTalents(raw: unknown, file = "talents.json"): TalentDef[] {
  const talents = list(raw, file).map((r, i): TalentDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const effect = o.effect;
    if (
      effect !== "cultivation" &&
      effect !== "rerolls" &&
      effect !== "fortune" &&
      effect !== "stoneCarry" &&
      effect !== "failLoss" &&
      effect !== "breakthroughAid" &&
      effect !== "keepArtifact" &&
      effect !== "chartChoice" &&
      effect !== "wish" &&
      effect !== "omen"
    ) {
      fail(where, "effect", `必須是 cultivation、rerolls、fortune、stoneCarry、failLoss、breakthroughAid、keepArtifact、chartChoice、wish 或 omen，目前為 ${JSON.stringify(effect)}`);
    }
    const cost = obj(o.cost, `${where} 欄位 cost`);
    return {
      id,
      name: str(o, "name", where),
      desc: str(o, "desc", where),
      maxLevel: num(o, "maxLevel", where, { gt: 0, integer: true }),
      effect,
      perLevel: num(o, "perLevel", where, { gt: 0 }),
      cost: {
        base: num(cost, "base", `${where} 欄位 cost`, { gt: 0 }),
        growth: num(cost, "growth", `${where} 欄位 cost`, { gt: 0 }),
      },
      ...(o.advice !== undefined
        ? (() => {
            const a = obj(o.advice, `${where} 欄位 advice`);
            return { advice: { upTo: num(a, "upTo", `${where} 欄位 advice`, { gt: 0, integer: true }), reason: str(a, "reason", `${where} 欄位 advice`) } };
          })()
        : {}),
    };
  });
  uniqueIds(talents, file);
  return talents;
}

export function validateSpiritRoots(raw: unknown, file = "spiritRoots.json"): SpiritRootDef[] {
  const roots = list(raw, file).map((r, i): SpiritRootDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    return {
      id,
      name: str(o, "name", where),
      mult: num(o, "mult", where, { gt: 0 }),
      weight: num(o, "weight", where, { gt: 0 }),
    };
  });
  uniqueIds(roots, file);
  return roots;
}

export function validateOrigins(raw: unknown, file = "origins.json"): OriginDef[] {
  const origins = list(raw, file).map((r, i): OriginDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const attributes = numRecord(o, "attributes", where, true);
    for (const k of Object.keys(attributes)) {
      if (!(ATTRIBUTE_KEYS as readonly string[]).includes(k)) {
        fail(where, `attributes.${k}`, `不是合法的屬性，可用：${ATTRIBUTE_KEYS.join("、")}`);
      }
    }
    return {
      id,
      name: str(o, "name", where),
      desc: str(o, "desc", where),
      weight: num(o, "weight", where, { gt: 0 }),
      spiritStones: num(o, "spiritStones", where, { min: 0, integer: true }),
      items: numRecord(o, "items", where, true),
      cultivationBonus: num(o, "cultivationBonus", where, { min: 0 }),
      attributes: attributes as Partial<Record<AttributeKey, number>>,
    };
  });
  uniqueIds(origins, file);
  return origins;
}

function parseTilt(raw: unknown, where: string): GoalTilt {
  const o = obj(raw, where);
  const tilt: GoalTilt = {};
  for (const k of ["eventIds", "flags", "acquaintances"] as const) {
    const list = optStrList(o, k, where);
    if (list !== undefined) tilt[k] = list;
  }
  for (const k of Object.keys(o)) if (!["eventIds", "flags", "acquaintances"].includes(k)) fail(where, k, "不是合法的欄位");
  if (Object.keys(tilt).length === 0) fail(where, "（根）", "至少要有 eventIds、flags、acquaintances 其中一項");
  return tilt;
}

export function validateGoals(raw: unknown, file = "goals.json"): GoalDef[] {
  const goals = list(raw, file).map((r, i): GoalDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const co = obj(o.condition, `${w} 欄位 condition`);
    const cw = `${w} 欄位 condition`;
    const kind = str(co, "kind", cw);
    let condition: GoalCondition;
    if (kind === "realm") {
      condition = { kind, realmId: str(co, "realmId", cw), ...(co.stage !== undefined ? { stage: num(co, "stage", cw, { min: 0, integer: true }) } : {}) };
    } else if (kind === "age") {
      condition = { kind, years: num(co, "years", cw, { gt: 0, integer: true }) };
    } else if (kind === "fragments" || kind === "events") {
      condition = { kind, count: num(co, "count", cw, { gt: 0, integer: true }) };
    } else if (kind === "flag") {
      condition = { kind, flagId: str(co, "flagId", cw) };
    } else {
      return fail(cw, "kind", `必須是 realm、age、fragments、flag、events 之一，目前為 ${kind}`);
    }
    return {
      id,
      name: str(o, "name", w),
      desc: str(o, "desc", w),
      group: str(o, "group", w),
      minLives: num(o, "minLives", w, { min: 0, integer: true }),
      condition,
      ...(o.tilt !== undefined ? { tilt: parseTilt(o.tilt, `${w} 欄位 tilt`) } : {}),
    };
  });
  uniqueIds(goals, file);
  if (goals.length === 0) fail(file, "（根）", "不可為空");
  return goals;
}

export function validateEras(raw: unknown, file = "eras.json"): string[] {
  const o = obj(raw, file);
  const names = strList(o, "names", file);
  const seen = new Set<string>();
  names.forEach((n, i) => {
    if (n.length < 2 || n.length > 4) fail(file, `names[${i}]`, `年號需要 2 到 4 個字，目前為「${n}」`);
    if (seen.has(n)) fail(file, `names[${i}]`, `年號「${n}」重複`);
    seen.add(n);
  });
  return names;
}
