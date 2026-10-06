// 天下圖的底圖：羊皮紙、生態區色、國家色、海岸、省界與國界、河流、符號、格線與外框，全部由程式畫在 canvas 上。
// 靜態的部分（地形、海岸、河流、符號）每張地形只畫一次；國家色、靈脈光暈與國界隨季重畫。
import type { GameData, MapArtData } from "../../data/types";
import type { Provinces } from "../../core/provinces";
import type { TerritoryMap } from "../../core/frontier";
import { hashPoint } from "../../core/noise";
import type { Terrain } from "../../core/terrain";
import { mixRgb, scaleRgb, tint, type Rgb } from "./color";
import { paperCanvas } from "./paper";
import { ringsFor, type Rings } from "./rings";

/** 每個視圖單位對應的畫素數，以及外框留白（視圖單位） */
export const MAP_SCALE = 2;
export const MAP_MARGIN = 12;

export interface MapLayers {
  terrain: boolean;
  nation: boolean;
  river: boolean;
  sect: boolean;
  symbol: boolean;
  border: boolean;
  sea: boolean;
  grid: boolean;
}

export type HaloTone = "ally" | "feud" | "both" | "none";

export interface HaloDraw {
  cover: number[];
  tone: HaloTone;
}

export interface DrawInput {
  data: GameData;
  terrain: Terrain;
  provinces: Provinces;
  territory: TerritoryMap;
  /** 對應 territory.polityIds 的顏色 */
  polityColors: Rgb[];
  halos: HaloDraw[];
  layers: MapLayers;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function trace(g: CanvasRenderingContext2D, ring: Rings[number]): void {
  g.beginPath();
  ring.forEach((e, i) => {
    if (i === 0) g.moveTo(e[0][0], e[0][1]);
    for (let k = 1; k < e.length; k++) g.lineTo(e[k][0], e[k][1]);
  });
  g.closePath();
}

function strokeEdge(g: CanvasRenderingContext2D, e: Rings[number][number]): void {
  g.beginPath();
  g.moveTo(e[0][0], e[0][1]);
  for (let k = 1; k < e.length; k++) g.lineTo(e[k][0], e[k][1]);
  g.stroke();
}

function toneColor(art: MapArtData, tone: HaloTone): Rgb {
  return tone === "ally" || tone === "both" ? art.ink.gold : tone === "feud" ? art.ink.cold : art.ink.neutral;
}

type StaticLayers = { below: HTMLCanvasElement; above: HTMLCanvasElement };
const staticCache = new WeakMap<Terrain, Map<string, StaticLayers>>();

function staticLayers(input: DrawInput): StaticLayers {
  const { terrain, layers } = input;
  const key = [layers.terrain, layers.river, layers.symbol, layers.sea, layers.grid].join("|");
  let byKey = staticCache.get(terrain);
  if (!byKey) staticCache.set(terrain, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const value = { below: drawBelow(input), above: drawAbove(input) };
  byKey.set(key, value);
  return value;
}

function sizeOf(terrain: Terrain): [number, number] {
  const [w, h] = terrain.grid.size;
  return [Math.round((w + 2 * MAP_MARGIN) * MAP_SCALE), Math.round((h + 2 * MAP_MARGIN) * MAP_SCALE)];
}

/** 底層：羊皮紙、近海暈染、生態區色加光影、格線 */
function drawBelow(input: DrawInput): HTMLCanvasElement {
  const { data, terrain, layers } = input;
  const art = data.mapart;
  const [cw, ch] = sizeOf(terrain);
  const canvas = newCanvas(cw, ch);
  const g = canvas.getContext("2d")!;
  g.drawImage(paperCanvas(cw, ch, art.parchment), 0, 0);
  g.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, MAP_MARGIN * MAP_SCALE, MAP_MARGIN * MAP_SCALE);
  g.lineJoin = "round";
  g.lineCap = "round";
  const rings = ringsFor(terrain);
  const { cells } = terrain.grid;
  for (const c of cells) {
    if (terrain.land[c.id] || terrain.ds[c.id] < 1 || terrain.ds[c.id] > 2) continue;
    trace(g, rings[c.id]);
    g.fillStyle = tint(art.ink.seaWash, terrain.ds[c.id] === 1 ? 0.22 : 0.1);
    g.fill();
  }
  for (const c of cells) {
    if (!terrain.land[c.id]) continue;
    let col: Rgb = layers.terrain ? art.biomes[terrain.biome[c.id]].color : art.ink.land;
    const shade = layers.terrain ? terrain.shade[c.id] * 0.55 : 0;
    const jitter = (hashPoint(c.x, c.y, 9) - 0.5) * 0.025;
    col = mixRgb(scaleRgb(col, 1 + shade + jitter), art.parchment, 0.1);
    if (terrain.lake[c.id]) col = art.ink.lake;
    trace(g, rings[c.id]);
    g.fillStyle = tint(col);
    g.fill();
    g.lineWidth = 0.45;
    g.strokeStyle = tint(col);
    g.stroke();
  }
  if (layers.grid) {
    const [w, h] = terrain.grid.size;
    g.strokeStyle = tint(art.ink.grid, 0.22);
    g.lineWidth = 0.5;
    g.beginPath();
    for (let x = 0; x <= w; x += 40) {
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += 40) {
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke();
  }
  return canvas;
}

/** 上層：淺海虛線、海岸、河流、符號、外框與刻度 */
function drawAbove(input: DrawInput): HTMLCanvasElement {
  const { data, terrain, layers } = input;
  const art = data.mapart;
  const [cw, ch] = sizeOf(terrain);
  const canvas = newCanvas(cw, ch);
  const g = canvas.getContext("2d")!;
  g.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, MAP_MARGIN * MAP_SCALE, MAP_MARGIN * MAP_SCALE);
  g.lineJoin = "round";
  g.lineCap = "round";
  const rings = ringsFor(terrain);
  const { cells } = terrain.grid;
  if (layers.sea) {
    g.setLineDash([3, 2.5]);
    for (const [k, alpha, width] of [[2, 0.55, 0.6], [4, 0.28, 0.5]] as const) {
      g.strokeStyle = tint(art.ink.shallow, alpha);
      g.lineWidth = width;
      for (const c of cells) {
        if (terrain.land[c.id] || terrain.ds[c.id] !== k) continue;
        c.nbEdge.forEach((n, i) => {
          if (n >= 0 && !terrain.land[n] && terrain.ds[n] === k + 1) strokeEdge(g, rings[c.id][i]);
        });
      }
    }
    g.setLineDash([]);
  }
  g.strokeStyle = tint(art.ink.coast, 0.9);
  g.lineWidth = 0.85;
  for (const c of cells) {
    if (!terrain.land[c.id]) continue;
    c.nbEdge.forEach((n, i) => {
      if (n >= 0 && !terrain.land[n]) strokeEdge(g, rings[c.id][i]);
    });
  }
  if (layers.river) {
    g.strokeStyle = tint(art.ink.river, 0.92);
    for (const c of cells) {
      const a = terrain.acc[c.id];
      const j = terrain.dir[c.id];
      if (!terrain.land[c.id] || a < art.river.minAccumulation || j < 0) continue;
      const d = cells[j];
      const mx = (c.x + d.x) / 2;
      const my = (c.y + d.y) / 2;
      const off = (hashPoint(c.x, c.y, 55) - 0.5) * 0.7;
      g.lineWidth = Math.min(1.6, Math.max(0.3, 0.25 + Math.sqrt(a) * 0.05));
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.quadraticCurveTo(mx - (d.y - c.y) * off, my + (d.x - c.x) * off, d.x, d.y);
      g.stroke();
    }
  }
  if (layers.symbol) drawSymbols(g, input);
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawFrame(g, input);
  return canvas;
}

/** 每格最多一個符號；密度與種類由生態區決定 */
function drawSymbols(g: CanvasRenderingContext2D, input: DrawInput): void {
  const { data, terrain } = input;
  const ink = data.mapart.ink;
  g.lineWidth = 0.55;
  for (const c of terrain.grid.cells) {
    if (!terrain.land[c.id] || terrain.lake[c.id] || terrain.dl[c.id] < 1) continue;
    const e = terrain.E[c.id];
    const b = terrain.biome[c.id];
    const roll = hashPoint(c.x, c.y, 12);
    const x = c.x + (hashPoint(c.x, c.y, 13) - 0.5) * 2;
    const y = c.y + (hashPoint(c.x, c.y, 14) - 0.5) * 2;
    if (b === 3 || b === 4 || (b === 0 && e > 0.62)) {
      if (roll > 0.55) continue;
      const s = 1.5 + (e - 0.55) * 3;
      g.strokeStyle = tint(ink.symbol, 0.8);
      g.beginPath();
      g.moveTo(x - s, y + s * 0.7);
      g.lineTo(x, y - s * 0.9);
      g.lineTo(x + s, y + s * 0.7);
      g.stroke();
    } else if (b === 5) {
      if (roll > 0.2) continue;
      g.strokeStyle = tint(ink.hill, 0.45);
      g.beginPath();
      g.arc(x, y + 1, 2.5, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else if (b === 2) {
      if (roll > 0.6) continue;
      const s = 1.1;
      g.strokeStyle = tint(ink.forest, 0.8);
      g.beginPath();
      g.moveTo(x, y - s * 1.6);
      g.lineTo(x - s, y + s);
      g.lineTo(x + s, y + s);
      g.closePath();
      g.stroke();
    } else if (b === 6 || b === 10) {
      if (roll > 0.45) continue;
      const s = 1.4;
      g.strokeStyle = tint(b === 10 ? ink.jungle : ink.leaf, 0.8);
      g.beginPath();
      g.arc(x, y - s * 0.4, s, 0, Math.PI * 2);
      g.moveTo(x, y + s * 0.6);
      g.lineTo(x, y + s * 1.7);
      g.stroke();
    } else if (b === 7 || b === 8) {
      if (roll > 0.3) continue;
      g.strokeStyle = tint(ink.grass, 0.65);
      g.beginPath();
      g.moveTo(x - 1.5, y + 1);
      g.lineTo(x - 1, y - 1);
      g.moveTo(x, y + 1);
      g.lineTo(x, y - 1.5);
      g.moveTo(x + 1.5, y + 1);
      g.lineTo(x + 1, y - 1);
      g.stroke();
    } else if (b === 11) {
      if (roll > 0.5) continue;
      g.strokeStyle = tint(ink.reed, 0.8);
      g.beginPath();
      g.moveTo(x - 2, y + 1);
      g.lineTo(x + 2, y + 1);
      g.moveTo(x - 0.5, y + 1);
      g.lineTo(x - 0.5, y - 1.5);
      g.stroke();
    } else if (b === 0) {
      if (roll > 0.4) continue;
      g.fillStyle = tint(ink.snow, 0.9);
      g.fillRect(x, y, 1, 1);
    } else if (b === 9) {
      if (roll > 0.3) continue;
      g.strokeStyle = tint(ink.sand, 0.5);
      g.beginPath();
      g.arc(x, y, 2.5, Math.PI, 0);
      g.stroke();
    }
  }
}

/** 外框與經緯刻度（畫素座標） */
function drawFrame(g: CanvasRenderingContext2D, input: DrawInput): void {
  const { data, terrain } = input;
  const ink = data.mapart.ink;
  const [w, h] = terrain.grid.size;
  const m = MAP_MARGIN * MAP_SCALE;
  const ow = w * MAP_SCALE;
  const oh = h * MAP_SCALE;
  g.strokeStyle = tint(ink.frame, 0.9);
  g.lineWidth = 2;
  g.strokeRect(m, m, ow, oh);
  g.lineWidth = 1;
  g.strokeRect(m - 7, m - 7, ow + 14, oh + 14);
  g.strokeRect(m - 11, m - 11, ow + 22, oh + 22);
  g.fillStyle = tint(ink.label, 0.8);
  g.font = "10px serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let x = 0; x <= ow; x += 80) {
    const v = `${(-90 + (x / ow) * 180).toFixed(1)}°`;
    g.fillText(v, m + x, 8);
    g.fillText(v, m + x, oh + 2 * m - 8);
  }
  for (let y = 0; y <= oh; y += 80) {
    const v = `${(47 - (y / oh) * 94).toFixed(1)}°`;
    for (const [tx, rot] of [[8, -Math.PI / 2], [ow + 2 * m - 8, Math.PI / 2]] as const) {
      g.save();
      g.translate(tx, m + y);
      g.rotate(rot);
      g.fillText(v, 0, 0);
      g.restore();
    }
  }
}

/** 畫出整張底圖（回傳新的 canvas）；靜態層來自快取，國家與國界隨 territory 重畫 */
export function drawMapCanvas(input: DrawInput): HTMLCanvasElement {
  const { data, terrain, provinces, territory, polityColors, halos, layers } = input;
  const art = data.mapart;
  const [cw, ch] = sizeOf(terrain);
  const out = newCanvas(cw, ch);
  const g = out.getContext("2d")!;
  const stat = staticLayers(input);
  g.drawImage(stat.below, 0, 0);
  g.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, MAP_MARGIN * MAP_SCALE, MAP_MARGIN * MAP_SCALE);
  g.lineJoin = "round";
  g.lineCap = "round";
  const rings = ringsFor(terrain);
  const { cells } = terrain.grid;
  if (layers.nation) {
    for (const c of cells) {
      const o = territory.owner[c.id];
      if (o < 0 || terrain.lake[c.id]) continue;
      trace(g, rings[c.id]);
      const alpha = layers.terrain ? 0.7 : 0.85;
      g.fillStyle = tint(polityColors[o] ?? art.ink.land, alpha);
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = tint(polityColors[o] ?? art.ink.land, alpha);
      g.stroke();
    }
  }
  if (layers.sect) {
    for (const h of halos) {
      const base = toneColor(art, h.tone);
      const set = new Set(h.cover);
      for (const id of h.cover) {
        trace(g, rings[id]);
        g.fillStyle = tint(base, 0.14);
        g.fill();
      }
      g.lineWidth = 1;
      for (const id of h.cover) {
        cells[id].nbEdge.forEach((n, i) => {
          if (n >= 0 && set.has(n)) return;
          const mixed = h.tone === "both" ? ((id + i) % 2 === 0 ? art.ink.gold : art.ink.cold) : base;
          g.strokeStyle = tint(mixed, 0.85);
          g.setLineDash(h.tone === "feud" ? [2.5, 2] : []);
          strokeEdge(g, rings[id][i]);
        });
      }
      g.setLineDash([]);
    }
  }
  if (layers.border) {
    for (const c of cells) {
      if (!terrain.land[c.id]) continue;
      c.nbEdge.forEach((n, i) => {
        if (n <= c.id || !terrain.land[n]) return;
        if (territory.owner[n] !== territory.owner[c.id]) {
          g.strokeStyle = tint(art.ink.border, 0.85);
          g.lineWidth = 1.05;
          strokeEdge(g, rings[c.id][i]);
        } else if (provinces.of[n] !== provinces.of[c.id]) {
          g.strokeStyle = tint(art.ink.province, 0.35);
          g.lineWidth = 0.45;
          strokeEdge(g, rings[c.id][i]);
        }
      });
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(stat.above, 0, 0);
  return out;
}

/** 國名的位置：該國格的重心，落在別國時改取最近的自家格 */
export function polityAnchors(terrain: Terrain, territory: TerritoryMap): { index: number; x: number; y: number; cells: number }[] {
  const n = territory.polityIds.length;
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const count = new Float64Array(n);
  for (const c of terrain.grid.cells) {
    const o = territory.owner[c.id];
    if (o < 0) continue;
    sx[o] += c.x;
    sy[o] += c.y;
    count[o]++;
  }
  const out: { index: number; x: number; y: number; cells: number }[] = [];
  for (let k = 0; k < n; k++) {
    if (!count[k]) continue;
    const cx = sx[k] / count[k];
    const cy = sy[k] / count[k];
    let best = -1;
    let bd = Infinity;
    for (const c of terrain.grid.cells) {
      if (territory.owner[c.id] !== k) continue;
      const q = (c.x - cx) ** 2 + (c.y - cy) ** 2;
      if (q < bd) {
        bd = q;
        best = c.id;
      }
    }
    out.push({ index: k, x: terrain.grid.cells[best].x, y: terrain.grid.cells[best].y, cells: count[k] });
  }
  return out;
}
