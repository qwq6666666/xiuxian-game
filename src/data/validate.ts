import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type BreakthroughRule,
  type ChoiceDef,
  type Effects,
  type EventConditions,
  type EventDef,
  type GameConfig,
  type GameData,
  type ItemDef,
  type ItemEffect,
  type OriginDef,
  type RealmDef,
  type ScheduleDef,
  type SpiritRootDef,
  type TextData,
} from "./types";

type Obj = Record<string, unknown>;

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
    eventIntervalMin: eventMin,
    eventIntervalMax: num(o, "eventIntervalMax", file, { min: eventMin, integer: true }),
    fortuneGoodWeight: num(o, "fortuneGoodWeight", file, { min: 0 }),
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
      ...(breakthroughRule ? { breakthroughRule } : {}),
    };
  });
  uniqueIds(realms, file);
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
      effect = { kind, value: num(e, "value", ew, { gt: 0 }) };
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
  for (const k of Object.keys(o)) {
    if (!["cultivation", "spiritStones", "lifespan", "attributes", "items", "flags", "death"].includes(k)) {
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
  if (o.bottleneck !== undefined) {
    if (typeof o.bottleneck !== "boolean") fail(where, "bottleneck", "必須是 true 或 false");
    c.bottleneck = o.bottleneck;
  }
  for (const k of Object.keys(c) as (keyof EventConditions)[]) if (c[k] === undefined) delete c[k];
  for (const k of Object.keys(o)) {
    if (!["realmMin", "realmMax", "ageMin", "ageMax", "flags", "flagsNot", "schedules", "bottleneck"].includes(k)) {
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
      if (choices.length < 2 || choices.length > 3) fail(where, "choices", `必須有 2–3 個選項，目前為 ${choices.length}`);
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
  const strRecord = (key: string): Record<string, string> => {
    const raw = obj(log[key], `${where}.${key}`);
    const out: Record<string, string> = {};
    for (const k of Object.keys(raw)) out[k] = str(raw, k, `${where}.${key}`);
    return out;
  };
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
    },
    cleared: str(o, "cleared", file),
  };
}

/** 檢查各檔案之間的對應關係 */
export function validateGameData(data: GameData): GameData {
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
  });
  data.schedules.forEach((s, i) => {
    for (const f of s.finds) has(itemIds, f.itemId, `schedules.json 第 ${i + 1} 筆（${s.id}）的 finds`, "items.json");
  });
  data.origins.forEach((o, i) => {
    for (const id of Object.keys(o.items)) has(itemIds, id, `origins.json 第 ${i + 1} 筆（${o.id}）的 items`, "items.json");
  });

  const scheduleIds = new Set(data.schedules.map((s) => s.id));
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
    }
    for (const ch of ev.choices ?? []) {
      for (const id of Object.keys(ch.requires?.items ?? {})) has(itemIds, id, `${from} 的 requires.items`, "items.json");
    }
  });
  return data;
}
