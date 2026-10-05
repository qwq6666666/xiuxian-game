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
  type OriginDef,
  type RealmDef,
  type ScheduleDef,
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
    fail(`${file} 第 ${realms.length} 筆（${last.id}）`, "endsLife", `最後一個境界必須是 "always"，目前為 ${JSON.stringify(last.endsLife)}`);
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
    if (!Array.isArray(o.finds)) fail(where, "finds", "必須是陣列");
    const finds = o.finds.map((f, j) => {
      const fw = `${where} 欄位 finds[${j}]`;
      const fo = obj(f, fw);
      const c = num(fo, "chance", fw, { min: 0 });
      if (c > 1) fail(fw, "chance", `必須 ≤ 1，目前為 ${c}`);
      return { itemId: str(fo, "itemId", fw), chance: c };
    });
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
      deathChance,
      ...(o.realmMin !== undefined ? { realmMin: str(o, "realmMin", where) } : {}),
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
    } else {
      return fail(ew, "kind", `必須是 cultivationFraction、lifespan 或 breakthrough，目前為 ${JSON.stringify(kind)}`);
    }
    return {
      id,
      name: str(o, "name", where),
      desc: str(o, "desc", where),
      price: num(o, "price", where, { gt: 0, integer: true }),
      effect,
    };
  });
  uniqueIds(items, file);
  return items;
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
    if (!["cultivation", "spiritStones", "lifespan", "attributes", "items", "flags", "death", "fragment"].includes(k)) {
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
  if (o.bottleneck !== undefined) {
    if (typeof o.bottleneck !== "boolean") fail(where, "bottleneck", "必須是 true 或 false");
    c.bottleneck = o.bottleneck;
  }
  if (o.fragmentAvailable !== undefined) {
    c.fragmentAvailable = num(o, "fragmentAvailable", where, { min: 1, max: 3, integer: true });
  }
  for (const k of Object.keys(c) as (keyof EventConditions)[]) if (c[k] === undefined) delete c[k];
  for (const k of Object.keys(o)) {
    if (!["realmMin", "realmMax", "ageMin", "ageMax", "flags", "flagsNot", "schedules", "bottleneck", "fragmentAvailable", "world", "worldNot"].includes(k)) {
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
      effect !== "breakthroughAid"
    ) {
      fail(where, "effect", `必須是 cultivation、rerolls、fortune、stoneCarry、failLoss 或 breakthroughAid，目前為 ${JSON.stringify(effect)}`);
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
  return { viewBox: box, palette, regions, adjacency, stairs, blurbs };
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
  });
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
  const setFlags = new Set(data.events.flatMap((ev) => allEffects(ev).flatMap((e) => e.flags ?? [])));
  data.events.forEach((ev, i) => {
    const from = `events.json 第 ${i + 1} 筆（${ev.id}）`;
    const c = ev.conditions;
    for (const r of [c.realmMin, c.realmMax]) if (r !== undefined) has(realmIds, r, `${from} 的 conditions`, "realms.json");
    for (const s of c.schedules ?? []) has(scheduleIds, s, `${from} 的 conditions.schedules`, "schedules.json");
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
  return data;
}
