import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type GameConfig,
  type GameData,
  type OriginDef,
  type RealmDef,
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
    };
  });
  uniqueIds(realms, file);
  return realms;
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
  const realmUpRaw = obj(log.realmUp, `${where}.realmUp`);
  const realmUp: Record<string, string> = {};
  for (const k of Object.keys(realmUpRaw)) realmUp[k] = str(realmUpRaw, k, `${where}.realmUp`);
  return {
    log: {
      stageUp: strList(log, "stageUp", where),
      realmUp,
      bottleneck: str(log, "bottleneck", where),
      death: str(log, "death", where),
    },
  };
}

/** 檢查各檔案之間的對應關係 */
export function validateGameData(data: GameData): GameData {
  const realmIds = new Set(data.realms.map((r) => r.id));
  for (const k of Object.keys(data.text.log.realmUp)) {
    if (!realmIds.has(k)) throw new Error(`text.json：log.realmUp 的 ${k} 不是 realms.json 裡的境界 id`);
  }
  return data;
}
