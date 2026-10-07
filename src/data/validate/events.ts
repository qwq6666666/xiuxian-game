import {
  OMENS,
  type Omen,
  type ChoiceDef,
  type Effects,
  type EventConditions,
  type EventDef,
} from "../types";
import { fail, obj, list, num, str, uniqueIds, optStrList, intRecord, attrRecord } from "./common";

export function parseEffects(raw: unknown, where: string): Effects {
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
  for (const k of ["advanceRealm", "breakthroughFail"] as const) {
    if (o[k] !== undefined) {
      if (typeof o[k] !== "boolean") fail(where, k, "必須是 true 或 false");
      e[k] = o[k] as boolean;
    }
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
    if (!["cultivation", "spiritStones", "lifespan", "attributes", "items", "flags", "death", "fragment", "contribution", "advanceRealm", "breakthroughFail"].includes(k)) {
      fail(where, k, "不是合法的效果");
    }
  }
  return e;
}

export function parseConditions(raw: unknown, where: string): EventConditions {
  const o = raw === undefined ? {} : obj(raw, where);
  const c: EventConditions = {};
  if (o.realmMin !== undefined) c.realmMin = str(o, "realmMin", where);
  if (o.realmMax !== undefined) c.realmMax = str(o, "realmMax", where);
  if (o.stageMin !== undefined) c.stageMin = num(o, "stageMin", where, { min: 0, integer: true });
  if (o.lifespanLeftMax !== undefined) c.lifespanLeftMax = num(o, "lifespanLeftMax", where, { gt: 0 });
  c.reachedNot = optStrList(o, "reachedNot", where);
  if (o.ageMin !== undefined) c.ageMin = num(o, "ageMin", where, { min: 0 });
  if (o.ageMax !== undefined) c.ageMax = num(o, "ageMax", where, { min: 0 });
  c.flags = optStrList(o, "flags", where);
  c.flagsNot = optStrList(o, "flagsNot", where);
  c.schedules = optStrList(o, "schedules", where);
  c.world = optStrList(o, "world", where);
  c.worldNot = optStrList(o, "worldNot", where);
  c.origins = optStrList(o, "origins", where);
  c.roots = optStrList(o, "roots", where);
  if (o.acquaintance !== undefined) {
    const aw = `${where} 欄位 acquaintance`;
    const a = obj(o.acquaintance, aw);
    c.acquaintance = { id: str(a, "id", aw) };
    if (a.gapMin !== undefined) c.acquaintance.gapMin = num(a, "gapMin", aw, { min: 0, integer: true });
    if (a.gapMax !== undefined) c.acquaintance.gapMax = num(a, "gapMax", aw, { min: 0, integer: true });
    if (c.acquaintance.gapMin !== undefined && c.acquaintance.gapMax !== undefined && c.acquaintance.gapMin > c.acquaintance.gapMax) fail(aw, "gapMin", "不可大於 gapMax");
    for (const k of Object.keys(a)) if (!["id", "gapMin", "gapMax"].includes(k)) fail(aw, k, "不是合法的欄位");
  }
  if (o.territoryConflict !== undefined) {
    if (typeof o.territoryConflict !== "boolean") fail(where, "territoryConflict", "必須是 true 或 false");
    c.territoryConflict = o.territoryConflict;
  }
  if (o.territoryRelation !== undefined) {
    if (o.territoryRelation !== "ally" && o.territoryRelation !== "feud") fail(where, "territoryRelation", `必須是 "ally" 或 "feud"，目前為 ${JSON.stringify(o.territoryRelation)}`);
    c.territoryRelation = o.territoryRelation;
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
    if (!["realmMin", "realmMax", "stageMin", "lifespanLeftMax", "reachedNot", "ageMin", "ageMax", "flags", "flagsNot", "schedules", "bottleneck", "fragmentAvailable", "world", "worldNot", "territoryConflict", "territoryRelation", "sectInfluence", "sect", "sectRankMin", "livesMax", "origins", "roots", "acquaintance"].includes(k)) {
      fail(where, k, "不是合法的條件");
    }
  }
  return c;
}

export function parseChoice(raw: unknown, where: string): ChoiceDef {
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
      if (oo.omen !== undefined) {
        const om = str(oo, "omen", ow);
        if (!(OMENS as readonly string[]).includes(om)) fail(ow, "omen", `必須是 good、neutral 或 bad，目前為 ${JSON.stringify(om)}`);
        outcome.omen = om as Omen;
      }
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
    if (o.cooldownYears !== undefined) ev.cooldownYears = num(o, "cooldownYears", where, { min: 0 });
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
