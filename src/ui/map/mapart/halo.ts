// 宗門靈脈範圍：以格為單位。半徑就是判定用的半徑（邏輯座標），有機光暈只在邊緣加雜訊、山脊方向收縮。
import type { GameData, Point } from "../../../data/types";
import { fromView, toView } from "../../../core/world/mapview";
import { clamp } from "../../../core/util/noise";
import type { Provinces } from "../../../core/world/provinces";
import type { Terrain } from "../../../core/world/terrain";

export type HaloMode = "aura" | "circle" | "province";

/** point 是邏輯座標，reach 是邏輯半徑；回傳範圍內的陸地格 id */
export function sectCover(terrain: Terrain, provinces: Provinces, data: GameData, point: Point, reach: number, mode: HaloMode): number[] {
  if (reach <= 0) return [];
  const { cells } = terrain.grid;
  const dist = (id: number): number => {
    const [x, y] = fromView(data.map, [cells[id].x, cells[id].y]);
    return Math.hypot(x - point[0], y - point[1]);
  };
  const out: number[] = [];
  if (mode === "province") {
    const covered = new Set<number>();
    provinces.seeds.forEach((seed, i) => {
      if (dist(seed) <= reach) covered.add(i);
    });
    for (const c of cells) if (terrain.land[c.id] && covered.has(provinces.of[c.id])) out.push(c.id);
    return out;
  }
  const home = terrain.grid.locate(...toView(data.map, point));
  const homeE = home >= 0 ? terrain.E[home] : 0;
  for (const c of cells) {
    if (!terrain.land[c.id]) continue;
    const limit = mode === "circle" ? reach : reach * (0.8 + 0.55 * terrain.hn[c.id]) * (1 - clamp((terrain.E[c.id] - homeE) * 0.55, 0, 0.32));
    if (dist(c.id) <= limit) out.push(c.id);
  }
  return out;
}
