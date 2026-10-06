// 天下圖的純邏輯：點選某個標記時顯示什麼、標記該畫成什麼樣子。不碰 DOM，方便測試。
import type { World, WorldPolity, WorldSect, WorldSnapshot } from "../core/world";
import { polityStrength, regionFight, territoryHistory, type GeoCell } from "../core/frontier";
import { polityLabel, worldAt, worldSlots } from "../core/world";
import { fillSlots } from "../data/slots";
import type { GameData, MapRef, WorldEffectDef } from "../data/types";
import { effectApplies } from "../core/worldeffects";

export type MapTarget =
  | { kind: "region"; id: string }
  | { kind: "territory"; id: string; region: string }
  | { kind: "sect"; id: string }
  | { kind: "ferry"; id: string }
  | { kind: "branch"; region: string }
  | { kind: "stairs" }
  | { kind: "village" | "market" | "mountain" | "merchantHq" };

export interface MapInfo {
  title: string;
  lines: string[];
}

export type MarkerFill = "solid" | "hollow" | "dashed" | "gray" | "fallen";

export interface SectMarker {
  shape: "circle" | "square";
  radius: number;
  fill: MarkerFill;
  /** 守梯大宗多畫一圈 */
  ring: boolean;
}

/** 宗門標記：位階決定大小，狀態決定樣式 */
export function sectMarker(sect: Pick<WorldSect, "kind" | "rank" | "state">): SectMarker {
  const fill: MarkerFill = {
    prosper: "solid",
    stable: "hollow",
    decline: "dashed",
    closed: "gray",
    fallen: "fallen",
  }[sect.state] as MarkerFill;
  return { shape: "circle", radius: sect.rank === "great" ? 7 : 5, fill, ring: sect.kind === "guard" };
}

/** 填入簡介模板，不認得的欄位直接丟錯 */
export function fillBlurb(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]*)\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`地圖簡介「${template}」裡的欄位 {${key}} 沒有值`);
    return v;
  });
}

/** 某個標記顯示的標題與簡介 */
export function describeTarget(target: MapTarget, world: World, snap: WorldSnapshot, data: GameData): MapInfo {
  const slots = worldSlots(world);
  const regionName = (id: string): string => data.map.regions.find((r) => r.id === id)!.name;
  const polityOf = (region: string) => snap.polities.find((p) => p.id === snap.owners[region])!;
  const base: Record<string, string> = { ...slots };
  const b = data.map.blurbs;

  switch (target.kind) {
    case "territory":
      return describeTarget({ kind: "region", id: target.region }, world, snap, data);
    case "region": {
      const region = data.map.regions.find((r) => r.id === target.id)!;
      if (!region.land) return { title: region.name, lines: [region.desc, `靈氣：${region.aura}。`] };
      const p = polityOf(region.id);
      const fill = (t: string) => fillBlurb(t, { ...base, name: p.name, region: region.name, capital: p.capital, country: p.name });
      return {
        title: `${region.name}・${polityLabel(p)}`,
        lines: [fill(p.tribal ? b.tribal : b.polity), `靈氣：${region.aura}。${region.desc}`],
      };
    }
    case "sect": {
      const sect = snap.sects.find((s) => s.id === target.id)!;
      const p = polityOf(sect.region);
      const kindText = sect.kind === "guard" ? b.sect.guard : sect.rank === "great" ? b.sect.great : b.sect.school;
      const text = fillBlurb(kindText, { ...base, name: sect.name, region: regionName(sect.region), country: polityLabel(p), capital: p.capital });
      return { title: sect.name, lines: [`${text}${b.state[sect.state]}`] };
    }
    case "ferry": {
      const f = snap.ferries.find((x) => x.id === target.id)!;
      const text = fillBlurb(f.broken ? b.ferryBroken : b.ferry, { ...base, name: "渡口", region: regionName(f.region), country: "", capital: "" });
      return { title: `${slots.wanderers}的渡口`, lines: [text] };
    }
    case "branch": {
      const text = fillBlurb(b.merchantBranch, { ...base, name: slots.merchant, region: regionName(target.region), country: "", capital: "" });
      return { title: `${slots.merchant}・${regionName(target.region)}分號`, lines: [text] };
    }
    case "merchantHq":
      return { title: `${slots.merchant}總號`, lines: [fillBlurb(b.merchantHq, { ...base, name: slots.merchant, region: "", country: "", capital: "" })] };
    case "stairs":
      return { title: "殘階", lines: [data.map.stairs.text] };
    case "village":
    case "market":
    case "mountain": {
      const birthPolity = polityOf(world.birth.region);
      const name = slots[target.kind];
      const text = fillBlurb(b[target.kind], { ...base, name, region: regionName(world.birth.region), country: polityLabel(birthPolity), capital: birthPolity.capital });
      return { title: target.kind === "village" ? `${name}（出生地）` : name, lines: [text] };
    }
  }
}

/** 世局效果的一行說明：原因加上影響的物價 */
export function describeEffect(effect: WorldEffectDef, world: World, data: GameData): { reason: string; impact: string } {
  const impact = Object.entries(effect.market)
    .map(([id, mult]) => `${data.items.find((i) => i.id === id)?.name ?? id}價格 ×${mult}`)
    .join("、");
  return { reason: fillSlots(effect.reason, worldSlots(world)), impact };
}

/** 目前生效的世局效果 */
export function activeEffectsAt(snap: WorldSnapshot, data: GameData): WorldEffectDef[] {
  return data.worldEffects.filter((e) => effectApplies(snap, e));
}

/** 點選的標記對應哪一類世局效果；沒有對應時回 null */
export function mapRefOf(target: MapTarget, snap: WorldSnapshot): MapRef | null {
  switch (target.kind) {
    case "sect":
      return snap.sects.find((s) => s.id === target.id)?.kind === "guard" ? "guard" : null;
    case "ferry":
    case "market":
      return "ferry";
    case "branch":
    case "merchantHq":
      return "merchant";
    default:
      return null;
  }
}

/** 點選某個標記時，要一併標出的世局效果 */
export function effectsForTarget(target: MapTarget, snap: WorldSnapshot, data: GameData): WorldEffectDef[] {
  const ref = mapRefOf(target, snap);
  return ref === null ? [] : activeEffectsAt(snap, data).filter((e) => e.mapRef === ref);
}

/** 圖例：目前存在的國家，依顏色 */
export function legendOf(snap: WorldSnapshot): { name: string; color: string }[] {
  return snap.polities.map((p) => ({ name: polityLabel(p), color: p.color }));
}

/** 主角目前所在的世界年齡（歲）：進行中看年齡，擲骰時是起始年齡，結束後停在最後的年齡 */
export function mapAgeYears(ageMonths: number): number {
  return Math.floor(ageMonths / 12);
}

/** 當世出現過的國家：現存、原生與分裂新立的都找得到 */
export function polityLookup(world: World, snap: WorldSnapshot): (id: string) => WorldPolity | undefined {
  return (id) => snap.polities.find((p) => p.id === id)
    ?? world.polities.find((p) => p.id === id)
    ?? world.changes.flatMap((c) => (c.kind === "split" ? [c.created] : [])).find((p) => p.id === id);
}

/** 標記的類型，放在資訊卡標題旁 */
export function targetKindLabel(target: MapTarget, snap: WorldSnapshot): string {
  switch (target.kind) {
    case "territory": return "領土";
    case "region": return "地域";
    case "sect": {
      const s = snap.sects.find((x) => x.id === target.id);
      return s ? `宗門山門・${s.rank === "great" ? "大宗" : "門派"}` : "宗門山門";
    }
    case "ferry": return "渡口";
    case "market": return "坊市";
    case "village": return "出生村";
    case "mountain": return "山野";
    case "merchantHq": return "商號總號";
    case "branch": return "商號分號";
    case "stairs": return "殘階";
  }
}

const NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 推進程度的口語：0.43 → 約四成 */
export function progressWords(progress: number): string {
  const tenths = Math.min(10, Math.max(1, Math.round(progress * 10)));
  return tenths >= 10 ? "近乎底定" : `約${NUMERALS[tenths]}成`;
}

/** 領土資訊：掌握者、起算年、推進進度與預計底定、國勢 */
export function territoryLines(world: World, cells: GeoCell[], cellId: string, data: GameData, ageYears: number): string[] {
  const cell = cells.find((c) => c.id === cellId);
  if (!cell) return [];
  const snap = worldAt(world, ageYears);
  const polity = polityLookup(world, snap);
  const owner = polity(cell.ownerId);
  const name = owner ? polityLabel(owner) : "諸部";
  const history = territoryHistory(world, data, ageYears).filter((e) => e.region === cell.region);
  const last = history.at(-1);
  const lines: string[] = [];
  const fight = regionFight(cells, cell.region);
  if (fight) {
    const attacker = polity(fight.attacker);
    const rest = Math.max(1, Math.round((1 - fight.progress) * data.map.territoryRules.transitionYears));
    lines.push(`${attacker ? polityLabel(attacker) : "他國"}正向此處推進，${progressWords(fight.progress)}；預計約 ${rest} 年後底定。`);
    lines.push(`交戰期間行路與交易會受影響。`);
  } else {
    lines.push(`現由${name}掌握，${last ? `自 ${last.age} 歲起` : "本世一開始便是如此"}；邊界暫時安定。`);
  }
  // 交戰中看進攻方：被攻的一方多半已不在世局名單上
  const lead = fight ? polity(fight.attacker) : owner;
  const leadName = lead ? polityLabel(lead) : "諸部";
  const strength = polityStrength(world, ageYears, data, snap)[fight ? fight.attacker : cell.ownerId];
  if (strength) lines.push(`${leadName}國勢 ${strength.score.toFixed(1)}：持有 ${strength.regions} 處地域，興盛宗門 ${strength.prosperSects} 家${strength.recent !== 0 ? `，近年${strength.recent > 0 ? "得" : "失"}地 ${Math.abs(strength.recent)} 處` : ""}。`);
  return lines;
}

export interface TimelineEntry {
  age: number;
  note: string;
  /** 事件牽涉的地域，點選後在地圖上高亮 */
  regions: string[];
}

/** 本世到目前年齡為止的大事記，每筆帶牽涉的地域 */
export function timelineEntries(world: World, data: GameData, ageYears: number): TimelineEntry[] {
  const border = territoryHistory(world, data, ageYears);
  return world.changes.filter((c) => c.age <= ageYears && c.note).map((c) => ({
    age: c.age,
    note: c.note,
    regions: [...new Set(border.filter((e) => e.age === c.age && e.note === c.note).map((e) => e.region))],
  }));
}

/** 本世在這個地點（名稱出現在大事記裡）發生過的事 */
export function placeHistory(world: World, names: string[], ageYears: number): TimelineEntry[] {
  const keys = names.filter((n) => n.length >= 2);
  return world.changes.filter((c) => c.age <= ageYears && c.note && keys.some((n) => c.note.includes(n))).map((c) => ({ age: c.age, note: c.note, regions: [] }));
}
