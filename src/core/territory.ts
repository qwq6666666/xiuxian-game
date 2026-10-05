// 領土由既有世局推算；不另存檔，也不消耗角色亂數。
import type { GameData, Point } from "../data/types";
import type { World, WorldChange, WorldSect } from "./world";

export interface Territory {
  id: string;
  region: string;
  index: number;
  center: Point;
  polygon: Point[];
  ownerId: string;
  contested: boolean;
}

let territoryMemo: { world: World; age: number; data: GameData; value: Territory[] } | null = null;

/** 將地圖矩形沿中心點的垂直平分線裁切，顯示時再裁進地域輪廓。 */
export function territoryPolygon(center: Point, others: Point[], box: Point): Point[] {
  let polygon: Point[] = [[0, 0], [box[0], 0], [box[0], box[1]], [0, box[1]]];
  for (const other of others) {
    const a = 2 * (other[0] - center[0]);
    const b = 2 * (other[1] - center[1]);
    const c = other[0] ** 2 + other[1] ** 2 - center[0] ** 2 - center[1] ** 2;
    const next: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const from = polygon[i];
      const to = polygon[(i + 1) % polygon.length];
      const f = a * from[0] + b * from[1] - c;
      const t = a * to[0] + b * to[1] - c;
      if (f <= 0) next.push(from);
      if ((f < 0 && t > 0) || (f > 0 && t < 0)) {
        const ratio = f / (f - t);
        next.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
      }
    }
    polygon = next;
  }
  return polygon;
}

function changedRegions(change: WorldChange, owners: Record<string, string>): string[] {
  if (change.kind === "owner" || change.kind === "split") return [change.region];
  if (change.kind === "merge") return Object.keys(owners).filter((r) => owners[r] === change.from);
  return [];
}

/** 國家變化由邊界逐步推進；規定年數過後，整處地域才完全換色。 */
export function territoriesAt(world: World, age: number, data: GameData): Territory[] {
  if (territoryMemo && territoryMemo.world === world && territoryMemo.age === age && territoryMemo.data === data) return territoryMemo.value;
  const owners = { ...world.owners };
  const claims = new Map<string, { ownerId: string; contested: boolean }>();
  for (const region of data.map.regions.filter((r) => r.land)) {
    region.territories!.forEach((_, index) => claims.set(`${region.id}:${index}`, { ownerId: owners[region.id], contested: false }));
  }
  for (const change of world.changes) {
    if (change.age > age) break;
    const regions = changedRegions(change, owners);
    for (const region of regions) {
      const to = change.kind === "merge" ? change.to : change.kind === "split" ? change.created.id : change.kind === "owner" ? change.to : owners[region];
      const count = data.map.regions.find((r) => r.id === region)!.territories!.length;
      const elapsed = age - change.age;
      const gained = Math.min(count, 1 + Math.floor((elapsed * (count - 1)) / data.map.territoryRules.transitionYears));
      for (let i = 0; i < count; i++) claims.set(`${region}:${i}`, { ownerId: i < gained ? to : owners[region], contested: gained < count && (i === gained - 1 || i === gained) });
      owners[region] = to;
    }
  }
  const value = data.map.regions.filter((r) => r.land).flatMap((region) => region.territories!.map((center, index) => ({
    id: `${region.id}:${index}`, region: region.id, index, center,
    polygon: territoryPolygon(center, region.territories!.filter((_, i) => i !== index), data.map.viewBox),
    ...claims.get(`${region.id}:${index}`)!,
  })));
  territoryMemo = { world, age, data, value };
  return value;
}

export function territoryForPoint(territories: Territory[], region: string, point: Point): Territory | undefined {
  return territories.filter((t) => t.region === region).sort((a, b) =>
    Math.hypot(a.center[0] - point[0], a.center[1] - point[1]) - Math.hypot(b.center[0] - point[0], b.center[1] - point[1]))[0];
}

/** 宗門影響靈脈而非凡俗疆土；閉山與覆滅時範圍消失。 */
export function sectReach(sect: WorldSect, data: GameData): number {
  if (sect.state === "closed" || sect.state === "fallen") return 0;
  const rank = sect.rank === "great" ? data.map.territoryRules.greatReach : data.map.territoryRules.schoolReach;
  return sect.state === "prosper" ? rank * data.map.territoryRules.prosperReachMultiplier : sect.state === "decline" ? rank * data.map.territoryRules.declineReachMultiplier : rank;
}
