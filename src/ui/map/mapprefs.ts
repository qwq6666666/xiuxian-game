// 天下圖的顯示偏好（圖層、省數、靈脈畫法）：只存在瀏覽器，不進遊戲存檔。
import type { GameData } from "../../data/types";
import type { HaloMode } from "./mapart/halo";
import type { MapLayers } from "./mapart/draw";

const KEY = "xiuxian-map-prefs";

export interface MapPrefs {
  layers: MapLayers;
  provinces: number;
  halo: HaloMode;
}

export const DEFAULT_LAYERS: MapLayers = { terrain: true, nation: true, river: true, sect: true, symbol: true, border: true, sea: true, grid: true };

let cache: MapPrefs | null = null;

export function readMapPrefs(data: GameData): MapPrefs {
  if (cache) return cache;
  const base: MapPrefs = { layers: { ...DEFAULT_LAYERS }, provinces: data.mapart.provinces.count, halo: "aura" };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<MapPrefs> | null;
    if (raw && typeof raw === "object") {
      if (raw.layers && typeof raw.layers === "object") for (const k of Object.keys(DEFAULT_LAYERS) as (keyof MapLayers)[]) if (typeof raw.layers[k] === "boolean") base.layers[k] = raw.layers[k];
      if (typeof raw.provinces === "number") base.provinces = Math.min(data.mapart.provinces.max, Math.max(data.mapart.provinces.min, Math.round(raw.provinces)));
      if (raw.halo === "aura" || raw.halo === "circle" || raw.halo === "province") base.halo = raw.halo;
    }
  } catch {
    // 讀不到就用預設
  }
  cache = base;
  return base;
}

export function writeMapPrefs(prefs: MapPrefs): void {
  cache = prefs;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 無法記住也沒關係，下次開啟用預設
  }
}
