// 旅行只使用世界快照與地域相鄰資料，不消耗亂數。
import { gameData } from "../../data/load";
import type { GameData, Point } from "../../data/types";
import { travelMonths } from "../formulas";
import { fiefsFor } from "./fiefs";
import { sectReach, territoriesAt, territoryAt } from "./territory";
import type { GameState, TravelState } from "../state";
import { polityLabel, worldAt, worldFor, type WorldPolity } from "./world";

export type PlaceKind = "village" | "market" | "mountain" | "capital" | "ferry" | "sect" | "merchant";

export interface TravelPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  region: string;
  point: Point;
  status: string;
}

/** 依此刻世局列出可抵達之處；閉山宗門只能到山門外。 */
export function placesAt(state: GameState, data: GameData = gameData): TravelPlace[] {
  const world = worldFor(state.worldSeed, data, state.nationCount);
  const snap = worldAt(world, Math.floor(state.ageMonths / 12));
  const region = (id: string) => data.map.regions.find((r) => r.id === id)!;
  const birth = region(world.birth.region);
  const places: TravelPlace[] = [
    { id: "village", name: world.birth.village, kind: "village", region: birth.id, point: birth.birth!.village, status: "出生地" },
    { id: "market", name: world.birth.market, kind: "market", region: birth.id, point: birth.ferries![0], status: "坊市" },
    { id: "mountain", name: world.birth.mountain, kind: "mountain", region: birth.id, point: birth.birth!.mountain, status: "山野" },
    { id: "merchantHq", name: `${world.names.merchant}總號`, kind: "merchant", region: "center", point: region("center").capital!, status: "商號" },
  ];
  // 每個國家一座都城（國都領的中心）；被併入他國的保留原有城名，標成舊都
  const fiefs = fiefsFor(world.seed, data);
  const age = Math.floor(state.ageMonths / 12);
  const known: WorldPolity[] = [...world.polities, ...world.changes.flatMap((c) => (c.kind === "split" && c.age <= age ? [c.created] : []))];
  for (const p of known) {
    const alive = snap.polities.find((x) => x.id === p.id);
    const seat = fiefs.ids.indexOf(p.seat);
    const tribal = alive?.tribal === true;
    const name = alive ? (tribal ? polityLabel(alive) : alive.capital) : p.capital ? `${p.capital}（舊都）` : `${p.name}諸部（舊地）`;
    places.push({ id: `capital:${p.id}`, name, kind: "capital", region: fiefs.region[seat], point: fiefs.points[seat], status: alive ? (tribal ? "諸部聚居地" : "都城") : "舊都" });
  }
  for (const f of snap.ferries) {
    places.push({ id: `ferry:${f.id}`, name: `${region(f.region).name}第${f.index + 1}渡口`, kind: "ferry", region: f.region, point: region(f.region).ferries![f.index], status: f.broken ? "渡口已毀，可至舊址" : "渡口可通行" });
  }
  for (const sect of snap.sects) {
    places.push({ id: `sect:${sect.id}`, name: sect.name, kind: "sect", region: sect.region, point: region(sect.region).sites![sect.site], status: sect.state === "closed" ? "山門閉鎖，可到門外" : sect.state === "fallen" ? "宗門已毀，可訪遺址" : "宗門山門" });
  }
  for (const id of snap.merchantBranches) {
    if (id === "center") continue;
    places.push({ id: `branch:${id}`, name: `${world.names.merchant}・${region(id).name}分號`, kind: "merchant", region: id, point: region(id).capital!, status: "商號分號" });
  }
  return places;
}

export function localTerritory(state: GameState, data: GameData = gameData) {
  const place = placesAt(state, data).find((p) => p.id === state.travel.locationId);
  if (!place) return undefined;
  return territoryAt(territoriesAt(worldFor(state.worldSeed, data, state.nationCount), Math.floor(state.ageMonths / 12), data), place.point);
}

/**
 * 到最近的坊市或商行要走幾個月；人就在坊市或商行則為 0。只算地域路程，不含邊境動盪與盤查（M63 運費用）。
 * 旅途中以出發點計。
 */
export function marketDistanceMonths(state: GameState, data: GameData = gameData): number {
  const places = placesAt(state, data);
  const here = places.find((p) => p.id === state.travel.locationId);
  if (!here || here.kind === "market" || here.kind === "merchant") return 0;
  let best = Infinity;
  for (const p of places) {
    if (p.kind !== "market" && p.kind !== "merchant") continue;
    best = Math.min(best, travelMonths(regionRoute(here.region, p.region, data).length - 1));
  }
  return best;
}

export function marketTerritory(state: GameState, data: GameData = gameData) {
  const world = worldFor(state.worldSeed, data, state.nationCount);
  const region = data.map.regions.find((r) => r.id === world.birth.region)!;
  return territoryAt(territoriesAt(world, Math.floor(state.ageMonths / 12), data), region.ferries![0]);
}

/**
 * 入宗者所在地的國家與自己宗門的關係（M53）：互惠、世仇或都不是。沒入宗一律回 null。
 * 國家取當時的領土歸屬（交戰中的領算還沒換主的一方）。
 */
export function placeRelation(state: GameState, point: Point, data: GameData = gameData): "ally" | "feud" | null {
  if (state.sect === null) return null;
  const world = worldFor(state.worldSeed, data, state.nationCount);
  const age = Math.floor(state.ageMonths / 12);
  const rel = worldAt(world, age).relations[state.sect.id];
  if (!rel) return null;
  const owner = territoryAt(territoriesAt(world, age, data), point).ownerId;
  return owner === rel.feud ? "feud" : owner === rel.ally ? "ally" : null;
}

export function localRelation(state: GameState, data: GameData = gameData): "ally" | "feud" | null {
  const place = placesAt(state, data).find((p) => p.id === state.travel.locationId);
  return place ? placeRelation(state, place.point, data) : null;
}

/** 出生坊市所在國與入宗者宗門的關係，影響坊市物價 */
export function marketRelation(state: GameState, data: GameData = gameData): "ally" | "feud" | null {
  const world = worldFor(state.worldSeed, data, state.nationCount);
  return placeRelation(state, data.map.regions.find((r) => r.id === world.birth.region)!.ferries![0], data);
}

export function localSectInfluence(state: GameState, data: GameData = gameData): boolean {
  const place = placesAt(state, data).find((p) => p.id === state.travel.locationId);
  if (!place) return false;
  const snap = worldAt(worldFor(state.worldSeed, data, state.nationCount), Math.floor(state.ageMonths / 12));
  return snap.sects.some((sect) => {
    const reach = sectReach(sect, data);
    if (reach === 0 || sect.region !== place.region) return false;
    const point = data.map.regions.find((r) => r.id === sect.region)!.sites![sect.site];
    return Math.hypot(place.point[0] - point[0], place.point[1] - point[1]) <= reach;
  });
}

/** 固定地域相鄰圖上的最短路徑；鄰居的資料順序決定同長度時的走法。 */
export function regionRoute(from: string, to: string, data: GameData = gameData): string[] {
  if (from === to) return [from];
  const queue = [from];
  const previous = new Map<string, string>();
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    // 同樣長的路，先取中部水陸交通，再依資料原有順序。
    const neighbors = [...(data.map.adjacency[queue[i]] ?? [])].sort((a, b) => Number(b === "center") - Number(a === "center"));
    for (const next of neighbors) {
      if (seen.has(next)) continue;
      previous.set(next, queue[i]);
      if (next === to) {
        const path = [to];
        while (path[0] !== from) path.unshift(previous.get(path[0])!);
        return path;
      }
      seen.add(next);
      queue.push(next);
    }
  }
  throw new Error(`旅行：${from} 無法通往 ${to}`);
}

export interface TravelRoute {
  from: TravelPlace;
  to: TravelPlace;
  regions: string[];
  points: Point[];
  months: number;
  delayMonths: number;
  /** 前往宗門世仇國境內的過關盤查，多出的月數（M53） */
  inspectionMonths: number;
}

export function routeTo(state: GameState, targetId: string, data: GameData = gameData): TravelRoute | null {
  const places = placesAt(state, data);
  const from = places.find((p) => p.id === state.travel.locationId);
  const to = places.find((p) => p.id === targetId);
  if (!from || !to || from.id === to.id) return null;
  const regions = regionRoute(from.region, to.region, data);
  const anchors = regions.length > 1 ? regions.map((id) => data.map.regions.find((r) => r.id === id)!.capital!) : [];
  const territory = territoryAt(territoriesAt(worldFor(state.worldSeed, data, state.nationCount), Math.floor(state.ageMonths / 12), data), to.point);
  const delayMonths = territory?.contested ? data.map.territoryRules.travelDelayMonths : 0;
  const inspectionMonths = placeRelation(state, to.point, data) === "feud" ? data.worldRelations.effects.feudTravelMonths : 0;
  return { from, to, regions, points: [from.point, ...anchors, to.point], months: travelMonths(regions.length - 1) + delayMonths + inspectionMonths, delayMonths, inspectionMonths };
}

export function beginTravel(state: GameState, targetId: string, data: GameData = gameData): GameState {
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null || state.travel.targetId !== null) return state;
  const route = routeTo(state, targetId, data);
  if (!route) return state;
  return { ...state, travel: { ...state.travel, targetId, totalMonths: route.months, remainingMonths: route.months } };
}

/** 正常遊戲月份推進時前進；離線閉關不呼叫，旅程會暫停。 */
export function advanceTravel(travel: TravelState): TravelState {
  if (travel.targetId === null) return travel;
  const remainingMonths = travel.remainingMonths - 1;
  if (remainingMonths > 0) return { ...travel, remainingMonths };
  return {
    locationId: travel.targetId,
    targetId: null,
    totalMonths: 0,
    remainingMonths: 0,
    trail: [...travel.trail, travel.targetId].slice(-80),
  };
}
