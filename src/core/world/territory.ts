// 領土由既有世局推算；不另存檔，也不消耗角色亂數。
// 以「領」為單位（M51）：國家由領組成，易手時依「離進攻方最近」的順序逐領換主。
import type { GameData, Point } from "../../data/types";
import { fiefDistance, fiefsFor, type Fiefs } from "./fiefs";
import { clamp } from "../util/noise";
import type { World, WorldChange, WorldSect } from "./world";

export interface Territory {
  id: string;
  /** 領的索引 */
  fief: number;
  region: string;
  center: Point;
  ownerId: string;
  contested: boolean;
}

let territoryMemo: { world: World; age: number; data: GameData; value: Territory[] } | null = null;

/** 一次變化的接收方；沒有領易手的變化回傳 null */
export function changeTarget(change: WorldChange): string | null {
  if (change.kind === "owner" || change.kind === "merge") return change.to;
  if (change.kind === "split") return change.created.id;
  return null;
}

/**
 * 這次變化牽涉的領，依換主順序排列：離進攻方（接收方）現有的領最近的先換；
 * 分裂則從新國的國都領向外。owners 是變化發生前的歸屬。
 */
export function changeFiefs(fiefs: Fiefs, change: WorldChange, owners: Record<string, string>): number[] {
  const to = changeTarget(change);
  if (to === null) return [];
  const set: number[] =
    change.kind === "merge"
      ? fiefs.ids.map((_, i) => i).filter((i) => owners[fiefs.ids[i]] === change.from)
      : change.kind === "split" || change.kind === "owner"
        ? change.fiefs.map((id) => fiefs.ids.indexOf(id)).filter((i) => i >= 0)
        : [];
  const refs: number[] =
    change.kind === "split"
      ? [fiefs.ids.indexOf(change.created.seat)]
      : fiefs.ids.map((_, i) => i).filter((i) => owners[fiefs.ids[i]] === to && !set.includes(i));
  if (change.kind === "owner") return set;
  if (refs.length === 0) return set.sort((a, b) => a - b);
  const far = (i: number): number => Math.min(...refs.map((r) => fiefDistance(fiefs, i, r)));
  return set.map((i) => ({ i, d: far(i) })).sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.i);
}

/** 國家變化由邊界逐步推進；規定年數過後，整批領才完全換色。 */
export function territoriesAt(world: World, age: number, data: GameData): Territory[] {
  if (territoryMemo && territoryMemo.world === world && territoryMemo.age === age && territoryMemo.data === data) return territoryMemo.value;
  const fiefs = fiefsFor(world.seed, data);
  const owners = { ...world.owners };
  const claims = fiefs.ids.map((id) => ({ ownerId: owners[id], contested: false }));
  for (const change of world.changes) {
    if (change.age > age) break;
    const to = changeTarget(change);
    if (to === null) continue;
    const order = changeFiefs(fiefs, change, owners);
    const count = order.length;
    const p = clamp((age - change.age) / data.map.territoryRules.transitionYears, 0, 1);
    const gained = p >= 1 ? count : Math.floor(p * count);
    order.forEach((fief, k) => {
      claims[fief] = { ownerId: k < gained ? to : owners[fiefs.ids[fief]], contested: p < 1 && k === gained };
    });
    for (const fief of order) owners[fiefs.ids[fief]] = to;
  }
  const value = fiefs.ids.map((id, i) => ({ id, fief: i, region: fiefs.region[i], center: fiefs.points[i], ...claims[i] }));
  territoryMemo = { world, age, data, value };
  return value;
}

/** 離某點（邏輯座標）最近的領 */
export function territoryAt(territories: Territory[], point: Point): Territory {
  let best = territories[0];
  let bd = Infinity;
  for (const t of territories) {
    const d = (t.center[0] - point[0]) ** 2 + (t.center[1] - point[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** 宗門影響靈脈而非凡俗疆土；閉山與覆滅時範圍消失。 */
export function sectReach(sect: WorldSect, data: GameData): number {
  if (sect.state === "closed" || sect.state === "fallen") return 0;
  const rank = sect.rank === "great" ? data.map.territoryRules.greatReach : data.map.territoryRules.schoolReach;
  return sect.state === "prosper" ? rank * data.map.territoryRules.prosperReachMultiplier : sect.state === "decline" ? rank * data.map.territoryRules.declineReachMultiplier : rank;
}
