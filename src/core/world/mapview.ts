// 邏輯座標（map.json，判定用）與顯示座標（橫向版面）的固定線性轉換。
// 轉換不是等比例的，所以距離一律先換回邏輯座標再比較。
import type { MapData, Point } from "../../data/types";

export function toView(map: MapData, p: Point): Point {
  return [p[0] * map.view.scale[0], p[1] * map.view.scale[1]];
}

export function fromView(map: MapData, p: Point): Point {
  return [p[0] / map.view.scale[0], p[1] / map.view.scale[1]];
}

/** 兩個顯示座標在邏輯座標上的距離（宗門靈脈半徑等判定用的長度都在邏輯座標） */
export function logicalDistance(map: MapData, a: Point, b: Point): number {
  const [ax, ay] = fromView(map, a);
  const [bx, by] = fromView(map, b);
  return Math.hypot(ax - bx, ay - by);
}
