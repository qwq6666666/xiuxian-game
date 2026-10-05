// 旅行只使用世界快照與地域相鄰資料，不消耗亂數。
import { gameData } from "../data/load";
import type { GameData, Point } from "../data/types";
import { travelMonths } from "./formulas";
import { sectReach, territoriesAt, territoryForPoint } from "./territory";
import type { GameState, TravelState } from "./state";
import { worldAt, worldFor } from "./world";

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
  const world = worldFor(state.worldSeed, data);
  const snap = worldAt(world, Math.floor(state.ageMonths / 12));
  const region = (id: string) => data.map.regions.find((r) => r.id === id)!;
  const birth = region(world.birth.region);
  const places: TravelPlace[] = [
    { id: "village", name: world.birth.village, kind: "village", region: birth.id, point: birth.birth!.village, status: "出生地" },
    { id: "market", name: world.birth.market, kind: "market", region: birth.id, point: birth.ferries![0], status: "坊市" },
    { id: "mountain", name: world.birth.mountain, kind: "mountain", region: birth.id, point: birth.birth!.mountain, status: "山野" },
    { id: "merchantHq", name: `${world.names.merchant}總號`, kind: "merchant", region: "center", point: region("center").capital!, status: "商號" },
  ];
  for (const r of data.map.regions.filter((x) => x.land)) {
    const polity = snap.polities.find((p) => p.id === snap.owners[r.id]);
    places.push({ id: `capital:${r.id}`, name: polity?.capital ?? r.name, kind: "capital", region: r.id, point: r.capital!, status: "都城" });
  }
  for (const f of snap.ferries) {
    places.push({ id: `ferry:${f.id}`, name: `${region(f.region).name}第${f.index + 1}渡口`, kind: "ferry", region: f.region, point: region(f.region).ferries![f.index], status: f.broken ? "渡口已毀，可至舊址" : "渡口可通行" });
  }
  for (const sect of snap.sects) {
    places.push({ id: `sect:${sect.id}`, name: sect.name, kind: "sect", region: sect.region, point: region(sect.region).sites![sect.site], status: sect.state === "closed" ? "山門閉鎖，可到門外" : sect.state === "fallen" ? "宗門已毀，可訪遺址" : "宗門山門" });
  }
  for (const id of snap.merchantBranches) {
    if (id === "center") continue;
    places.push({ id: `branch:${id}`, name: `${world.names.merchant}分號`, kind: "merchant", region: id, point: region(id).capital!, status: "商號分號" });
  }
  return places;
}

export function localTerritory(state: GameState, data: GameData = gameData) {
  const place = placesAt(state, data).find((p) => p.id === state.travel.locationId);
  if (!place) return undefined;
  return territoryForPoint(territoriesAt(worldFor(state.worldSeed, data), Math.floor(state.ageMonths / 12), data), place.region, place.point);
}

export function marketTerritory(state: GameState, data: GameData = gameData) {
  const world = worldFor(state.worldSeed, data);
  const region = data.map.regions.find((r) => r.id === world.birth.region)!;
  return territoryForPoint(territoriesAt(world, Math.floor(state.ageMonths / 12), data), region.id, region.ferries![0]);
}

export function localSectInfluence(state: GameState, data: GameData = gameData): boolean {
  const place = placesAt(state, data).find((p) => p.id === state.travel.locationId);
  if (!place) return false;
  const snap = worldAt(worldFor(state.worldSeed, data), Math.floor(state.ageMonths / 12));
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
}

export function routeTo(state: GameState, targetId: string, data: GameData = gameData): TravelRoute | null {
  const places = placesAt(state, data);
  const from = places.find((p) => p.id === state.travel.locationId);
  const to = places.find((p) => p.id === targetId);
  if (!from || !to || from.id === to.id) return null;
  const regions = regionRoute(from.region, to.region, data);
  const anchors = regions.length > 1 ? regions.map((id) => data.map.regions.find((r) => r.id === id)!.capital!) : [];
  const territory = territoryForPoint(territoriesAt(worldFor(state.worldSeed, data), Math.floor(state.ageMonths / 12), data), to.region, to.point);
  const delayMonths = territory?.contested ? data.map.territoryRules.travelDelayMonths : 0;
  return { from, to, regions, points: [from.point, ...anchors, to.point], months: travelMonths(regions.length - 1) + delayMonths, delayMonths };
}

export function beginTravel(state: GameState, targetId: string, data: GameData = gameData): GameState {
  if (state.phase !== "living" || state.pendingEvent !== null || state.travel.targetId !== null) return state;
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
