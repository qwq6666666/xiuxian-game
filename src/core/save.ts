import { checkNum, checkStr, isPlainObject, type Obj } from "../data/check";
import { gameData } from "../data/load";
import { ARTIFACT_SLOTS, ATTRIBUTE_KEYS, OMENS, REVIEW_CAUSES, type GameData, type Omen, type ReviewCause } from "../data/types";
import { pickGoals } from "./goals";
import { createInitialState } from "./life";
import { deriveSeed, nextInt } from "./rng";
import { placesAt } from "./travel";
import {
  emptyMeta,
  LOG_KINDS,
  OFFLINE_STOPS,
  SAVE_VERSION,
  type Attributes,
  type Changes,
  type Chart,
  type OmenEntry,
  type GameState,
  type LifeBrief,
  type LifeReview,
  type LogEntry,
  type LogKind,
  type OfflineStop,
  type BestiaryEntry,
  type MetEntry,
  type Meta,
  type Phase,
} from "./state";


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
  // v9 沒有元嬰紀錄：補上空的紀錄
  9: (d) => ({ ...d, version: 10, meta: { ...obj(d.meta, "meta"), yuanying: {} } }),
  // v10 沒有丹毒計數：補上空的（等於這一階段還沒服過聚氣丹）
  10: (d) => ({ ...d, version: 11, pillStage: "", pillCount: 0 }),
  // v11 沒有每世目標：擲骰中的存檔照世界種子抽一組；進行中與已結束的不補（沒有開局目標可言）。
  // 跨世資料補上空的目標收藏與上一世紀錄，既有回顧補上空的目標結果。
  11: (d, gd) => {
    const meta = obj(d.meta, "meta");
    const fragments = Array.isArray(meta.fragments) ? meta.fragments.length : 0;
    const lives = typeof meta.lives === "number" ? meta.lives : 0;
    const review = d.review === null || d.review === undefined ? null : { ...obj(d.review, "review"), goals: [], prev: null };
    return {
      ...d,
      version: 12,
      goalIds: d.phase === "rolling" ? pickGoals(Number(d.worldSeed) >>> 0, lives, gd) : [],
      startFragments: fragments,
      meta: { ...meta, goals: {}, lastLife: null },
      review,
    };
  },
  // v12 的天下圖只供觀看：舊檔從出生村開始，未曾旅行。
  12: (d) => ({ ...d, version: 13, travel: { locationId: "village", targetId: null, totalMonths: 0, remainingMonths: 0, trail: ["village"] } }),
  // v13 沒有化神紀錄：補上空的紀錄
  13: (d) => ({ ...d, version: 14, meta: { ...obj(d.meta, "meta"), huashen: {} } }),
  // v14 沒有宗門：補上未入宗的狀態，跨世與回顧補上最高位階 0
  // v15 沒有最快年齡：舊存檔沒記下過去的年齡，無從回推，補上空的紀錄
  // v16 沒有天劫：補上未在天劫中的狀態
  16: (d) => ({ ...d, version: 17, tribulation: null }),
  // v17 沒有煉丹：補上未在煉丹的狀態
  17: (d) => ({ ...d, version: 18, alchemy: null }),
  // v18 沒有心法：補上預設的無相訣（第一個心法）
  // v19 沒有法寶：補上空的裝備欄與帶來的法寶清單
  // v20 沒有運功：補上還沒用過
  // v21 沒有遇怪：補上未在遇怪的狀態
  21: (d) => ({ ...d, version: 22, encounter: null }),
  // v22 沒有圖鑑：舊檔遇過哪些怪無從回推，補上空的紀錄
  22: (d) => ({ ...d, version: 23, meta: { ...obj(d.meta, "meta"), bestiary: {} } }),
  // v23 沒有故人紀錄：補上空的紀錄；舊的開場日誌沒有出身欄位，顯示時退回通用句
  23: (d) => ({ ...d, version: 24, meta: { ...obj(d.meta, "meta"), met: {} } }),
  // v25 沒有擇身、夙願、靈犀：補上沒有備選命盤、沒指定夙願、沒有靈犀次數
  // v26 的閉關見聞沒有序號與種子：選填欄位，顯示時退回由年齡推出的序號
  // v27 沒有突破心得與疲勞：補上從零開始
  27: (d) => ({ ...d, version: 28, breakthroughStudy: 0, retreatStreak: 0 }),
  26: (d) => ({ ...d, version: 27 }),
  25: (d) => ({ ...d, version: 26, altCharts: [], wishId: null, omenLeft: 0, omen: [] }),
  // v24 運功是冷卻制：冷卻已過的舊檔補一次存量，起點移到現在；還在冷卻的維持原計時
  24: (d, gd) => {
    const age = d.ageMonths as number;
    const last = d.focusMonth as number;
    const ready = age - last >= gd.config.focusCooldown;
    return { ...d, version: 25, focusMonth: ready ? age : last, focusStored: ready ? 1 : 0 };
  },
  20: (d) => ({ ...d, version: 21, focusMonth: -1 }),
  19: (d) => ({ ...d, version: 20, equipment: { weapon: null, ward: null }, meta: { ...obj(d.meta, "meta"), keptArtifacts: [] } }),
  18: (d, gd) => ({ ...d, version: 19, methodId: gd.methods[0].id }),
  15: (d) => ({ ...d, version: 16, meta: { ...obj(d.meta, "meta"), fastest: {} } }),
  14: (d) => ({
    ...d,
    version: 15,
    sect: null,
    sectsTried: [],
    sectPeak: 0,
    meta: { ...obj(d.meta, "meta"), sectBest: 0 },
    review: d.review === null || d.review === undefined ? null : { ...obj(d.review, "review"), sectPeak: 0 },
  }),
};

function fail(field: string, msg: string): never {
  throw new Error(`存檔：欄位 ${field} ${msg}`);
}

function num(o: Obj, key: string, opts: { integer?: boolean; min?: number } = {}, path = key): number {
  return checkNum(o[key], path, opts, fail);
}

function str(o: Obj, key: string, path = key): string {
  return checkStr(o[key], path, true, fail);
}

function obj(v: unknown, path: string): Obj {
  if (!isPlainObject(v)) fail(path, "必須是物件");
  return v;
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
  for (const k of ["cultivation", "spiritStones", "lifespan", "contribution"] as const) {
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
  if (eo.retreatNo !== undefined) entry.retreatNo = num(eo, "retreatNo", { integer: true, min: 0 }, `${p}.retreatNo`);
  if (eo.retreatSeed !== undefined) entry.retreatSeed = num(eo, "retreatSeed", { integer: true, min: 0 }, `${p}.retreatSeed`);
  if (eo.stop !== undefined) {
    const stop = str(eo, "stop", `${p}.stop`);
    if (!(OFFLINE_STOPS as readonly string[]).includes(stop)) fail(`${p}.stop`, `不是合法的閉關結束原因：${stop}`);
    entry.stop = stop as OfflineStop;
  }
  if (eo.sectName !== undefined) entry.sectName = str(eo, "sectName", `${p}.sectName`);
  if (eo.wave !== undefined) entry.wave = num(eo, "wave", { integer: true, min: 1 }, `${p}.wave`);
  if (eo.monsterId !== undefined) {
    entry.monsterId = str(eo, "monsterId", `${p}.monsterId`);
    if (!data.monsters.monsters.some((m) => m.id === entry.monsterId)) fail(`${p}.monsterId`, `找不到怪物 ${entry.monsterId}`);
  }
  if (kind.startsWith("hunt") && entry.monsterId === undefined) fail(`${p}.monsterId`, "遇怪日誌必須有 monsterId");
  if (eo.rank !== undefined) entry.rank = num(eo, "rank", { integer: true, min: 0 }, `${p}.rank`);
  if (eo.eraIndex !== undefined) entry.eraIndex = num(eo, "eraIndex", { integer: true, min: 0 }, `${p}.eraIndex`);
  if (eo.originId !== undefined) {
    entry.originId = str(eo, "originId", `${p}.originId`);
    if (!data.origins.some((x) => x.id === entry.originId)) fail(`${p}.originId`, `找不到出身 ${entry.originId}`);
  }
  if (eo.spiritRootId !== undefined) {
    entry.spiritRootId = str(eo, "spiritRootId", `${p}.spiritRootId`);
    if (!data.spiritRoots.some((x) => x.id === entry.spiritRootId)) fail(`${p}.spiritRootId`, `找不到靈根 ${entry.spiritRootId}`);
  }
  if (kind === "era" && entry.eraIndex === undefined) fail(p, "開場日誌必須有 eraIndex");
  if (kind === "retreat" && (entry.retreatMonths === undefined || entry.stop === undefined)) {
    fail(p, "閉關見聞必須有 retreatMonths 與 stop");
  }
  if (kind === "event" && entry.eventId === undefined) fail(`${p}.eventId`, "事件日誌必須有 eventId");
  return entry;
}

function parseBrief(v: unknown, path: string, data: GameData): LifeBrief {
  const o = obj(v, path);
  const realmId = str(o, "realmId", `${path}.realmId`);
  const realm = data.realms.find((r) => r.id === realmId);
  if (!realm) fail(`${path}.realmId`, `找不到境界 ${realmId}`);
  const stage = num(o, "stage", { integer: true, min: 0 }, `${path}.stage`);
  if (stage >= realm.stageNames.length) fail(`${path}.stage`, `超出 ${realm.name} 的階段數，目前為 ${stage}`);
  const originId = str(o, "originId", `${path}.originId`);
  if (!data.origins.some((x) => x.id === originId)) fail(`${path}.originId`, `找不到出身 ${originId}`);
  return { ageMonths: num(o, "ageMonths", { integer: true, min: 0 }, `${path}.ageMonths`), realmId, stage, originId };
}

/** 各出身最快達成各終局的年齡：鍵是「終局:出身 id」 */
function parseFastest(o: Obj, data: GameData): Record<string, number> {
  const raw = intRecord(o, "fastest", "meta.fastest");
  for (const [key, age] of Object.entries(raw)) {
    const [kind, originId] = key.split(":");
    if (!["cleared", "yuanying", "huashen"].includes(kind) || !originId) fail(`meta.fastest.${key}`, "鍵必須是「cleared、yuanying、huashen」加冒號加出身 id");
    if (!data.origins.some((x) => x.id === originId)) fail(`meta.fastest.${key}`, `找不到出身 ${originId}`);
    if (age < 1) fail(`meta.fastest.${key}`, `必須是正整數，目前為 ${age}`);
  }
  return raw;
}

/** 帶來的法寶清單：每個都必須是法寶 */
function keptArtifacts(o: Obj, data: GameData): string[] {
  if (!Array.isArray(o.keptArtifacts)) fail("meta.keptArtifacts", "必須是字串陣列");
  return o.keptArtifacts.map((id, i) => {
    const item = typeof id === "string" ? data.items.find((x) => x.id === id) : undefined;
    if (!item || item.effect.kind !== "artifact") fail(`meta.keptArtifacts[${i}]`, `必須是法寶 id，目前為 ${JSON.stringify(id)}`);
    return item.id;
  });
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
  const originCounts = (key: "clears" | "yuanying" | "huashen"): Record<string, number> => {
    const counts = intRecord(o, key, `meta.${key}`);
    for (const [id, n] of Object.entries(counts)) {
      if (!data.origins.some((x) => x.id === id)) fail(`meta.${key}.${id}`, `找不到出身 ${id}`);
      if (n < 1) fail(`meta.${key}.${id}`, `必須是正整數，目前為 ${n}`);
    }
    return counts;
  };
  const goals = intRecord(o, "goals", "meta.goals");
  for (const [id, n] of Object.entries(goals)) {
    if (!data.goals.some((g) => g.id === id)) fail(`meta.goals.${id}`, `找不到目標 ${id}`);
    if (n < 1) fail(`meta.goals.${id}`, `必須是正整數，目前為 ${n}`);
  }
  const bestiary: Record<string, BestiaryEntry> = {};
  const rawBestiary = obj(o.bestiary, "meta.bestiary");
  for (const id of Object.keys(rawBestiary)) {
    if (!data.monsters.monsters.some((m) => m.id === id)) fail(`meta.bestiary.${id}`, `找不到怪物 ${id}`);
    const e = obj(rawBestiary[id], `meta.bestiary.${id}`);
    bestiary[id] = {
      win: num(e, "win", { integer: true, min: 0 }, `meta.bestiary.${id}.win`),
      lose: num(e, "lose", { integer: true, min: 0 }, `meta.bestiary.${id}.lose`),
      flee: num(e, "flee", { integer: true, min: 0 }, `meta.bestiary.${id}.flee`),
      draw: num(e, "draw", { integer: true, min: 0 }, `meta.bestiary.${id}.draw`),
    };
  }
  const met: Record<string, MetEntry> = {};
  const rawMet = obj(o.met, "meta.met");
  for (const id of Object.keys(rawMet)) {
    if (!data.acquaintances.some((a) => a.id === id)) fail(`meta.met.${id}`, `找不到故人 ${id}`);
    const e = obj(rawMet[id], `meta.met.${id}`);
    const firstLife = num(e, "firstLife", { integer: true, min: 0 }, `meta.met.${id}.firstLife`);
    const lastLife = num(e, "lastLife", { integer: true, min: 0 }, `meta.met.${id}.lastLife`);
    if (lastLife < firstLife) fail(`meta.met.${id}.lastLife`, `不可小於 firstLife（${firstLife}），目前為 ${lastLife}`);
    met[id] = { firstLife, lastLife };
  }
  return {
    goals,
    bestiary,
    met,
    lastLife: o.lastLife === null ? null : parseBrief(o.lastLife, "meta.lastLife", data),
    fragments,
    clears: originCounts("clears"),
    yuanying: originCounts("yuanying"),
    huashen: originCounts("huashen"),
    fastest: parseFastest(o, data),
    sectBest: num(o, "sectBest", { integer: true, min: 0 }, "meta.sectBest"),
    keptArtifacts: keptArtifacts(o, data),
    daoYun: num(o, "daoYun", { integer: true, min: 0 }, "meta.daoYun"),
    talents,
    reached: o.reached as string[],
    lives: num(o, "lives", { integer: true, min: 0 }, "meta.lives"),
  };
}

function parseGoalResults(v: unknown, path: string, data: GameData): { id: string; done: boolean }[] {
  if (!Array.isArray(v)) fail(path, "必須是陣列");
  return v.map((x, i) => {
    const o = obj(x, `${path}[${i}]`);
    const id = str(o, "id", `${path}[${i}].id`);
    if (!data.goals.some((g) => g.id === id)) fail(`${path}[${i}].id`, `找不到目標 ${id}`);
    if (typeof o.done !== "boolean") fail(`${path}[${i}].done`, `必須是 true 或 false，目前為 ${JSON.stringify(o.done)}`);
    return { id, done: o.done };
  });
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
    goals: parseGoalResults(o.goals, "review.goals", data),
    prev: o.prev === null ? null : parseBrief(o.prev, "review.prev", data),
    sectPeak: num(o, "sectPeak", { integer: true, min: 0 }, "review.sectPeak"),
  };
}

/** 擇身的備選命盤：欄位與目前命盤相同，逐項檢查 */
function parseChart(raw: unknown, path: string, data: GameData): Chart {
  const c = obj(raw, path);
  const attrRaw = obj(c.attributes, `${path}.attributes`);
  const attributes = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) attributes[k] = num(attrRaw, k, { integer: true }, `${path}.attributes.${k}`);
  const spiritRootId = str(c, "spiritRootId", `${path}.spiritRootId`);
  if (!data.spiritRoots.some((r) => r.id === spiritRootId)) fail(`${path}.spiritRootId`, `找不到靈根 ${spiritRootId}`);
  const originId = str(c, "originId", `${path}.originId`);
  if (!data.origins.some((r) => r.id === originId)) fail(`${path}.originId`, `找不到出身 ${originId}`);
  if (!Array.isArray(c.goalIds)) fail(`${path}.goalIds`, "必須是字串陣列");
  const goalIds = c.goalIds.map((id, i) => {
    if (typeof id !== "string" || !data.goals.some((g) => g.id === id)) fail(`${path}.goalIds[${i}]`, `找不到目標 ${String(id)}`);
    return id;
  });
  const name = str(c, "name", `${path}.name`);
  if (name === "") fail(`${path}.name`, "不可為空");
  return {
    rngSeed: num(c, "rngSeed", { integer: true }, `${path}.rngSeed`),
    worldSeed: num(c, "worldSeed", { integer: true, min: 0 }, `${path}.worldSeed`),
    goalIds,
    name,
    attributes,
    spiritRootId,
    originId,
    cultivationBonus: num(c, "cultivationBonus", { min: 0 }, `${path}.cultivationBonus`),
    spiritStones: num(c, "spiritStones", { integer: true, min: 0 }, `${path}.spiritStones`),
    items: intRecord(c, "items", `${path}.items`),
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
  if (!Array.isArray(o.goalIds)) fail("goalIds", "必須是字串陣列");
  const goalIds = o.goalIds.map((id, i) => {
    if (typeof id !== "string") fail(`goalIds[${i}]`, "必須是字串");
    if (!data.goals.some((g) => g.id === id)) fail(`goalIds[${i}]`, `找不到目標 ${id}`);
    return id;
  });
  // 夙願：null 或這一世目標裡的一個
  if (o.wishId !== null && (typeof o.wishId !== "string" || !goalIds.includes(o.wishId))) fail("wishId", `必須是 null 或這一世目標之一，目前為 ${JSON.stringify(o.wishId)}`);
  if (!Array.isArray(o.altCharts)) fail("altCharts", "必須是陣列");
  const altCharts = o.altCharts.map((c, i) => parseChart(c, `altCharts[${i}]`, data));
  if (altCharts.length > 0 && phase !== "rolling") fail("altCharts", "只有擲骰階段會有備選命盤");
  const pendingEvent = o.pendingEvent;
  if (pendingEvent !== null) {
    if (typeof pendingEvent !== "string") fail("pendingEvent", `必須是字串或 null，目前為 ${JSON.stringify(pendingEvent)}`);
    if (!data.events.some((e) => e.id === pendingEvent)) fail("pendingEvent", `找不到事件 ${pendingEvent}`);
  }
  // 靈犀：已窺看的選項要對得上目前等待中的抉擇
  if (!Array.isArray(o.omen)) fail("omen", "必須是陣列");
  const pendingDef = typeof pendingEvent === "string" ? data.events.find((e) => e.id === pendingEvent) : undefined;
  const omen = o.omen.map((raw, i): OmenEntry => {
    const e = obj(raw, `omen[${i}]`);
    const choice = num(e, "choice", { integer: true, min: 0 }, `omen[${i}].choice`);
    if (!pendingDef || choice >= (pendingDef.choices?.length ?? 0)) fail(`omen[${i}].choice`, "沒有等待中的抉擇，或選項不存在");
    const tendency = str(e, "omen", `omen[${i}].omen`);
    if (!(OMENS as readonly string[]).includes(tendency)) fail(`omen[${i}].omen`, `必須是 good、neutral 或 bad，目前為 ${JSON.stringify(tendency)}`);
    return { choice, omen: tendency as Omen };
  });
  if (typeof o.autoChoice !== "boolean") fail("autoChoice", `必須是 true 或 false，目前為 ${JSON.stringify(o.autoChoice)}`);

  const travelRaw = obj(o.travel, "travel");
  const locationId = str(travelRaw, "locationId", "travel.locationId");
  const targetId = travelRaw.targetId === null ? null : str(travelRaw, "targetId", "travel.targetId");
  const totalMonths = num(travelRaw, "totalMonths", { integer: true, min: 0 }, "travel.totalMonths");
  const remainingMonths = num(travelRaw, "remainingMonths", { integer: true, min: 0 }, "travel.remainingMonths");
  if (remainingMonths > totalMonths) fail("travel.remainingMonths", "不可超過總行程月數");
  if ((targetId === null) !== (remainingMonths === 0)) fail("travel.targetId", "與剩餘月數不一致");
  if (!Array.isArray(travelRaw.trail) || !travelRaw.trail.every((id) => typeof id === "string") || travelRaw.trail.length === 0) {
    fail("travel.trail", "必須是非空的地點 id 陣列");
  }

  let tribulation: GameState["tribulation"] = null;
  if (o.tribulation !== null && o.tribulation !== undefined) {
    const to = obj(o.tribulation, "tribulation");
    const waves = num(to, "waves", { integer: true, min: 2 }, "tribulation.waves");
    const wave = num(to, "wave", { integer: true, min: 0 }, "tribulation.wave");
    if (wave >= waves) fail("tribulation.wave", `必須小於總道數 ${waves}，目前為 ${wave}`);
    const rate = num(to, "rate", { min: 0 }, "tribulation.rate");
    const roll = num(to, "roll", { min: 0 }, "tribulation.roll");
    const threshold = num(to, "threshold", { min: 0 }, "tribulation.threshold");
    if (rate > 1 || roll >= 1 || threshold > 1) fail("tribulation", "rate、threshold 必須介於 0 與 1，roll 必須小於 1");
    if (realm.breakthroughRule?.tribulation?.waves !== waves) fail("tribulation.waves", `與目前境界 ${realm.name} 的天劫道數不符`);
    tribulation = { waves, wave, rate, roll, threshold };
  } else if (o.tribulation === undefined) {
    fail("tribulation", "不可缺少（沒有天劫時為 null）");
  }
  let encounter: GameState["encounter"] = null;
  if (o.encounter !== null && o.encounter !== undefined) {
    const eo = obj(o.encounter, "encounter");
    const monsterId = str(eo, "monsterId", "encounter.monsterId");
    const monster = data.monsters.monsters.find((m) => m.id === monsterId);
    if (!monster) fail("encounter.monsterId", `找不到怪物 ${monsterId}`);
    if (monster.realm !== realm.id) fail("encounter.monsterId", `怪物 ${monster.name} 不屬於目前境界 ${realm.name}`);
    const round = num(eo, "round", { integer: true, min: 0 }, "encounter.round");
    if (round >= data.monsters.rules.rounds) fail("encounter.round", `必須小於回合數 ${data.monsters.rules.rounds}，目前為 ${round}`);
    const monsterHp = num(eo, "monsterHp", { min: 0 }, "encounter.monsterHp");
    const myHp = num(eo, "myHp", { min: 0 }, "encounter.myHp");
    if (monsterHp > 1 || myHp > 1 || monsterHp === 0 || myHp === 0) fail("encounter", "monsterHp、myHp 必須大於 0 且不超過 1");
    encounter = { monsterId, round, monsterHp, myHp, seed: num(eo, "seed", { integer: true, min: 0 }, "encounter.seed") };
  } else if (o.encounter === undefined) {
    fail("encounter", "不可缺少（沒有遇怪時為 null）");
  }
  let alchemy: GameState["alchemy"] = null;
  if (o.alchemy !== null && o.alchemy !== undefined) {
    const ao = obj(o.alchemy, "alchemy");
    const recipeId = str(ao, "recipeId", "alchemy.recipeId");
    const recipe = data.recipes.recipes.find((r) => r.id === recipeId);
    if (!recipe) fail("alchemy.recipeId", `找不到丹方 ${recipeId}`);
    const progress = num(ao, "progress", { integer: true, min: 0 }, "alchemy.progress");
    if (progress >= recipe.months) fail("alchemy.progress", `必須小於丹方月數 ${recipe.months}，目前為 ${progress}`);
    if (typeof ao.paid !== "boolean") fail("alchemy.paid", "必須是 true 或 false");
    if (!ao.paid && progress !== 0) fail("alchemy.progress", "材料未投入時必須為 0");
    alchemy = { recipeId, progress, paid: ao.paid };
  } else if (o.alchemy === undefined) {
    fail("alchemy", "不可缺少（沒有煉丹時為 null）");
  }
  const eqRaw = obj(o.equipment, "equipment");
  const equipment = { weapon: null, ward: null } as GameState["equipment"];
  for (const slot of ARTIFACT_SLOTS) {
    const v = eqRaw[slot];
    if (v === null) continue;
    const item = typeof v === "string" ? data.items.find((i) => i.id === v) : undefined;
    if (!item || item.effect.kind !== "artifact" || item.effect.slot !== slot) fail(`equipment.${slot}`, `必須是 ${slot} 欄的法寶或 null，目前為 ${JSON.stringify(v)}`);
    equipment[slot] = item.id;
  }
  const methodId = str(o, "methodId");
  if (!data.methods.some((m) => m.id === methodId)) fail("methodId", `找不到心法 ${methodId}`);
  const sectRaw = o.sect === null ? null : obj(o.sect, "sect");
  if (sectRaw !== null) {
    const sid = str(sectRaw, "id", "sect.id");
    const srank = num(sectRaw, "rank", { integer: true, min: 0 }, "sect.rank");
    if (srank >= data.sects.ranks.length) fail("sect.rank", `超出位階數 ${data.sects.ranks.length}，目前為 ${srank}`);
    num(sectRaw, "contribution", { integer: true, min: 0 }, "sect.contribution");
    num(sectRaw, "joinedAge", { integer: true, min: 0 }, "sect.joinedAge");
    if (!sid) fail("sect.id", "不可為空");
  }
  if (!Array.isArray(o.sectsTried) || !o.sectsTried.every((id) => typeof id === "string")) fail("sectsTried", "必須是字串陣列");
  const state: GameState = {
    version,
    rngSeed: num(o, "rngSeed", { integer: true }),
    name,
    nameCustom: o.nameCustom,
    worldSeed: num(o, "worldSeed", { integer: true, min: 0 }),
    travel: { locationId, targetId, totalMonths, remainingMonths, trail: travelRaw.trail as string[] },
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
    pillStage: str(o, "pillStage"),
    pillCount: num(o, "pillCount", { integer: true, min: 0 }),
    lifespanBonus: num(o, "lifespanBonus", { integer: true }),
    schedule,
    realmId,
    stage,
    cultivation: num(o, "cultivation", { min: 0 }),
    breakthroughs: num(o, "breakthroughs", { integer: true, min: 0 }),
    breakthroughStudy: num(o, "breakthroughStudy", { integer: true, min: 0 }),
    retreatStreak: num(o, "retreatStreak", { integer: true, min: 0 }),
    goalIds,
    startFragments: num(o, "startFragments", { integer: true, min: 0 }),
    tribulation,
    encounter,
    alchemy,
    methodId,
    focusMonth: num(o, "focusMonth", { integer: true, min: -1 }),
    focusStored: num(o, "focusStored", { integer: true, min: 0 }),
    altCharts,
    wishId: o.wishId as string | null,
    omenLeft: num(o, "omenLeft", { integer: true, min: 0 }),
    omen,
    equipment,
    sect: sectRaw === null ? null : { id: sectRaw.id as string, rank: sectRaw.rank as number, contribution: sectRaw.contribution as number, joinedAge: sectRaw.joinedAge as number },
    sectsTried: o.sectsTried as string[],
    sectPeak: num(o, "sectPeak", { integer: true, min: 0 }),
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
  const known = new Set(placesAt(state, data).map((place) => place.id));
  if (!known.has(locationId)) fail("travel.locationId", `找不到地點 ${locationId}`);
  if (targetId !== null && !known.has(targetId)) fail("travel.targetId", `找不到地點 ${targetId}`);
  for (const [i, id] of state.travel.trail.entries()) if (!known.has(id)) fail(`travel.trail[${i}]`, `找不到地點 ${id}`);
  return state;
}
