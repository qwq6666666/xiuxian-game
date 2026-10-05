// 天下圖的純邏輯：點選某個標記時顯示什麼、標記該畫成什麼樣子。不碰 DOM，方便測試。
import type { World, WorldSect, WorldSnapshot } from "../core/world";
import { polityLabel, worldSlots } from "../core/world";
import { fillSlots } from "../data/slots";
import type { GameData, MapRef, WorldEffectDef } from "../data/types";
import { effectApplies } from "../core/worldeffects";

export type MapTarget =
  | { kind: "region"; id: string }
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
      return { title: `${slots.merchant}分號`, lines: [text] };
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
      return { title: target.kind === "village" ? `${name}（你在這裡）` : name, lines: [text] };
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
