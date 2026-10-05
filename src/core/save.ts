import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { createInitialState } from "./life";
import { SAVE_VERSION, type Attributes, type GameState, type LogEntry, type Phase } from "./state";

type Obj = Record<string, unknown>;

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 舊版存檔遷移。key 是來源版本，函式把它升到下一版。 */
const migrations: Record<number, (data: Obj, gd: GameData) => Obj> = {
  // v1 只有年齡，沒有角色資料：保留亂數種子與速度，重新開局擲骰
  1: (d, gd) => ({
    ...createInitialState(Number(d.rngSeed) || 0, gd),
    speed: typeof d.speed === "number" ? d.speed : 1,
  }),
};

function fail(field: string, msg: string): never {
  throw new Error(`存檔：欄位 ${field} ${msg}`);
}

function num(o: Obj, key: string, opts: { integer?: boolean; min?: number } = {}, path = key): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, `必須是數字，目前為 ${JSON.stringify(v)}`);
  if (opts.integer && !Number.isInteger(v)) fail(path, `必須是整數，目前為 ${v}`);
  if (opts.min !== undefined && v < opts.min) fail(path, `必須 ≥ ${opts.min}，目前為 ${v}`);
  return v;
}

function str(o: Obj, key: string, path = key): string {
  const v = o[key];
  if (typeof v !== "string") fail(path, `必須是字串，目前為 ${JSON.stringify(v)}`);
  return v;
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "必須是物件");
  return v as Obj;
}

/** 讀取存檔，格式錯誤時丟出指出欄位的錯誤 */
export function deserialize(text: string, data: GameData = gameData): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("存檔：內容不是合法的 JSON");
  }
  let o = obj(raw, "（根）");
  let version = num(o, "version", { integer: true });
  if (version > SAVE_VERSION) {
    throw new Error(`存檔：版本 ${version} 比遊戲支援的 ${SAVE_VERSION} 新`);
  }
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`存檔：找不到版本 ${version} 的遷移函式`);
    o = migrate(o, data);
    version = num(o, "version", { integer: true });
  }

  const phase = str(o, "phase");
  if (phase !== "rolling" && phase !== "living" && phase !== "dead") {
    fail("phase", `必須是 rolling、living 或 dead，目前為 ${JSON.stringify(phase)}`);
  }

  const attrRaw = obj(o.attributes, "attributes");
  const attributes = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) attributes[k] = num(attrRaw, k, { integer: true }, `attributes.${k}`);

  const realmId = str(o, "realmId");
  const realm = data.realms.find((r) => r.id === realmId);
  if (!realm) fail("realmId", `找不到境界 ${realmId}`);
  const stage = num(o, "stage", { integer: true, min: 0 });
  if (stage >= realm.stageNames.length) fail("stage", `超出 ${realm.name} 的階段數，目前為 ${stage}`);

  const spiritRootId = str(o, "spiritRootId");
  if (!data.spiritRoots.some((r) => r.id === spiritRootId)) fail("spiritRootId", `找不到靈根 ${spiritRootId}`);
  const originId = str(o, "originId");
  if (!data.origins.some((r) => r.id === originId)) fail("originId", `找不到出身 ${originId}`);

  const itemsRaw = obj(o.items, "items");
  const items: Record<string, number> = {};
  for (const k of Object.keys(itemsRaw)) items[k] = num(itemsRaw, k, { integer: true, min: 0 }, `items.${k}`);

  if (!Array.isArray(o.log)) fail("log", "必須是陣列");
  const log = o.log.map((e, i): LogEntry => {
    const p = `log[${i}]`;
    const eo = obj(e, p);
    const kind = str(eo, "kind", `${p}.kind`);
    if (kind !== "stageUp" && kind !== "realmUp" && kind !== "bottleneck" && kind !== "death") {
      fail(`${p}.kind`, `不是合法的日誌類型：${kind}`);
    }
    return {
      month: num(eo, "month", { integer: true, min: 0 }, `${p}.month`),
      kind,
      realmId: str(eo, "realmId", `${p}.realmId`),
      stage: num(eo, "stage", { integer: true, min: 0 }, `${p}.stage`),
    };
  });

  return {
    version,
    rngSeed: num(o, "rngSeed", { integer: true }),
    speed: num(o, "speed", { min: 0 }),
    phase: phase as Phase,
    ageMonths: num(o, "ageMonths", { integer: true, min: 0 }),
    rerolls: num(o, "rerolls", { integer: true, min: 0 }),
    attributes,
    spiritRootId,
    originId,
    cultivationBonus: num(o, "cultivationBonus", { min: 0 }),
    spiritStones: num(o, "spiritStones", { integer: true, min: 0 }),
    items,
    realmId,
    stage,
    cultivation: num(o, "cultivation", { min: 0 }),
    log,
  };
}
