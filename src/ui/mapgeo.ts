// 天下圖的繪製輔助：國界筆刷、多邊形插值、標籤避讓、方位名、縮放範圍。不碰 DOM，方便測試。
import type { Point } from "../data/types";

/** 空間上平滑的小幅位移：同一點永遠得到同樣的偏移，所以相接的線段不會斷開 */
export function brushOffset(x: number, y: number, phase: number, amp: number): Point {
  const a = phase * 0.0001;
  return [
    amp * (Math.sin(x * 0.19 + y * 0.07 + a) + 0.5 * Math.sin(y * 0.43 + a * 3)),
    amp * (Math.cos(y * 0.17 - x * 0.09 + a * 2) + 0.5 * Math.cos(x * 0.37 + a)),
  ];
}

/** 一條國界邊細分後加小幅抖動，端點也套同一個位移函式 */
export function brushLine(a: Point, b: Point, phase: number, amp = 0.7, step = 6): Point[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const [dx, dy] = brushOffset(x, y, phase, amp);
    out.push([x + dx, y + dy]);
  }
  return out;
}

/** 沿周長均勻重新取樣成 n 個頂點 */
export function resample(poly: Point[], n: number): Point[] {
  if (poly.length === 0) return [];
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const total = edges.reduce((s, e) => s + e, 0);
  if (total === 0) return Array.from({ length: n }, () => poly[0]);
  const out: Point[] = [];
  let edge = 0;
  let walked = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (edge < edges.length - 1 && walked + edges[edge] < target) {
      walked += edges[edge];
      edge++;
    }
    const p = poly[edge];
    const q = poly[(edge + 1) % poly.length];
    const t = edges[edge] === 0 ? 0 : (target - walked) / edges[edge];
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
}

/** 把 b 的起點轉到與 a 最接近，內插時才不會扭轉 */
export function alignStart(a: Point[], b: Point[]): Point[] {
  let best = 0;
  let bestCost = Infinity;
  for (let s = 0; s < b.length; s++) {
    let cost = 0;
    for (let i = 0; i < a.length; i++) {
      const p = b[(i + s) % b.length];
      cost += (a[i][0] - p[0]) ** 2 + (a[i][1] - p[1]) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return b.map((_, i) => b[(i + best) % b.length]);
}

export function lerpPoly(a: Point[], b: Point[], t: number): Point[] {
  return a.map((p, i): Point => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
}

/** 準備好兩個多邊形之間的內插：回傳 t（0..1）到頂點的函式；缺一邊時直接取另一邊 */
export function polyTween(from: Point[] | undefined, to: Point[], n = 40): (t: number) => Point[] {
  if (!from || from.length < 3 || to.length < 3) return () => to;
  const a = resample(from, n);
  const b = alignStart(a, resample(to, n));
  return (t) => (t >= 1 ? to : lerpPoly(a, b, t));
}

export interface LabelItem {
  key: string;
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle";
  /** 數字越小越優先；被選取的標籤用 0 */
  priority: number;
}

const CHAR_W = 10.5;
const CHAR_H = 11;

function labelRect(l: LabelItem): [number, number, number, number] {
  const w = [...l.text].length * CHAR_W;
  const x0 = l.anchor === "middle" ? l.x - w / 2 : l.x;
  return [x0, l.y - CHAR_H, x0 + w, l.y + 2];
}

/** 依優先度由高到低放標籤，與已放的重疊就隱藏 */
export function placeLabels(items: LabelItem[]): { shown: LabelItem[]; hidden: LabelItem[] } {
  const shown: LabelItem[] = [];
  const hidden: LabelItem[] = [];
  const rects: [number, number, number, number][] = [];
  for (const item of [...items].sort((a, b) => a.priority - b.priority)) {
    const r = labelRect(item);
    if (rects.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) {
      hidden.push(item);
      continue;
    }
    rects.push(r);
    shown.push(item);
  }
  return { shown, hidden };
}

/** 節點在地域內的方位名（北、東南、中部…）；同名時加序號 */
export function compassNames(nodes: Point[]): string[] {
  const cx = nodes.reduce((s, p) => s + p[0], 0) / nodes.length;
  const cy = nodes.reduce((s, p) => s + p[1], 0) / nodes.length;
  const raw = nodes.map((p) => {
    const dy = p[1] - cy;
    const dx = p[0] - cx;
    const v = dy < -12 ? "北" : dy > 12 ? "南" : "";
    const h = dx < -25 ? "西" : dx > 25 ? "東" : "";
    return `${h}${v}` || "腹地";
  });
  const count = new Map<string, number>();
  for (const r of raw) count.set(r, (count.get(r) ?? 0) + 1);
  const seen = new Map<string, number>();
  const digits = ["", "・二", "・三", "・四", "・五", "・六"];
  return raw.map((r) => {
    if ((count.get(r) ?? 0) < 2) return r;
    const i = seen.get(r) ?? 0;
    seen.set(r, i + 1);
    return `${r}${digits[i]}`;
  });
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 4;

/** 以 (cx, cy) 為中心把視窗縮放 factor 倍，並限制在地圖範圍內 */
export function zoomView(view: ViewBox, box: Point, cx: number, cy: number, factor: number): ViewBox {
  const scale = Math.min(MAX_ZOOM, Math.max(1, (box[0] / view.w) * factor));
  const w = box[0] / scale;
  const h = box[1] / scale;
  return clampView({ x: cx - ((cx - view.x) / view.w) * w, y: cy - ((cy - view.y) / view.h) * h, w, h }, box);
}

export function clampView(view: ViewBox, box: Point): ViewBox {
  return {
    ...view,
    x: Math.min(Math.max(0, view.x), box[0] - view.w),
    y: Math.min(Math.max(0, view.y), box[1] - view.h),
  };
}
