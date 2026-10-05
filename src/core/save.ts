import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, REVIEW_CAUSES, type GameData, type ReviewCause } from "../data/types";
import { createInitialState } from "./life";
import { deriveSeed, nextInt } from "./rng";
import {
  emptyMeta,
  LOG_KINDS,
  OFFLINE_STOPS,
  SAVE_VERSION,
  type Attributes,
  type Changes,
  type GameState,
  type LifeReview,
  type LogEntry,
  type LogKind,
  type OfflineStop,
  type Meta,
  type Phase,
} from "./state";

type Obj = Record<string, unknown>;

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 匯入玩家貼上的存檔文字：容忍頭尾空白與換行，格式錯誤時丟出指出欄位的錯誤 */
export function importSave(text: string, data: GameData = gameData): GameState {
  return deserialize(text.replace(/^﻿/, "").trim(), data);
}

/** 舊版存檔遷移。key 是來源版本，函式把它升到下一版。 */
const migrations: Record<number, (data: Obj, gd: GameData) => Obj> = {
  // v1 只有年齡，沒有角色資料：保留亂數種子與速度，重新開局擲骰
  1: (d, gd) => ({
    ...createInitialState(Number(d.rngSeed) || 0, gd),
    speed: typeof d.speed === "number" ? d.speed : 1,
  }),
  // v2 沒有日常安排、丹藥使用紀錄與突破次數：補上預設值
  2: (d, gd) => ({
    ...d,
    version: 3,
    schedule: gd.schedules[0].id,
    itemsUsed: {},
    lifespanBonus: 0,
    breakthroughs: 0,
  }),
  // v3 沒有事件系統：補上事件計時（門檻取區間中點，不動亂數）與空的旗標
  3: (d, gd) => ({
    ...d,
    version: 4,
    flags: [],
    eventCounts: {},
    eventClock: 0,
    eventThreshold: Math.round((gd.config.eventIntervalMin + gd.config.eventIntervalMax) / 2),
    pendingEvent: null,
    autoChoice: false,
  }),
  // v4 沒有輪迴：補上空的跨世資料。停在死亡畫面的舊存檔沒有回顧，只能直接轉世。
  4: (d) => ({
    ...d,
    version: 5,
    carriedStones: 0,
    meta: emptyMeta(),
    review: null,
  }),
  // v5 沒有姓名：用既有的亂數種子抽一個，不動存檔裡的種子
  5: (d, gd) => {
    const [si, s1] = nextInt(Number(d.rngSeed) >>> 0, 0, gd.names.surnames.length - 1);
    const [gi] = nextInt(s1, 0, gd.names.given.length - 1);
    return { ...d, version: 6, name: gd.names.surnames[si] + gd.names.given[gi], nameCustom: false };
  },
  // v6 沒有殘卷：跨世資料補上空清單
  6: (d) => ({ ...d, version: 7, meta: { ...obj(d.meta, "meta"), fragments: [] } }),
  // v7 沒有世界：用既有的亂數種子雜湊出世界種子，不動存檔裡的種子
  7: (d) => ({ ...d, version: 8, worldSeed: deriveSeed(Number(d.rngSeed) >>> 0, 1) }),
  // v8 沒有通關收藏：補上空的紀錄（舊存檔沒記下過去通關的出身，無從回推）
  8: (d) => ({ ...d, version: 9, meta: { ...obj(d.meta, "meta"), clears: {} } }),
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

function intRecord(o: Obj, key: string, path = key): Record<string, number> {
  const raw = obj(o[key], path);
  const out: Record<string, number> = {};
  for (const k of Object.keys(raw)) out[k] = num(raw, k, { integer: true, min: 0 }, `${path}.${k}`);
  return out;
}

function parseChanges(v: unknown, path: string): Changes {
  const o = obj(v, path);
  const c: Changes = {};
  for (const k of ["cultivation", "spiritStones", "lifespan"] as const) {
    if (o[k] !== undefined) c[k] = num(o, k, {}, `${path}.${k}`);
  }
  if (o.fragment !== undefined) c.fragment = str(o, "fragment", `${path}.fragment`);
  if (o.attributes !== undefined) {
    const a = obj(o.attributes, `${path}.attributes`);
    c.attributes = {};
    for (const k of ATTRIBUTE_KEYS) {
      if (a[k] !== undefined) c.attributes[k] = num(a, k, { integer: true }, `${path}.attributes.${k}`);
    }
  }
  if (o.items !== undefined) {
    const it = obj(o.items, `${path}.items`);
    c.items = {};
    for (const k of Object.keys(it)) c.items[k] = num(it, k, { integer: true }, `${path}.items.${k}`);
  }
  return c;
}

function parseLogEntry(e: unknown, p: string, data: GameData): LogEntry {
  const eo = obj(e, p);
  const kind = str(eo, "kind", `${p}.kind`);
  if (!(LOG_KINDS as readonly string[]).includes(kind)) fail(`${p}.kind`, `不是合法的日誌類型：${kind}`);
  const entry: LogEntry = {
    month: num(eo, "month", { integer: true, min: 0 }, `${p}.month`),
    kind: kind as LogKind,
    realmId: str(eo, "realmId", `${p}.realmId`),
    stage: num(eo, "stage", { integer: true, min: 0 }, `${p}.stage`),
  };
  if (eo.itemId !== undefined) entry.itemId = str(eo, "itemId", `${p}.itemId`);
  if (eo.eventId !== undefined) {
    entry.eventId = str(eo, "eventId", `${p}.eventId`);
    if (!data.events.some((ev) => ev.id === entry.eventId)) fail(`${p}.eventId`, `找不到事件 ${entry.eventId}`);
  }
  if (eo.choice !== undefined) entry.choice = num(eo, "choice", { integer: true, min: 0 }, `${p}.choice`);
  if (eo.outcome !== undefined) entry.outcome = num(eo, "outcome", { integer: true, min: 0 }, `${p}.outcome`);
  if (eo.changes !== undefined) entry.changes = parseChanges(eo.changes, `${p}.changes`);
  if (eo.retreatMonths !== undefined) entry.retreatMonths = num(eo, "retreatMonths", { integer: true, min: 1 }, `${p}.retreatMonths`);
  if (eo.stop !== undefined) {
    const stop = str(eo, "stop", `${p}.stop`);
    if (!(OFFLINE_STOPS as readonly string[]).includes(stop)) fail(`${p}.stop`, `不是合法的閉關結束原因：${stop}`);
    entry.stop = stop as OfflineStop;
  }
  if (eo.eraIndex !== undefined) entry.eraIndex = num(eo, "eraIndex", { integer: true, min: 0 }, `${p}.eraIndex`);
  if (kind === "era" && entry.eraIndex === undefined) fail(p, "開場日誌必須有 eraIndex");
  if (kind === "retreat" && (entry.retreatMonths === undefined || entry.stop === undefined)) {
    fail(p, "閉關見聞必須有 retreatMonths 與 stop");
  }
  if (kind === "event" && entry.eventId === undefined) fail(`${p}.eventId`, "事件日誌必須有 eventId");
  return entry;
}

function parseMeta(v: unknown, data: GameData): Meta {
  const o = obj(v, "meta");
  const talents = intRecord(o, "talents", "meta.talents");
  for (const [id, level] of Object.entries(talents)) {
    const def = data.talents.find((t) => t.id === id);
    if (!def) fail(`meta.talents.${id}`, `找不到天賦 ${id}`);
    if (level > def.maxLevel) fail(`meta.talents.${id}`, `超過上限 ${def.maxLevel}，目前為 ${level}`);
  }
  if (!Array.isArray(o.reached) || !o.reached.every((k) => typeof k === "string")) {
    fail("meta.reached", "必須是字串陣列");
  }
  if (!Array.isArray(o.fragments)) fail("meta.fragments", "必須是字串陣列");
  const fragments = o.fragments.map((id, i) => {
    if (typeof id !== "string") fail(`meta.fragments[${i}]`, "必須是字串");
    if (!data.fragments.items.some((f) => f.id === id)) fail(`meta.fragments[${i}]`, `找不到殘卷 ${id}`);
    return id;
  });
  if (new Set(fragments).size !== fragments.length) fail("meta.fragments", "有重複的殘卷");
  const clears = intRecord(o, "clears", "meta.clears");
  for (const [id, n] of Object.entries(clears)) {
    if (!data.origins.some((x) => x.id === id)) fail(`meta.clears.${id}`, `找不到出身 ${id}`);
    if (n < 1) fail(`meta.clears.${id}`, `必須是正整數，目前為 ${n}`);
  }
  return {
    fragments,
    clears,
    daoYun: num(o, "daoYun", { integer: true, min: 0 }, "meta.daoYun"),
    talents,
    reached: o.reached as string[],
    lives: num(o, "lives", { integer: true, min: 0 }, "meta.lives"),
  };
}

function parseReview(v: unknown, data: GameData): LifeReview | null {
  if (v === null) return null;
  const o = obj(v, "review");
  const cause = str(o, "cause", "review.cause");
  if (!(REVIEW_CAUSES as readonly string[]).includes(cause)) fail("review.cause", `不是合法的結束方式：${cause}`);
  const closing = num(o, "closing", { integer: true, min: 0 }, "review.closing");
  if (closing >= data.text.review[cause as ReviewCause].length) fail("review.closing", `超出收尾句數量，目前為 ${closing}`);
  const realmId = str(o, "realmId", "review.realmId");
  const realm = data.realms.find((r) => r.id === realmId);
  if (!realm) fail("review.realmId", `找不到境界 ${realmId}`);
  const stage = num(o, "stage", { integer: true, min: 0 }, "review.stage");
  if (stage >= realm.stageNames.length) fail("review.stage", `超出 ${realm.name} 的階段數，目前為 ${stage}`);
  if (!Array.isArray(o.highlights)) fail("review.highlights", "必須是陣列");
  return {
    cause: cause as ReviewCause,
    closing,
    ageMonths: num(o, "ageMonths", { integer: true, min: 0 }, "review.ageMonths"),
    originId: str(o, "originId", "review.originId"),
    spiritRootId: str(o, "spiritRootId", "review.spiritRootId"),
    realmId,
    stage,
    breakthroughs: num(o, "breakthroughs", { integer: true, min: 0 }, "review.breakthroughs"),
    daoYunBase: num(o, "daoYunBase", { integer: true, min: 0 }, "review.daoYunBase"),
    daoYunBonus: num(o, "daoYunBonus", { integer: true, min: 0 }, "review.daoYunBonus"),
    highlights: o.highlights.map((e, i) => parseLogEntry(e, `review.highlights[${i}]`, data)),
  };
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
  if (phase !== "rolling" && phase !== "living" && phase !== "dead" && phase !== "cleared") {
    fail("phase", `必須是 rolling、living、dead 或 cleared，目前為 ${JSON.stringify(phase)}`);
  }

  const attrRaw = obj(o.attributes, "attributes");
  const attributes = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) attributes[k] = num(attrRaw, k, { integer: true }, `attributes.${k}`);

  const name = str(o, "name");
  if (name === "") fail("name", "不可為空");
  if (typeof o.nameCustom !== "boolean") fail("nameCustom", `必須是 true 或 false，目前為 ${JSON.stringify(o.nameCustom)}`);

  const realmId = str(o, "realmId");
  const realm = data.realms.find((r) => r.id === realmId);
  if (!realm) fail("realmId", `找不到境界 ${realmId}`);
  const stage = num(o, "stage", { integer: true, min: 0 });
  if (stage >= realm.stageNames.length) fail("stage", `超出 ${realm.name} 的階段數，目前為 ${stage}`);

  const spiritRootId = str(o, "spiritRootId");
  if (!data.spiritRoots.some((r) => r.id === spiritRootId)) fail("spiritRootId", `找不到靈根 ${spiritRootId}`);
  const originId = str(o, "originId");
  if (!data.origins.some((r) => r.id === originId)) fail("originId", `找不到出身 ${originId}`);
  const schedule = str(o, "schedule");
  if (!data.schedules.some((s) => s.id === schedule)) fail("schedule", `找不到日常安排 ${schedule}`);

  if (!Array.isArray(o.log)) fail("log", "必須是陣列");
  const log = o.log.map((e, i) => parseLogEntry(e, `log[${i}]`, data));

  if (!Array.isArray(o.flags) || !o.flags.every((f) => typeof f === "string")) fail("flags", "必須是字串陣列");
  const pendingEvent = o.pendingEvent;
  if (pendingEvent !== null) {
    if (typeof pendingEvent !== "string") fail("pendingEvent", `必須是字串或 null，目前為 ${JSON.stringify(pendingEvent)}`);
    if (!data.events.some((e) => e.id === pendingEvent)) fail("pendingEvent", `找不到事件 ${pendingEvent}`);
  }
  if (typeof o.autoChoice !== "boolean") fail("autoChoice", `必須是 true 或 false，目前為 ${JSON.stringify(o.autoChoice)}`);

  return {
    version,
    rngSeed: num(o, "rngSeed", { integer: true }),
    name,
    nameCustom: o.nameCustom,
    worldSeed: num(o, "worldSeed", { integer: true, min: 0 }),
    speed: num(o, "speed", { min: 0 }),
    phase: phase as Phase,
    ageMonths: num(o, "ageMonths", { integer: true, min: 0 }),
    rerolls: num(o, "rerolls", { integer: true, min: 0 }),
    attributes,
    spiritRootId,
    originId,
    cultivationBonus: num(o, "cultivationBonus", { min: 0 }),
    spiritStones: num(o, "spiritStones", { integer: true, min: 0 }),
    items: intRecord(o, "items"),
    itemsUsed: intRecord(o, "itemsUsed"),
    lifespanBonus: num(o, "lifespanBonus", { integer: true }),
    schedule,
    realmId,
    stage,
    cultivation: num(o, "cultivation", { min: 0 }),
    breakthroughs: num(o, "breakthroughs", { integer: true, min: 0 }),
    flags: o.flags as string[],
    eventCounts: intRecord(o, "eventCounts"),
    eventClock: num(o, "eventClock", { min: 0 }),
    eventThreshold: num(o, "eventThreshold", { min: 0 }),
    pendingEvent: pendingEvent as string | null,
    autoChoice: o.autoChoice,
    carriedStones: num(o, "carriedStones", { integer: true, min: 0 }),
    meta: parseMeta(o.meta, data),
    review: parseReview(o.review, data),
    log,
  };
}
