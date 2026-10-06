import { SLOT_NAMES, slotProblems } from "./slots";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  ENDING_CAUSES,
  ENDS_LIFE,
  type EndingCause,
  type EndsLife,
  REVIEW_CAUSES,
  type BreakthroughRule,
  type ChoiceDef,
  type ClosingVariant,
  type Effects,
  type EventConditions,
  type EventDef,
  type FragmentData,
  type FragmentDef,
  type GameConfig,
  type GoalCondition,
  type GoalDef,
  type GameData,
  type MapData,
  type MapRegion,
  type Point,
  SECT_STATES,
  type SectState,
  MAP_REFS,
  type MapRef,
  type WorldWhen,
  type WorldEffectDef,
  type WorldEventDef,
  WORLD_EVENT_KINDS,
  type WorldEventKind,
  type WorldNames,
  type ItemDef,
  type ItemEffect,
  ALCHEMY_SCHEDULE,
  ARTIFACT_SLOTS,
  type ArtifactSlot,
  type MethodDef,
  HUNT_ACTIONS,
  type HuntAction,
  type HuntActionDef,
  type HuntRules,
  type MonsterDef,
  type MonstersData,
  type RecipeDef,
  type RecipesData,
  type OriginDef,
  type RealmDef,
  type ScheduleDef,
  type SectsData,
  type TribulationData,
  type SectRankDef,
  type SpiritRootDef,
  type TalentDef,
  type NameData,
  type TextData,
} from "./types";

type Obj = Record<string, unknown>;

/** worldEvents 的 note 有自己的模板欄位，檢查參考名時先拿掉 */
const SLOT_PATTERN_FOR_NOTE = /\{[^}]*\}/g;

function fail(where: string, field: string, msg: string): never {
  throw new Error(`${where}：欄位 ${field} ${msg}`);
}

function obj(raw: unknown, where: string): Obj {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${where}：內容必須是物件`);
  }
  return raw as Obj;
}

function list(raw: unknown, where: string): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${where}：內容必須是非空陣列`);
  }
  return raw;
}

interface NumOpts {
  min?: number;
  gt?: number;
  max?: number;
  integer?: boolean;
}

function num(o: Obj, key: string, where: string, opts: NumOpts = {}): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    fail(where, key, `必須是數字，目前為 ${JSON.stringify(v)}`);
  }
  if (opts.integer && !Number.isInteger(v)) fail(where, key, `必須是整數，目前為 ${v}`);
  if (opts.min !== undefined && v < opts.min) fail(where, key, `必須 ≥ ${opts.min}，目前為 ${v}`);
  if (opts.gt !== undefined && v <= opts.gt) fail(where, key, `必須 > ${opts.gt}，目前為 ${v}`);
  if (opts.max !== undefined && v > opts.max) fail(where, key, `必須 ≤ ${opts.max}，目前為 ${v}`);
  return v;
}

function str(o: Obj, key: string, where: string, allowEmpty = false): string {
  const v = o[key];
  if (typeof v !== "string" || (!allowEmpty && v === "")) {
    fail(where, key, `必須是${allowEmpty ? "" : "非空"}字串，目前為 ${JSON.stringify(v)}`);
  }
  return v;
}

function strList(o: Obj, key: string, where: string, allowEmptyItem = false): string[] {
  const v = o[key];
  if (!Array.isArray(v) || v.length === 0) fail(where, key, "必須是非空陣列");
  v.forEach((s, i) => {
    if (typeof s !== "string" || (!allowEmptyItem && s === "")) {
      fail(where, `${key}[${i}]`, "必須是字串");
    }
  });
  return v as string[];
}

function numRecord(o: Obj, key: string, where: string, integer: boolean): Record<string, number> {
  const r = obj(o[key], `${where} 欄位 ${key}`);
  const out: Record<string, number> = {};
  for (const k of Object.keys(r)) out[k] = num(r, k, `${where} 欄位 ${key}`, { min: 0, integer });
  return out;
}

function uniqueIds(items: { id: string }[], file: string): void {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`${file}：id ${it.id} 重複`);
    seen.add(it.id);
  }
}

function tierYears(o: Obj, file: string): [number, number] {
  const v = o.offlineRetreatTierYears;
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === "number" && n > 0) || !(v[0] < v[1])) {
    fail(file, "offlineRetreatTierYears", "必須是兩個由小到大的正數，例如 [5, 15]");
  }
  return [v[0], v[1]];
}

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
    offlineStopLifespanRatio: num(o, "offlineStopLifespanRatio", file, { min: 0, max: 1 }),
    offlineRetreatTierYears: tierYears(o, file),
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
      return fail(ew, "kind", `必須是 cultivationFraction、lifespan、breakthrough、tribulationWard、failLossRelief、material 或 artifact，目前為 ${JSON.stringify(kind)}`);
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
    return { id, kind, stones, output: str(ro, "output", w), inputs, months, baseRate, realmMin: str(ro, "realmMin", w) };
  });
  uniqueIds(recipes, `${file} 欄位 recipes`);
  return { rules, recipes };
}

function optStrList(o: Obj, key: string, where: string): string[] | undefined {
  if (o[key] === undefined) return undefined;
  const v = o[key];
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string" && s !== "")) {
    fail(where, key, "必須是字串陣列");
  }
  return v as string[];
}

function intRecord(o: Obj, key: string, where: string, min?: number): Record<string, number> {
  const r = obj(o[key], `${where} 欄位 ${key}`);
  const out: Record<string, number> = {};
  for (const k of Object.keys(r)) out[k] = num(r, k, `${where} 欄位 ${key}`, { integer: true, min });
  return out;
}

function attrRecord(o: Obj, key: string, where: string): Partial<Record<AttributeKey, number>> {
  const r = intRecord(o, key, where);
  for (const k of Object.keys(r)) {
    if (!(ATTRIBUTE_KEYS as readonly string[]).includes(k)) {
      fail(where, `${key}.${k}`, `不是合法的屬性，可用：${ATTRIBUTE_KEYS.join("、")}`);
    }
  }
  return r as Partial<Record<AttributeKey, number>>;
}

function parseEffects(raw: unknown, where: string): Effects {
  const o = obj(raw, where);
  const e: Effects = {};
  if (o.cultivation !== undefined) e.cultivation = num(o, "cultivation", where);
  if (o.spiritStones !== undefined) e.spiritStones = num(o, "spiritStones", where, { integer: true });
  if (o.lifespan !== undefined) e.lifespan = num(o, "lifespan", where, { integer: true });
  if (o.attributes !== undefined) e.attributes = attrRecord(o, "attributes", where);
  if (o.items !== undefined) e.items = intRecord(o, "items", where);
  if (o.flags !== undefined) e.flags = optStrList(o, "flags", where);
  if (o.contribution !== undefined) e.contribution = num(o, "contribution", where, { integer: true });
  if (o.death !== undefined) {
    if (typeof o.death !== "boolean") fail(where, "death", "必須是 true 或 false");
    e.death = o.death;
  }
  if (o.fragment !== undefined) {
    const fw = `${where} 欄位 fragment`;
    const f = obj(o.fragment, fw);
    if ((f.id === undefined) === (f.maxTier === undefined)) fail(fw, "id/maxTier", "必須擇一提供");
    if (f.id !== undefined) {
      if (f.chance !== undefined) fail(fw, "chance", "只能搭配 maxTier 使用");
      e.fragment = { id: str(f, "id", fw) };
    } else {
      const maxTier = num(f, "maxTier", fw, { min: 1, max: 3, integer: true });
      e.fragment = f.chance === undefined ? { maxTier } : { maxTier, chance: num(f, "chance", fw, { gt: 0, max: 1 }) };
    }
  }
  for (const k of Object.keys(o)) {
    if (!["cultivation", "spiritStones", "lifespan", "attributes", "items", "flags", "death", "fragment", "contribution"].includes(k)) {
      fail(where, k, "不是合法的效果");
    }
  }
  return e;
}

function parseConditions(raw: unknown, where: string): EventConditions {
  const o = raw === undefined ? {} : obj(raw, where);
  const c: EventConditions = {};
  if (o.realmMin !== undefined) c.realmMin = str(o, "realmMin", where);
  if (o.realmMax !== undefined) c.realmMax = str(o, "realmMax", where);
  if (o.ageMin !== undefined) c.ageMin = num(o, "ageMin", where, { min: 0 });
  if (o.ageMax !== undefined) c.ageMax = num(o, "ageMax", where, { min: 0 });
  c.flags = optStrList(o, "flags", where);
  c.flagsNot = optStrList(o, "flagsNot", where);
  c.schedules = optStrList(o, "schedules", where);
  c.world = optStrList(o, "world", where);
  c.worldNot = optStrList(o, "worldNot", where);
  c.origins = optStrList(o, "origins", where);
  c.roots = optStrList(o, "roots", where);
  if (o.territoryConflict !== undefined) {
    if (typeof o.territoryConflict !== "boolean") fail(where, "territoryConflict", "必須是 true 或 false");
    c.territoryConflict = o.territoryConflict;
  }
  if (o.sectInfluence !== undefined) {
    if (typeof o.sectInfluence !== "boolean") fail(where, "sectInfluence", "必須是 true 或 false");
    c.sectInfluence = o.sectInfluence;
  }
  if (o.livesMax !== undefined) c.livesMax = num(o, "livesMax", where, { min: 0, integer: true });
  if (o.sect !== undefined) {
    if (typeof o.sect !== "boolean") fail(where, "sect", "必須是 true 或 false");
    c.sect = o.sect;
  }
  if (o.sectRankMin !== undefined) c.sectRankMin = num(o, "sectRankMin", where, { min: 0, max: 3, integer: true });
  if (o.bottleneck !== undefined) {
    if (typeof o.bottleneck !== "boolean") fail(where, "bottleneck", "必須是 true 或 false");
    c.bottleneck = o.bottleneck;
  }
  if (o.fragmentAvailable !== undefined) {
    c.fragmentAvailable = num(o, "fragmentAvailable", where, { min: 1, max: 3, integer: true });
  }
  for (const k of Object.keys(c) as (keyof EventConditions)[]) if (c[k] === undefined) delete c[k];
  for (const k of Object.keys(o)) {
    if (!["realmMin", "realmMax", "ageMin", "ageMax", "flags", "flagsNot", "schedules", "bottleneck", "fragmentAvailable", "world", "worldNot", "territoryConflict", "sectInfluence", "sect", "sectRankMin", "livesMax", "origins", "roots"].includes(k)) {
      fail(where, k, "不是合法的條件");
    }
  }
  return c;
}

function parseChoice(raw: unknown, where: string): ChoiceDef {
  const o = obj(raw, where);
  const choice: ChoiceDef = {
    text: str(o, "text", where),
    outcomes: list(o.outcomes, `${where} 欄位 outcomes`).map((r, j) => {
      const ow = `${where} 結果 ${j + 1}`;
      const oo = obj(r, ow);
      const outcome: ChoiceDef["outcomes"][number] = {
        weight: num(oo, "weight", ow, { min: 0 }),
        text: str(oo, "text", ow),
        effects: oo.effects === undefined ? {} : parseEffects(oo.effects, `${ow} 欄位 effects`),
      };
      if (oo.weightPerAttribute !== undefined) {
        outcome.weightPerAttribute = attrRecord(oo, "weightPerAttribute", ow);
      }
      if (outcome.weight <= 0 && !Object.values(outcome.weightPerAttribute ?? {}).some((v) => v > 0)) {
        fail(ow, "weight", "必須 > 0（或由 weightPerAttribute 提供權重）");
      }
      return outcome;
    }),
  };
  if (o.requires !== undefined) {
    const rw = `${where} 欄位 requires`;
    const r = obj(o.requires, rw);
    choice.requires = {};
    if (r.spiritStones !== undefined) choice.requires.spiritStones = num(r, "spiritStones", rw, { min: 0, integer: true });
    if (r.items !== undefined) choice.requires.items = intRecord(r, "items", rw, 0);
    if (r.attributes !== undefined) choice.requires.attributes = attrRecord(r, "attributes", rw);
    if (r.fragments !== undefined) {
      const fr = r.fragments;
      if (!Array.isArray(fr) || fr.length === 0 || !fr.every((f) => typeof f === "string")) {
        fail(rw, "fragments", `必須是非空的字串陣列，目前為 ${JSON.stringify(fr)}`);
      }
      choice.requires.fragments = fr as string[];
    }
  }
  return choice;
}

/**
 * 事件分檔載入：主檔 events.json 必須非空，src/data/events/ 底下的擴充檔可以是空陣列。
 * 各檔用自己的檔名回報錯誤，id 在所有檔案之間不得重複；順序依傳入順序（影響亂數結果，主檔在前）。
 */
export function validateEventFiles(files: { file: string; raw: unknown }[]): EventDef[] {
  const all: EventDef[] = [];
  files.forEach(({ file, raw }, i) => {
    if (i > 0 && Array.isArray(raw) && raw.length === 0) return;
    all.push(...validateEvents(raw, file));
  });
  uniqueIds(all, "events（所有事件檔）");
  return all;
}

export function validateEvents(raw: unknown, file = "events.json"): EventDef[] {
  const events = list(raw, file).map((r, i): EventDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const where = `${file} 第 ${i + 1} 筆（${id}）`;
    const type = o.type;
    if (type !== "anecdote" && type !== "choice") {
      fail(where, "type", `必須是 "anecdote" 或 "choice"，目前為 ${JSON.stringify(type)}`);
    }
    const tone = o.tone;
    if (tone !== "good" && tone !== "bad" && tone !== "neutral") {
      fail(where, "tone", `必須是 good、bad 或 neutral，目前為 ${JSON.stringify(tone)}`);
    }
    const ev: EventDef = {
      id,
      type,
      title: str(o, "title", where),
      text: str(o, "text", where),
      weight: num(o, "weight", where, { gt: 0 }),
      tone,
      maxPerLife: o.maxPerLife === undefined ? 1 : num(o, "maxPerLife", where, { gt: 0, integer: true }),
      conditions: parseConditions(o.conditions, `${where} 欄位 conditions`),
    };
    if (o.highlight !== undefined) ev.highlight = num(o, "highlight", where, { min: 0 });
    if (o.guaranteed !== undefined) {
      if (typeof o.guaranteed !== "boolean") fail(where, "guaranteed", "必須是 true 或 false");
      if (o.guaranteed) {
        if (ev.maxPerLife !== 1) fail(where, "guaranteed", "必出的事件 maxPerLife 必須是 1");
        if (ev.conditions.ageMax === undefined) fail(where, "guaranteed", "必出的事件必須設 conditions.ageMax，否則錯過時機也會硬出");
        ev.guaranteed = true;
      }
    }
    if (o.scheduleWeights !== undefined) {
      const sw = obj(o.scheduleWeights, `${where} 欄位 scheduleWeights`);
      ev.scheduleWeights = {};
      for (const k of Object.keys(sw)) ev.scheduleWeights[k] = num(sw, k, `${where} 欄位 scheduleWeights`, { min: 0 });
    }
    if (type === "anecdote") {
      if (o.choices !== undefined) fail(where, "choices", "見聞不能有選項");
      if (o.effects !== undefined) ev.effects = parseEffects(o.effects, `${where} 欄位 effects`);
    } else {
      if (o.effects !== undefined) fail(where, "effects", "抉擇的效果要寫在各選項的結果裡");
      const choices = list(o.choices, `${where} 欄位 choices`);
      if (choices.length < 2 || choices.length > 4) fail(where, "choices", `必須有 2–4 個選項，目前為 ${choices.length}`);
      ev.choices = choices.map((c, j) => parseChoice(c, `${where} 選項 ${j + 1}`));
      if (!ev.choices.some((c) => !c.requires)) {
        fail(where, "choices", "至少要有一個沒有前提的選項，否則玩家可能無路可選");
      }
    }
    return ev;
  });
  uniqueIds(events, file);
  return events;
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
      effect !== "keepArtifact"
    ) {
      fail(where, "effect", `必須是 cultivation、rerolls、fortune、stoneCarry、failLoss、breakthroughAid 或 keepArtifact，目前為 ${JSON.stringify(effect)}`);
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

export function validateText(raw: unknown, file = "text.json"): TextData {
  const o = obj(raw, file);
  const log = obj(o.log, `${file} 欄位 log`);
  const where = `${file} 欄位 log`;
  const retreat = obj(log.retreat, `${where}.retreat`);
  const retreatStop = obj(retreat.stop, `${where}.retreat.stop`);
  const strRecord = (key: string): Record<string, string> => {
    const raw = obj(log[key], `${where}.${key}`);
    const out: Record<string, string> = {};
    for (const k of Object.keys(raw)) out[k] = str(raw, k, `${where}.${key}`);
    return out;
  };
  // 先檢查 review，缺欄位時錯誤訊息的順序才穩定
  const review = parseReview(o.review, `${file} 欄位 review`);
  const collection = obj(o.collection, `${file} 欄位 collection`);
  const era = obj(o.era, `${file} 欄位 era`);
  return {
    log: {
      stageUp: strList(log, "stageUp", where),
      realmUp: strRecord("realmUp"),
      bottleneck: str(log, "bottleneck", where),
      death: str(log, "death", where),
      breakthroughSuccess: strRecord("breakthroughSuccess"),
      breakthroughFail: strList(log, "breakthroughFail", where),
      buy: strList(log, "buy", where),
      find: strList(log, "find", where),
      adventureDeath: str(log, "adventureDeath", where),
      zuohua: str(log, "zuohua", where),
      stageMilestone: strRecord("stageMilestone"),
      tribulationFail: str(log, "tribulationFail", where),
      alchemy: (() => {
        const aw = `${where}.alchemy`;
        const ao = obj(log.alchemy, aw);
        return { done: str(ao, "done", aw), fail: str(ao, "fail", aw), stop: str(ao, "stop", aw) };
      })(),
      forge: (() => {
        const fw = `${where}.forge`;
        const fo = obj(log.forge, fw);
        return { done: str(fo, "done", fw), fail: str(fo, "fail", fw) };
      })(),
      sect: (() => {
        const sw = `${where}.sect`;
        const so = obj(log.sect, sw);
        return { join: str(so, "join", sw), refuse: str(so, "refuse", sw), leave: str(so, "leave", sw), promote: ((): Record<string, string> => {
          const po = obj(so.promote, `${sw}.promote`);
          const out: Record<string, string> = {};
          for (const k of Object.keys(po)) out[k] = str(po, k, `${sw}.promote`);
          return out;
        })() };
      })(),
      retreat: {
        short: strList(retreat, "short", `${where}.retreat`),
        medium: strList(retreat, "medium", `${where}.retreat`),
        long: strList(retreat, "long", `${where}.retreat`),
        stop: {
          bottleneck: strList(retreatStop, "bottleneck", `${where}.retreat.stop`),
          lifespan: strList(retreatStop, "lifespan", `${where}.retreat.stop`),
        },
      },
    },
    era: {
      opening: strList(era, "opening", `${file} 欄位 era`),
      transition: str(era, "transition", `${file} 欄位 era`),
      born: str(era, "born", `${file} 欄位 era`),
    },
    breakthroughGate: str(o, "breakthroughGate", file),
    talentAdvice: (() => {
      const g = obj(o.talentAdvice, `${file} 欄位 talentAdvice`);
      const w = `${file} 欄位 talentAdvice`;
      return {
        gate: str(g, "gate", w),
        preview: str(g, "preview", w),
        shortfall: str(g, "shortfall", w),
        total: str(g, "total", w),
        thresholdMet: str(g, "thresholdMet", w),
        threshold: str(g, "threshold", w),
      };
    })(),
    versus: (() => {
      const g = obj(o.versus, `${file} 欄位 versus`);
      const w = `${file} 欄位 versus`;
      return {
        ageMore: str(g, "ageMore", w),
        ageLess: str(g, "ageLess", w),
        ageSame: str(g, "ageSame", w),
        progressFar: str(g, "progressFar", w),
        progressShort: str(g, "progressShort", w),
        progressSame: str(g, "progressSame", w),
        originDiff: str(g, "originDiff", w),
      };
    })(),
    guide: (() => {
      const g = obj(o.guide, `${file} 欄位 guide`);
      const w = `${file} 欄位 guide`;
      return { bone: str(g, "bone", w), insight: str(g, "insight", w), fortune: str(g, "fortune", w), mind: str(g, "mind", w), spiritRoot: str(g, "spiritRoot", w) };
    })(),
    review,
    collection: {
      note: str(collection, "note", `${file} 欄位 collection`),
      empty: str(collection, "empty", `${file} 欄位 collection`),
      allCleared: str(collection, "allCleared", `${file} 欄位 collection`),
    },
  };
}

/** 宗門數值（sects.json）：位階由低到高，晉升條件逐級提高，各種宗門的上限不超過位階數 */
export function validateSects(raw: unknown, file = "sects.json"): SectsData {
  const o = obj(raw, file);
  const kinds = ["great", "school"] as const;
  const rec = <K extends string>(parent: Obj, key: string, keys: readonly K[], where: string, opts: NumOpts): Record<K, number> => {
    const r = obj(parent[key], `${where} 欄位 ${key}`);
    const out = {} as Record<K, number>;
    for (const k of keys) out[k] = num(r, k, `${where} 欄位 ${key}`, opts);
    return out;
  };
  const j = obj(o.join, `${file} 欄位 join`);
  const jw = `${file} 欄位 join`;
  const rootRaw = obj(j.rootBonus, `${jw} 欄位 rootBonus`);
  const rootBonus: Record<string, number> = {};
  for (const k of Object.keys(rootRaw)) rootBonus[k] = num(rootRaw, k, `${jw} 欄位 rootBonus`, { min: 0 });
  const ranks = list(o.ranks, `${file} 欄位 ranks`).map((r, i): SectRankDef => {
    const rw = `${file} 欄位 ranks[${i}]`;
    const ro = obj(r, rw);
    const rank: SectRankDef = {
      id: str(ro, "id", rw),
      name: str(ro, "name", rw),
      bonus: num(ro, "bonus", rw, { min: 0 }),
      stipend: num(ro, "stipend", rw, { min: 0, integer: true }),
      duty: num(ro, "duty", rw, { min: 0, integer: true }),
    };
    if (ro.promote !== undefined) {
      const po = obj(ro.promote, `${rw} 欄位 promote`);
      rank.promote = { realm: str(po, "realm", `${rw} 欄位 promote`), contribution: num(po, "contribution", `${rw} 欄位 promote`, { min: 0, integer: true }) };
    } else if (i > 0) {
      fail(rw, "promote", "外門以外的位階都要寫晉升條件");
    }
    return rank;
  });
  uniqueIds(ranks, file);
  for (let i = 2; i < ranks.length; i++) {
    if (ranks[i].promote!.contribution <= ranks[i - 1].promote!.contribution) {
      fail(`${file} 欄位 ranks[${i}]`, "promote.contribution", "必須比前一個位階更高");
    }
  }
  const maxRank = rec(o, "maxRank", kinds, file, { min: 0, max: ranks.length - 1, integer: true });
  const d = obj(o.discount, `${file} 欄位 discount`);
  return {
    join: {
      minRealm: str(j, "minRealm", jw),
      minStage: num(j, "minStage", jw, { min: 0, integer: true }),
      baseRate: rec(j, "baseRate", kinds, jw, { min: 0, max: 1 }),
      stateMult: rec(j, "stateMult", ["prosper", "stable", "decline"] as const, jw, { min: 0 }),
      insightBonus: num(j, "insightBonus", jw, { min: 0 }),
      boneBonus: num(j, "boneBonus", jw, { min: 0 }),
      rootBonus,
    },
    scale: rec(o, "scale", kinds, file, { gt: 0 }),
    maxRank,
    bonusState: rec(o, "bonusState", ["prosper", "stable", "decline"] as const, file, { gt: 0 }),
    ranks,
    discount: { itemIds: strList(d, "itemIds", `${file} 欄位 discount`), mult: num(d, "mult", `${file} 欄位 discount`, { gt: 0, max: 1 }) },
    dutySchedule: str(o, "dutySchedule", file),
  };
}

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
    return {
      id,
      name: str(m, "name", w),
      realm,
      power: num(m, "power", w, { gt: 0, max: 3 }),
      reward: num(m, "reward", w, { gt: 0, max: 10 }),
      stones,
      drops,
      appear: str(m, "appear", w),
      win: str(m, "win", w),
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

export function validateFragments(raw: unknown, file = "fragments.json"): FragmentData {
  const o = obj(raw, file);
  const nameMap = (key: string): Record<string, string> => {
    const r = obj(o[key], `${file} 欄位 ${key}`);
    const out: Record<string, string> = {};
    for (const k of Object.keys(r)) out[k] = str(r, k, `${file} 欄位 ${key}`);
    if (Object.keys(out).length === 0) fail(file, key, "不可為空");
    return out;
  };
  const topics = nameMap("topics");
  const stances = nameMap("stances");
  const items = list(o.items, `${file} 欄位 items`).map((raw, i): FragmentDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const f = obj(raw, where);
    const id = str(f, "id", where);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const topic = str(f, "topic", w);
    if (!(topic in topics)) fail(w, "topic", `不是 topics 裡的 id（${Object.keys(topics).join("、")}），目前為 ${topic}`);
    const stance = str(f, "stance", w);
    if (!(stance in stances)) fail(w, "stance", `不是 stances 裡的 id（${Object.keys(stances).join("、")}），目前為 ${stance}`);
    const tier = num(f, "tier", w, { min: 1, max: 3, integer: true }) as 1 | 2 | 3;
    if (f.fixed !== undefined && typeof f.fixed !== "boolean") fail(w, "fixed", "必須是 true 或 false");
    return {
      id,
      title: str(f, "title", w),
      topic,
      source: str(f, "source", w),
      stance,
      era: str(f, "era", w),
      tier,
      ...(f.fixed === true ? { fixed: true } : {}),
      text: str(f, "text", w),
    };
  });
  uniqueIds(items, file);
  return { topics, stances, items };
}

/** 地圖簡介模板可用的欄位：名稱欄位，加上標記自己的名字、地域、所屬國與都城 */
const BLURB_TOKENS = ["name", "region", "country", "capital", ...SLOT_NAMES];

const NAME_MIN: Record<keyof WorldNames, number> = {
  countries: 10,
  capitals: 10,
  guards: 6,
  greatSects: 6,
  schools: 14,
  merchants: 6,
  wanderers: 6,
  villages: 10,
  markets: 10,
  mountains: 10,
};

export function validateWorldNames(raw: unknown, file = "worldNames.json"): WorldNames {
  const o = obj(raw, file);
  const out = {} as WorldNames;
  const seen = new Map<string, string>();
  for (const key of Object.keys(NAME_MIN) as (keyof WorldNames)[]) {
    const names = strList(o, key, file);
    if (names.length < NAME_MIN[key]) fail(file, key, `至少需要 ${NAME_MIN[key]} 個名字，目前只有 ${names.length} 個`);
    names.forEach((n, i) => {
      // 名字之間不可重複，同欄位內與不同欄位之間都一樣
      const prev = seen.get(n);
      if (prev !== undefined) fail(file, `${key}[${i}]`, `「${n}」與 ${prev} 重複`);
      seen.set(n, `${key}[${i}]`);
    });
    out[key] = names;
  }
  for (const k of Object.keys(o)) if (!(k in NAME_MIN)) fail(file, k, "不是合法的名庫欄位");
  return out;
}

function point(raw: unknown, where: string, field: string, box: [number, number]): Point {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every((n) => typeof n === "number" && Number.isFinite(n))) {
    fail(where, field, "必須是 [x, y] 兩個數字");
  }
  const [x, y] = raw as number[];
  if (x < 0 || y < 0 || x > box[0] || y > box[1]) fail(where, field, `座標 (${x}, ${y}) 超出畫布 ${box[0]}×${box[1]}`);
  return [x, y];
}

export function validateMap(raw: unknown, file = "map.json"): MapData {
  const o = obj(raw, file);
  const vb = list(o.viewBox, `${file} 欄位 viewBox`);
  if (vb.length !== 2 || !vb.every((n) => typeof n === "number" && n > 0)) fail(file, "viewBox", "必須是 [寬, 高] 兩個正數");
  const box = vb as [number, number];
  const palette = list(o.palette, `${file} 欄位 palette`).map((c, i) => {
    if (typeof c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c)) fail(file, `palette[${i}]`, "必須是 #rrggbb 色碼");
    return c as string;
  });
  if (palette.length < 6) fail(file, "palette", `至少需要 6 種顏色，目前 ${palette.length} 種`);
  const rules = obj(o.territoryRules, `${file} 欄位 territoryRules`);
  const territoryRules = {
    transitionYears: num(rules, "transitionYears", `${file} 欄位 territoryRules`, { min: 1, integer: true }),
    travelDelayMonths: num(rules, "travelDelayMonths", `${file} 欄位 territoryRules`, { min: 0, integer: true }),
    marketMultiplier: num(rules, "marketMultiplier", `${file} 欄位 territoryRules`, { min: 1 }),
    greatReach: num(rules, "greatReach", `${file} 欄位 territoryRules`, { gt: 0 }),
    schoolReach: num(rules, "schoolReach", `${file} 欄位 territoryRules`, { gt: 0 }),
    prosperReachMultiplier: num(rules, "prosperReachMultiplier", `${file} 欄位 territoryRules`, { min: 1 }),
    declineReachMultiplier: num(rules, "declineReachMultiplier", `${file} 欄位 territoryRules`, { min: 0, max: 1 }),
  };

  const regions = list(o.regions, `${file} 欄位 regions`).map((r, i): MapRegion => {
    const where = `${file} 第 ${i + 1} 筆地域`;
    const ro = obj(r, where);
    const id = str(ro, "id", where);
    const w = `${file} 地域 ${id}`;
    if (typeof ro.land !== "boolean") fail(w, "land", "必須是 true 或 false");
    const region: MapRegion = {
      id,
      name: str(ro, "name", w),
      land: ro.land,
      aura: str(ro, "aura", w),
      desc: str(ro, "desc", w),
      path: str(ro, "path", w),
      label: point(ro.label, w, "label", box),
    };
    if (ro.land) {
      region.capital = point(ro.capital, w, "capital", box);
      const territoryPoints = list(ro.territories, `${w} 欄位 territories`);
      if (territoryPoints.length < 3) fail(w, "territories", "至少需要 3 個領土中心");
      region.territories = territoryPoints.map((p, j) => point(p, w, `territories[${j}]`, box));
      const sites = list(ro.sites, `${w} 欄位 sites`);
      if (sites.length < 5) fail(w, "sites", `至少需要 5 個宗門位置，目前 ${sites.length} 個`);
      region.sites = sites.map((p, j) => point(p, w, `sites[${j}]`, box));
      region.ferries = list(ro.ferries, `${w} 欄位 ferries`).map((p, j) => point(p, w, `ferries[${j}]`, box));
      const b = obj(ro.birth, `${w} 欄位 birth`);
      region.birth = { village: point(b.village, w, "birth.village", box), mountain: point(b.mountain, w, "birth.mountain", box) };
    } else if (ro.ferries !== undefined || ro.sites !== undefined) {
      fail(w, "land", "非陸地的地域不能有 sites 或 ferries");
    }
    return region;
  });
  uniqueIds(regions, file);
  const lands = regions.filter((r) => r.land).map((r) => r.id);
  for (const need of ["north", "center"]) {
    if (!lands.includes(need)) fail(file, "regions", `必須有 id 為 ${need} 的陸地地域（守梯大宗與商行總號的所在）`);
  }
  if (lands.length < 3) fail(file, "regions", "至少需要 3 處陸地");
  if (regions.reduce((n, r) => n + (r.ferries?.length ?? 0), 0) < 1) fail(file, "ferries", "至少需要 1 處渡口");

  const adj = obj(o.adjacency, `${file} 欄位 adjacency`);
  const adjacency: Record<string, string[]> = {};
  for (const id of lands) {
    adjacency[id] = strList(adj, id, `${file} 欄位 adjacency`);
    for (const n of adjacency[id]) {
      if (!lands.includes(n)) fail(`${file} 欄位 adjacency`, id, `鄰接的 ${n} 不是陸地地域`);
    }
  }
  for (const id of lands) {
    for (const n of adjacency[id]) {
      if (!adjacency[n].includes(id)) fail(`${file} 欄位 adjacency`, id, `${id} 鄰接 ${n}，但 ${n} 沒有鄰接 ${id}`);
    }
  }
  const st = obj(o.stairs, `${file} 欄位 stairs`);
  const stairs = {
    x: num(st, "x", `${file} 欄位 stairs`, { min: 0 }),
    y: num(st, "y", `${file} 欄位 stairs`, { min: 0 }),
    text: str(st, "text", `${file} 欄位 stairs`),
  };

  const bo = obj(o.blurbs, `${file} 欄位 blurbs`);
  const bw = `${file} 欄位 blurbs`;
  const blurb = (v: unknown, key: string): string => {
    const text = typeof v === "string" && v !== "" ? v : fail(bw, key, "必須是非空字串");
    // 每則簡介不超過兩句，模板欄位必須認得
    if ((text.match(/[。！？]/g) ?? []).length > 2) fail(bw, key, `不可超過兩句，目前為「${text}」`);
    for (const m of text.matchAll(/\{([^}]*)\}/g)) {
      if (!BLURB_TOKENS.includes(m[1])) fail(bw, key, `出現不認得的欄位 {${m[1]}}，可用：${BLURB_TOKENS.map((t) => `{${t}}`).join("、")}`);
    }
    return text;
  };
  const group = (key: string, names: string[]): Record<string, string> => {
    const g = obj(bo[key], `${bw}.${key}`);
    return Object.fromEntries(names.map((n) => [n, blurb(g[n], `${key}.${n}`)]));
  };
  const blurbs = {
    sect: group("sect", ["guard", "great", "school"]),
    state: group("state", [...SECT_STATES]),
    polity: blurb(bo.polity, "polity"),
    tribal: blurb(bo.tribal, "tribal"),
    ferry: blurb(bo.ferry, "ferry"),
    ferryBroken: blurb(bo.ferryBroken, "ferryBroken"),
    merchantHq: blurb(bo.merchantHq, "merchantHq"),
    merchantBranch: blurb(bo.merchantBranch, "merchantBranch"),
    village: blurb(bo.village, "village"),
    market: blurb(bo.market, "market"),
    mountain: blurb(bo.mountain, "mountain"),
  } as MapData["blurbs"];
  return { viewBox: box, palette, territoryRules, regions, adjacency, stairs, blurbs };
}

/** 世局候選池各種類允許的目標、欄位與模板欄位 */
const WORLD_EVENT_RULES: Record<WorldEventKind, { targets: string[]; tokens: string[]; to?: string[] }> = {
  merchant: { targets: ["merchant"], tokens: ["target", "region"], to: ["expand"] },
  sectState: { targets: ["guard", "greatSect0", "greatSect1", "school"], tokens: ["target"], to: [...SECT_STATES] },
  sectRank: { targets: ["greatSect0", "greatSect1", "school"], tokens: ["target"], to: ["great", "school"] },
  sectNew: { targets: ["none"], tokens: ["target", "region"] },
  merge: { targets: ["country"], tokens: ["target", "other"] },
  split: { targets: ["country"], tokens: ["target", "new"] },
  owner: { targets: ["country"], tokens: ["target", "other"] },
  polityNew: { targets: ["tribal"], tokens: ["target"] },
  rename: { targets: ["country"], tokens: ["old", "new"] },
  capital: { targets: ["country"], tokens: ["target", "new"] },
  ferry: { targets: ["ferry"], tokens: ["region"], to: ["broken", "rebuilt"] },
};

/** 世局條件的格式檢查，世局效果與安排提示共用 */
function validateWhen(raw: unknown, where: string): WorldWhen {
  const wo = obj(raw, `${where} 欄位 when`);
  const when: WorldWhen = {};
  if (wo.guardState !== undefined) {
    const states = strList(wo, "guardState", `${where} 欄位 when`);
    for (const s of states) {
      if (!(SECT_STATES as readonly string[]).includes(s)) fail(where, "when.guardState", `${s} 不是合法的宗門狀態`);
    }
    when.guardState = states as SectState[];
  }
  if (wo.merchantBranchesMin !== undefined) when.merchantBranchesMin = num(wo, "merchantBranchesMin", `${where} 欄位 when`, { min: 1, integer: true });
  if (wo.ferriesBrokenMin !== undefined) when.ferriesBrokenMin = num(wo, "ferriesBrokenMin", `${where} 欄位 when`, { min: 1, integer: true });
  if (Object.keys(when).length === 0) fail(where, "when", "至少要有一個條件");
  return when;
}

export function validateWorldEffects(raw: unknown, file = "worldEffects.json"): WorldEffectDef[] {
  const ids = new Set<string>();
  return list(raw, file).map((r, i): WorldEffectDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    if (ids.has(id)) fail(w, "id", "重複");
    ids.add(id);
    const when = validateWhen(o.when, w);
    const mo = obj(o.market, `${w} 欄位 market`);
    const market: Record<string, number> = {};
    for (const k of Object.keys(mo)) market[k] = num(mo, k, `${w} 欄位 market`, { gt: 0 });
    if (Object.keys(market).length === 0) fail(w, "market", "至少要有一個物品");
    if (o.mapRef !== undefined && !(MAP_REFS as readonly string[]).includes(str(o, "mapRef", w))) {
      fail(w, "mapRef", `必須是 ${MAP_REFS.join("、")} 之一，目前為 ${String(o.mapRef)}`);
    }
    return { id, when, market, reason: str(o, "reason", w), ...(o.mapRef !== undefined ? { mapRef: o.mapRef as MapRef } : {}) };
  });
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
    };
  });
  uniqueIds(goals, file);
  if (goals.length === 0) fail(file, "（根）", "不可為空");
  return goals;
}

export function validateWorldEvents(raw: unknown, file = "worldEvents.json"): WorldEventDef[] {
  const events = list(raw, file).map((r, i): WorldEventDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const o = obj(r, where);
    const id = str(o, "id", where);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const kind = str(o, "kind", w);
    if (!(WORLD_EVENT_KINDS as readonly string[]).includes(kind)) {
      fail(w, "kind", `必須是 ${WORLD_EVENT_KINDS.join("、")} 之一，目前為 ${kind}`);
    }
    const rule = WORLD_EVENT_RULES[kind as WorldEventKind];
    const target = str(o, "target", w);
    if (!rule.targets.includes(target)) fail(w, "target", `${kind} 的目標必須是 ${rule.targets.join("、")} 之一，目前為 ${target}`);
    const ev: WorldEventDef = {
      id,
      kind: kind as WorldEventKind,
      target,
      ageMin: num(o, "ageMin", w, { min: 0 }),
      ageMax: num(o, "ageMax", w, { min: 0 }),
      weight: num(o, "weight", w, { gt: 0 }),
      group: str(o, "group", w),
      note: str(o, "note", w),
    };
    if (ev.ageMax < ev.ageMin) fail(w, "ageMax", `不可小於 ageMin（${ev.ageMin}），目前為 ${ev.ageMax}`);
    if (rule.to) {
      const to = str(o, "to", w);
      if (!rule.to.includes(to)) fail(w, "to", `${kind} 的 to 必須是 ${rule.to.join("、")} 之一，目前為 ${to}`);
      ev.to = to;
    } else if (o.to !== undefined) fail(w, "to", `${kind} 不需要 to`);
    if (o.from !== undefined) {
      if (kind !== "sectState" && kind !== "sectRank") fail(w, "from", `${kind} 不需要 from`);
      const from = strList(o, "from", w);
      for (const s of from) {
        if (!(SECT_STATES as readonly string[]).includes(s)) fail(w, "from", `${s} 不是合法的宗門狀態`);
      }
      ev.from = from;
    }
    for (const m of ev.note.matchAll(/\{([^}]*)\}/g)) {
      if (!rule.tokens.includes(m[1])) {
        fail(w, "note", `${kind} 的模板只能用 ${rule.tokens.map((t) => `{${t}}`).join("、")}，出現了 {${m[1]}}`);
      }
    }
    if (!ev.note.includes("{")) fail(w, "note", "至少要有一個名稱欄位，否則看不出是誰的事");
    return ev;
  });
  uniqueIds(events, file);
  return events;
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

export function validateNames(raw: unknown, file = "names.json"): NameData {
  const o = obj(raw, file);
  return { surnames: strList(o, "surnames", file), given: strList(o, "given", file) };
}

function parseReview(raw: unknown, where: string): TextData["review"] {
  const o = obj(raw, where);
  const out = {} as TextData["review"];
  for (const cause of REVIEW_CAUSES) {
    const variants = list(o[cause], `${where}.${cause}`).map((v, i): ClosingVariant => {
      const vw = `${where}.${cause}[${i}]`;
      const vo = obj(v, vw);
      return {
        text: str(vo, "text", vw),
        ...(vo.ifItem !== undefined ? { ifItem: str(vo, "ifItem", vw) } : {}),
      };
    });
    // 至少要有一句不限物品的，否則可能沒有句子可用
    if (!variants.some((v) => v.ifItem === undefined)) {
      throw new Error(`${where}.${cause}：至少要有一句沒有 ifItem 的收尾句`);
    }
    out[cause] = variants;
  }
  return out;
}

/** 遞迴掃過資料裡的每個字串 */
function scanStrings(value: unknown, path: string, visit: (text: string, path: string) => void): void {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, visit));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) scanStrings(v, path === "" ? k : `${path}.${k}`, visit);
  }
}

/**
 * 玩家看得到的文字不得寫死參考名（太衡宗等），一律用名稱欄位。
 * 事件與殘卷可以用欄位，其餘資料檔連欄位都不該用。錯誤訊息指出是哪一筆的哪個欄位。
 */
function checkSlotRules(data: GameData): void {
  const check = (where: string, value: unknown, allowSlots: boolean): void => {
    scanStrings(value, "", (text, path) => {
      const problems = slotProblems(text, allowSlots);
      if (problems.length > 0) throw new Error(`${where}：欄位 ${path} ${problems[0]}`);
    });
  };
  data.events.forEach((e, i) => check(`events.json 第 ${i + 1} 筆（${e.id}）`, e, true));
  data.fragments.items.forEach((f, i) => check(`fragments.json 第 ${i + 1} 筆（${f.id}）`, f, true));
  check("fragments.json 欄位 stances", data.fragments.stances, true);
  check("fragments.json 欄位 topics", data.fragments.topics, true);
  data.items.forEach((x, i) => check(`items.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.schedules.forEach((x, i) => {
    const { worldHints, ...rest } = x;
    check(`schedules.json 第 ${i + 1} 筆（${x.id}）`, rest, false);
    check(`schedules.json 第 ${i + 1} 筆（${x.id}）`, { worldHints: (worldHints ?? []).map((h) => h.text) }, true);
  });
  data.origins.forEach((x, i) => check(`origins.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.talents.forEach((x, i) => check(`talents.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.spiritRoots.forEach((x, i) => check(`spiritRoots.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.realms.forEach((x, i) => check(`realms.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.goals.forEach((x, i) => check(`goals.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.worldEffects.forEach((x, i) => check(`worldEffects.json 第 ${i + 1} 筆（${x.id}）`, { reason: x.reason }, true));
  data.worldEvents.forEach((x, i) => check(`worldEvents.json 第 ${i + 1} 筆（${x.id}）`, { note: x.note.replace(SLOT_PATTERN_FOR_NOTE, "") }, false));
  check("map.json", data.map, false);
  // text.json 的日誌模板用自己的 {realm}、{item} 等，只檢查參考名
  check("text.json", data.text, false);
}

/** 檢查各檔案之間的對應關係 */
export function validateGameData(data: GameData): GameData {
  checkSlotRules(data);
  const realmIds = new Set(data.realms.map((r) => r.id));
  const itemIds = new Set(data.items.map((i) => i.id));
  const has = (set: Set<string>, id: string, from: string, what: string) => {
    if (!set.has(id)) throw new Error(`${from}：${id} 不是 ${what} 裡的 id`);
  };
  for (const k of Object.keys(data.text.log.realmUp)) has(realmIds, k, "text.json 的 log.realmUp", "realms.json");
  for (const k of Object.keys(data.text.log.breakthroughSuccess)) {
    has(realmIds, k, "text.json 的 log.breakthroughSuccess", "realms.json");
  }
  data.realms.forEach((realm, i) => {
    const where = `realms.json 第 ${i + 1} 筆（${realm.id}）`;
    const isLast = i === data.realms.length - 1;
    if (realm.breakthrough === "manual" && !isLast) {
      if (!realm.breakthroughRule) throw new Error(`${where}：欄位 breakthroughRule 手動突破的境界必須提供`);
      const next = data.realms[i + 1];
      if (!data.text.log.breakthroughSuccess[next.id]) {
        throw new Error(`text.json：log.breakthroughSuccess 缺少突破後境界 ${next.id} 的文字`);
      }
    }
    if (realm.breakthroughRule?.pillId) has(itemIds, realm.breakthroughRule.pillId, `${where} 的 pillId`, "items.json");
    const rule = realm.breakthroughRule;
    for (const [key, ref] of [["requiresTalent", rule?.requiresTalent], ["talentRate", rule?.talentRate]] as const) {
      if (!ref) continue;
      const talent = data.talents.find((x) => x.id === ref.id);
      if (!talent) throw new Error(`${where} 的 breakthroughRule.${key}：${ref.id} 不是 talents.json 裡的 id`);
      const level = "level" in ref ? ref.level : ref.from;
      if (level > talent.maxLevel) {
        throw new Error(`${where} 的 breakthroughRule.${key}：${ref.id} 的等級 ${level} 超過天賦上限 ${talent.maxLevel}`);
      }
    }
  });
  // 宗門（M25）：引用的境界、靈根、物品、日常安排都要存在
  const sj = data.sects;
  has(realmIds, sj.join.minRealm, "sects.json 的 join.minRealm", "realms.json");
  for (const r of sj.ranks) if (r.promote) has(realmIds, r.promote.realm, `sects.json 的 ranks ${r.id} 的 promote.realm`, "realms.json");
  const rootIds = new Set(data.spiritRoots.map((r) => r.id));
  for (const id of Object.keys(sj.join.rootBonus)) has(rootIds, id, "sects.json 的 join.rootBonus", "spiritRoots.json");
  for (const id of sj.discount.itemIds) has(itemIds, id, "sects.json 的 discount.itemIds", "items.json");
  const originIds = new Set(data.origins.map((o) => o.id));
  const effectIds = new Set(data.worldEffects.map((x) => x.id));
  has(itemIds, data.config.priceRefItemId, "config.json 的 priceRefItemId", "items.json");
  data.worldEffects.forEach((x, i) => {
    for (const id of Object.keys(x.market)) has(itemIds, id, `worldEffects.json 第 ${i + 1} 筆（${x.id}）的 market`, "items.json");
  });
  data.events.forEach((ev) => {
    for (const id of [...(ev.conditions.world ?? []), ...(ev.conditions.worldNot ?? [])]) {
      has(effectIds, id, `events.json ${ev.id} 的 conditions.world`, "worldEffects.json");
    }
  });
  data.schedules.forEach((s, i) => {
    if (s.realmMin !== undefined) has(realmIds, s.realmMin, `schedules.json 第 ${i + 1} 筆（${s.id}）的 realmMin`, "realms.json");
    for (const f of s.finds) has(itemIds, f.itemId, `schedules.json 第 ${i + 1} 筆（${s.id}）的 finds`, "items.json");
    for (const f of s.drops ?? []) {
      has(itemIds, f.itemId, `schedules.json 第 ${i + 1} 筆（${s.id}）的 drops`, "items.json");
      if (data.items.find((x) => x.id === f.itemId)?.effect.kind !== "material") {
        throw new Error(`schedules.json 第 ${i + 1} 筆（${s.id}）的 drops：${f.itemId} 不是材料`);
      }
    }
  });
  data.recipes.recipes.forEach((rc, i) => {
    const where = `recipes.json 第 ${i + 1} 筆（${rc.id}）`;
    has(itemIds, rc.output, `${where} 的 output`, "items.json");
    has(realmIds, rc.realmMin, `${where} 的 realmMin`, "realms.json");
    const outKind = data.items.find((x) => x.id === rc.output)?.effect.kind;
    if (outKind === "material") throw new Error(`${where} 的 output：${rc.output} 是材料，不能是產出`);
    if ((rc.kind === "forge") !== (outKind === "artifact")) throw new Error(`${where} 的 output：煉器（forge）只能產出法寶，煉丹（brew）不能產出法寶`);
    for (const id of Object.keys(rc.inputs)) {
      has(itemIds, id, `${where} 的 inputs`, "items.json");
      if (data.items.find((x) => x.id === id)?.effect.kind !== "material") throw new Error(`${where} 的 inputs：${id} 不是材料`);
    }
  });
  if (!data.schedules.some((s) => s.id === ALCHEMY_SCHEDULE)) throw new Error(`schedules.json：缺少煉丹用的日常安排 ${ALCHEMY_SCHEDULE}`);
  data.origins.forEach((o, i) => {
    for (const id of Object.keys(o.items)) has(itemIds, id, `origins.json 第 ${i + 1} 筆（${o.id}）的 items`, "items.json");
  });

  for (const cause of REVIEW_CAUSES) {
    for (const v of data.text.review[cause]) {
      if (v.ifItem !== undefined) has(itemIds, v.ifItem, `text.json 的 review.${cause}`, "items.json");
    }
  }

  const scheduleIds = new Set(data.schedules.map((s) => s.id));
  const fragmentIds = new Set(data.fragments.items.map((f) => f.id));
  const allEffects = (ev: EventDef): Effects[] => [
    ...(ev.effects ? [ev.effects] : []),
    ...(ev.choices ?? []).flatMap((c) => c.outcomes.map((o) => o.effects)),
  ];
  // 由程式設定的旗標（不經事件效果）：宗門閉山或覆滅時自動離宗（core/sect.ts 的 leaveSect）
  const systemFlags = ["sect_collapse"];
  const setFlags = new Set([...systemFlags, ...data.events.flatMap((ev) => allEffects(ev).flatMap((e) => e.flags ?? []))]);
  data.events.forEach((ev, i) => {
    const from = `events.json 第 ${i + 1} 筆（${ev.id}）`;
    const c = ev.conditions;
    for (const r of [c.realmMin, c.realmMax]) if (r !== undefined) has(realmIds, r, `${from} 的 conditions`, "realms.json");
    for (const s of c.schedules ?? []) has(scheduleIds, s, `${from} 的 conditions.schedules`, "schedules.json");
    for (const id of c.origins ?? []) has(originIds, id, `${from} 的 conditions.origins`, "origins.json");
    for (const id of c.roots ?? []) has(rootIds, id, `${from} 的 conditions.roots`, "spiritRoots.json");
    for (const s of Object.keys(ev.scheduleWeights ?? {})) has(scheduleIds, s, `${from} 的 scheduleWeights`, "schedules.json");
    // 要求的旗標必須有某個結果會設定，抓拼字錯誤
    for (const f of c.flags ?? []) {
      if (!setFlags.has(f)) throw new Error(`${from}：conditions.flags 的 ${f} 沒有任何事件結果會設定它`);
    }
    for (const e of allEffects(ev)) {
      for (const id of Object.keys(e.items ?? {})) has(itemIds, id, `${from} 的 effects.items`, "items.json");
      if (e.fragment && "id" in e.fragment) has(fragmentIds, e.fragment.id, `${from} 的 effects.fragment`, "fragments.json");
    }
    for (const ch of ev.choices ?? []) {
      for (const id of Object.keys(ch.requires?.items ?? {})) has(itemIds, id, `${from} 的 requires.items`, "items.json");
      for (const id of ch.requires?.fragments ?? []) has(fragmentIds, id, `${from} 的 requires.fragments`, "fragments.json");
    }
  });
  data.goals.forEach((g, i) => {
    const w = `goals.json 第 ${i + 1} 筆（${g.id}）`;
    const c = g.condition;
    if (c.kind === "realm") {
      has(realmIds, c.realmId, `${w} 的 condition`, "realms.json");
      const realm = data.realms.find((r) => r.id === c.realmId)!;
      if (c.stage !== undefined && c.stage >= realm.stageNames.length) throw new Error(`${w}：condition.stage ${c.stage} 超出 ${realm.name} 的階段數`);
    }
    if (c.kind === "flag" && !setFlags.has(c.flagId)) throw new Error(`${w}：condition.flagId ${c.flagId} 沒有任何事件結果會設定它`);
  });
  for (const k of Object.keys(data.text.log.stageMilestone)) {
    const [rid, st] = k.split(":");
    const realm = data.realms.find((r) => r.id === rid);
    if (!realm || !/^\d+$/.test(st ?? "") || Number(st) >= realm.stageNames.length) {
      throw new Error(`text.json：log.stageMilestone 的鍵 ${k} 必須是「境界 id:階段索引」且存在於 realms.json`);
    }
  }
  for (const r of sj.ranks.slice(1)) {
    if (!data.text.log.sect.promote[r.id]) throw new Error(`text.json：log.sect.promote 缺少位階 ${r.id} 的文字`);
  }
  for (const k of Object.keys(data.text.log.sect.promote)) {
    if (!sj.ranks.some((r) => r.id === k)) throw new Error(`text.json：log.sect.promote 的 ${k} 不是 sects.json 裡的位階 id`);
  }
  const duty = data.schedules.find((s) => s.id === sj.dutySchedule);
  if (!duty) throw new Error(`sects.json：dutySchedule ${sj.dutySchedule} 不是 schedules.json 裡的 id`);
  if (!duty.requiresSect) throw new Error(`schedules.json（${duty.id}）：宗門差事必須設定 requiresSect`);
  // 同門名稱欄位只能出現在宗門事件，否則沒入宗時只會顯示通用稱呼
  data.events.forEach((ev, i) => {
    const text = JSON.stringify([ev.title, ev.text, ev.choices, ev.effects]);
    if (/\{(peer|steward|elder)\}/.test(text) && ev.conditions.sect !== true) {
      throw new Error(`events 第 ${i + 1} 筆（${ev.id}）：用了同門名稱欄位 {peer}、{steward}、{elder}，conditions.sect 必須是 true`);
    }
  });
  return data;
}
