// 地域輪廓（SVG path）的幾何：攤平成多邊形、點是否在內、到聯集邊界的有符號距離。
// 不用 DOM、不用 Canvas，核心才能在沒有瀏覽器時跑。只支援 M、C、L、Z（絕對座標），其他指令直接報錯。
import type { Point } from "../data/types";

const CURVE_STEPS = 12;

/** 把一條 path（單一封閉輪廓）攤平成頂點列 */
export function flattenPath(d: string): Point[] {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
  if (!tokens) throw new Error(`地域輪廓 path 讀不出內容：${d.slice(0, 40)}`);
  const pts: Point[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = [0, 0];
  const num = (): number => {
    const n = Number(tokens[i++]);
    if (!Number.isFinite(n)) throw new Error(`地域輪廓 path 格式錯誤：${d.slice(0, 40)}`);
    return n;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (!"MCLZ".includes(cmd)) throw new Error(`地域輪廓 path 只支援 M、C、L、Z，遇到 ${cmd}`);
    }
    if (cmd === "Z") break;
    if (cmd === "M" || cmd === "L") {
      cur = [num(), num()];
      pts.push(cur);
    } else if (cmd === "C") {
      const p1: Point = [num(), num()];
      const p2: Point = [num(), num()];
      const p3: Point = [num(), num()];
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS;
        const u = 1 - t;
        pts.push([
          u ** 3 * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
          u ** 3 * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ]);
      }
      cur = p3;
    } else {
      throw new Error(`地域輪廓 path 在指令前缺少 M：${d.slice(0, 40)}`);
    }
  }
  return pts;
}

export function pointInPolygon(poly: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/** 多個輪廓的聯集：只保留真正的外緣（相鄰地域共用的邊不算） */
export class Outline {
  private readonly edges: [Point, Point][] = [];

  constructor(readonly polygons: Point[][]) {
    for (const poly of polygons) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len === 0) continue;
        // 邊的兩側各取一點：恰好一側在聯集內，才是外緣
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const nx = (-(b[1] - a[1]) / len) * 0.6;
        const ny = ((b[0] - a[0]) / len) * 0.6;
        if (this.contains([mx + nx, my + ny]) !== this.contains([mx - nx, my - ny])) this.edges.push([a, b]);
      }
    }
  }

  contains(p: Point): boolean {
    return this.polygons.some((poly) => pointInPolygon(poly, p));
  }

  /** 在聯集內為正、在外為負，大小是到外緣的距離 */
  signedDistance(p: Point): number {
    let best = Infinity;
    for (const [a, b] of this.edges) best = Math.min(best, segmentDistance(p, a, b));
    return this.contains(p) ? best : -best;
  }
}

/** 點到多邊形邊的最短距離（用來把輪廓外的島嶼歸給最近的地域） */
export function distanceToPolygon(poly: Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}
