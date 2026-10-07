// 維諾格網：抖動方格撒點，每格只和附近 24 格比較，切出維諾多邊形並記下鄰格。
// 顯示座標下的純函式，不碰 DOM；種子由呼叫端用 deriveSeed 給，不消耗 rngSeed。
import type { Point } from "../../data/types";
import { seededRandom } from "../util/noise";

export interface Cell {
  id: number;
  x: number;
  y: number;
  poly: Point[];
  /** 與 poly 每條邊對應的鄰格 id；-1 是地圖外框 */
  nbEdge: number[];
  /** 不重複的鄰格 */
  nb: number[];
}

export interface CellGrid {
  cells: Cell[];
  /** 格與格的平均間距 */
  spacing: number;
  size: Point;
  /** 以座標找最近的格（不在範圍內回傳 -1） */
  locate(x: number, y: number): number;
}

interface Vertex {
  x: number;
  y: number;
  l: number;
}

function clip(poly: Vertex[], a: number, b: number, c: number, label: number): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = a * p.x + b * p.y - c;
    const t = a * q.x + b * q.y - c;
    if (f <= 0) {
      out.push({ x: p.x, y: p.y, l: f === 0 && t > 0 ? label : p.l });
      if (f < 0 && t > 0) {
        const r = f / (f - t);
        out.push({ x: p.x + (q.x - p.x) * r, y: p.y + (q.y - p.y) * r, l: label });
      }
    } else if (t < 0) {
      const r = f / (f - t);
      out.push({ x: p.x + (q.x - p.x) * r, y: p.y + (q.y - p.y) * r, l: p.l });
    }
  }
  return out;
}

export function genCells(seed: number, count: number, size: Point, jitter: number): CellGrid {
  const [W, H] = size;
  const d = Math.sqrt((W * H) / count);
  const cols = Math.ceil(W / d) + 2;
  const rows = Math.ceil(H / d) + 2;
  const rand = seededRandom(seed);
  const sites: [number, number][] = [];
  const lattice = new Int32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      lattice[j * cols + i] = sites.length;
      sites.push([(i - 1 + 0.5 + (rand() - 0.5) * jitter) * d, (j - 1 + 0.5 + (rand() - 0.5) * jitter) * d]);
    }
  }
  const idOfSite = new Int32Array(sites.length).fill(-1);
  const cells: Cell[] = [];
  const rawLabels: number[][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const si = lattice[j * cols + i];
      const [sx, sy] = sites[si];
      if (sx < -d || sy < -d || sx > W + d || sy > H + d) continue;
      let poly: Vertex[] = [
        { x: sx - 2.4 * d, y: sy - 2.4 * d, l: -1 }, { x: sx + 2.4 * d, y: sy - 2.4 * d, l: -1 },
        { x: sx + 2.4 * d, y: sy + 2.4 * d, l: -1 }, { x: sx - 2.4 * d, y: sy + 2.4 * d, l: -1 },
      ];
      for (let jj = j - 2; jj <= j + 2 && poly.length > 0; jj++) {
        for (let ii = i - 2; ii <= i + 2; ii++) {
          if ((ii === i && jj === j) || ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
          const o = lattice[jj * cols + ii];
          const [ox, oy] = sites[o];
          poly = clip(poly, 2 * (ox - sx), 2 * (oy - sy), ox * ox + oy * oy - sx * sx - sy * sy, o);
          if (poly.length === 0) break;
        }
      }
      if (poly.length === 0) continue;
      poly = clip(poly, -1, 0, 0, -1);
      poly = clip(poly, 1, 0, W, -1);
      poly = clip(poly, 0, -1, 0, -1);
      poly = clip(poly, 0, 1, H, -1);
      if (poly.length < 3) continue;
      idOfSite[si] = cells.length;
      rawLabels.push(poly.map((v) => v.l));
      cells.push({ id: cells.length, x: sx, y: sy, poly: poly.map((v): Point => [v.x, v.y]), nbEdge: [], nb: [] });
    }
  }
  cells.forEach((c, k) => {
    c.nbEdge = rawLabels[k].map((l) => (l >= 0 ? idOfSite[l] : -1));
    c.nb = [...new Set(c.nbEdge.filter((n) => n >= 0))];
  });
  const locate = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x > W || y > H) return -1;
    const i0 = Math.floor(x / d) + 1;
    const j0 = Math.floor(y / d) + 1;
    let best = -1;
    let bd = Infinity;
    for (let jj = j0 - 1; jj <= j0 + 1; jj++) {
      for (let ii = i0 - 1; ii <= i0 + 1; ii++) {
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const id = idOfSite[lattice[jj * cols + ii]];
        if (id < 0) continue;
        const q = (cells[id].x - x) ** 2 + (cells[id].y - y) ** 2;
        if (q < bd) {
          bd = q;
          best = id;
        }
      }
    }
    return best;
  };
  return { cells, spacing: d, size, locate };
}
