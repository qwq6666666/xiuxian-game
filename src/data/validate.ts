import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type BreakthroughRule,
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
  return data;
}
