import {
  type MapArtData,
  type MapData,
  type MapRegion,
  type Point,
  SECT_STATES,
  type SectState,
  MAP_REFS,
  MAP_INK_KEYS,
  type MapRef,
  type WorldWhen,
  type WorldEffectDef,
  type WorldEventDef,
  WORLD_EVENT_KINDS,
  type WorldEventKind,
} from "../types";
import { fail, obj, list, num, str, strList, uniqueIds } from "./common";
import { BLURB_TOKENS } from "./text";

export function point(raw: unknown, where: string, field: string, box: [number, number]): Point {
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
  const viewObj = obj(o.view, `${file} 欄位 view`);
  const viewSize = list(viewObj.size, `${file} 欄位 view.size`);
  const viewScale = list(viewObj.scale, `${file} 欄位 view.scale`);
  if (viewSize.length !== 2 || !viewSize.every((n) => typeof n === "number" && n > 0)) fail(file, "view.size", "必須是 [寬, 高] 兩個正數");
  if (viewScale.length !== 2 || !viewScale.every((n) => typeof n === "number" && n > 0)) fail(file, "view.scale", "必須是 [x 倍率, y 倍率] 兩個正數");
  if (box[0] * (viewScale[0] as number) > (viewSize[0] as number) || box[1] * (viewScale[1] as number) > (viewSize[1] as number)) {
    fail(file, "view", `邏輯畫布 ${box[0]}×${box[1]} 乘上 scale 後超出顯示畫布 ${viewSize[0]}×${viewSize[1]}`);
  }
  const rules = obj(o.territoryRules, `${file} 欄位 territoryRules`);
  const territoryRules = {
    transitionYears: num(rules, "transitionYears", `${file} 欄位 territoryRules`, { min: 1, integer: true }),
    travelDelayMonths: num(rules, "travelDelayMonths", `${file} 欄位 territoryRules`, { min: 0, integer: true }),
    marketMultiplier: num(rules, "marketMultiplier", `${file} 欄位 territoryRules`, { min: 1 }),
    greatReach: num(rules, "greatReach", `${file} 欄位 territoryRules`, { gt: 0 }),
    schoolReach: num(rules, "schoolReach", `${file} 欄位 territoryRules`, { gt: 0 }),
    prosperReachMultiplier: num(rules, "prosperReachMultiplier", `${file} 欄位 territoryRules`, { min: 1 }),
    declineReachMultiplier: num(rules, "declineReachMultiplier", `${file} 欄位 territoryRules`, { min: 0, max: 1 }),
    driftPeriodYears: num(rules, "driftPeriodYears", `${file} 欄位 territoryRules`, { gt: 0 }),
    driftThreshold: num(rules, "driftThreshold", `${file} 欄位 territoryRules`, { min: 0 }),
    strengthWindowYears: num(rules, "strengthWindowYears", `${file} 欄位 territoryRules`, { gt: 0 }),
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
  return { viewBox: box, view: { size: [viewSize[0] as number, viewSize[1] as number], scale: [viewScale[0] as number, viewScale[1] as number] }, palette, territoryRules, regions, adjacency, stairs, blurbs };
}

/** 世局候選池各種類允許的目標、欄位與模板欄位 */
export const WORLD_EVENT_RULES: Record<WorldEventKind, { targets: string[]; tokens: string[]; to?: string[] }> = {
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
export function validateWhen(raw: unknown, where: string): WorldWhen {
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

/** 逐欄檢查一組數值，缺欄或不在範圍內就指出是哪一個欄位 */
function numGroup<T>(parent: Record<string, unknown>, key: string, file: string, spec: Record<string, { min?: number; max?: number; gt?: number; integer?: boolean }>): T {
  const where = `${file} 欄位 ${key}`;
  const g = obj(parent[key], where);
  const out: Record<string, number> = {};
  for (const [k, opts] of Object.entries(spec)) out[k] = num(g, k, where, opts);
  return out as T;
}

function rgb(raw: unknown, where: string, field: string): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)) {
    fail(where, field, "必須是 [紅, 綠, 藍] 三個 0 到 255 的整數");
  }
  return raw as [number, number, number];
}

export function validateMapArt(raw: unknown, file = "mapart.json"): MapArtData {
  const o = obj(raw, file);
  const cells = numGroup<MapArtData["cells"]>(o, "cells", file, { count: { min: 100, integer: true }, min: { min: 100, integer: true }, max: { min: 100, integer: true }, jitter: { gt: 0, max: 1 } });
  if (cells.min > cells.max || cells.count < cells.min || cells.count > cells.max) fail(file, "cells", `count 必須在 min 與 max 之間（目前 ${cells.min}、${cells.count}、${cells.max}）`);
  const provinces = numGroup<MapArtData["provinces"]>(o, "provinces", file, { count: { min: 1, integer: true }, min: { min: 1, integer: true }, max: { min: 1, integer: true }, minPerRegion: { min: 1, integer: true } });
  if (provinces.min > provinces.max || provinces.count < provinces.min || provinces.count > provinces.max) fail(file, "provinces", `count 必須在 min 與 max 之間（目前 ${provinces.min}、${provinces.count}、${provinces.max}）`);
  const biomes = list(o.biomes, `${file} 欄位 biomes`).map((b, i) => {
    const bo = obj(b, `${file} 第 ${i + 1} 種生態區`);
    return { name: str(bo, "name", `${file} 第 ${i + 1} 種生態區`), color: rgb(bo.color, `${file} 第 ${i + 1} 種生態區`, "color") };
  });
  if (biomes.length !== 12) fail(file, "biomes", `必須剛好 12 種生態區，目前 ${biomes.length} 種`);
  return {
    cells,
    provinces,
    edgeMargin: num(o, "edgeMargin", file, { min: 0 }),
    markerRadius: num(o, "markerRadius", file, { min: 0 }),
    coast: numGroup(o, "coast", file, { large: { min: 0 }, small: { min: 0 }, islandCutoff: { min: 0, max: 1 }, islandNear: { min: 0 }, islandFar: { min: 0 }, islandStrength: { min: 0 }, edgePenalty: { min: 0 }, regionJitter: { min: 0 } }),
    relief: numGroup(o, "relief", file, { inlandRange: { gt: 0 }, inlandWeight: { min: 0 }, ridgeWeight: { min: 0 }, ridgeSharp: { gt: 0 }, ridgeRamp: { gt: 0 }, base: { min: 0 }, slope: { min: 0 }, power: { gt: 0 }, north: { min: 0 }, west: { min: 0 }, detail: { min: 0 }, floor: { min: 0 }, smoothPasses: { min: 0, integer: true } }),
    climate: numGroup(o, "climate", file, { base: {}, noise: { min: 0 }, coast: { min: 0 }, coastRange: { gt: 0 }, south: { min: 0 }, east: { min: 0 }, wetOffset: {}, coldGradient: { min: 0 }, coldNoise: { min: 0 }, heightChill: { min: 0 }, chillStart: { min: 0 } }),
    river: numGroup(o, "river", file, { minAccumulation: { gt: 0 }, lakeFillDelta: { min: 0 }, lakeMinAccumulation: { min: 0 }, jitter: { min: 0 } }),
    biome: numGroup(o, "biome", file, { peak: { min: 0 }, warmPeak: { min: 0 }, snowTemp: { min: 0 }, coldTemp: { min: 0 }, coldWet: { min: 0 }, mountain: { min: 0 }, hill: { min: 0 }, hotTemp: { min: 0 }, dry: { min: 0 }, wetTemp: { min: 0 }, wet: { min: 0 }, swampHeight: { min: 0 }, forestWet: { min: 0 }, grassWet: { min: 0 } }),
    biomes,
    parchment: rgb(o.parchment, file, "parchment"),
    ink: Object.fromEntries(MAP_INK_KEYS.map((k) => [k, rgb(obj(o.ink, `${file} 欄位 ink`)[k], `${file} 欄位 ink`, k)])) as MapArtData["ink"],
  };
}
