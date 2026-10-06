// 手機寬度的縮放與拖曳：對地圖容器做 CSS 平移加縮放（畫布與 SVG 一起動）。
// 雙指縮放、拖曳平移、雙擊放大；範圍限制在地圖內。只改顯示。
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 4;

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/** 平移限制：縮放後的地圖永遠蓋滿視窗 */
export function clampZoom(z: ZoomState, w: number, h: number): ZoomState {
  const scale = Math.min(MAX_ZOOM, Math.max(1, z.scale));
  return { scale, x: Math.min(0, Math.max(w - w * scale, z.x)), y: Math.min(0, Math.max(h - h * scale, z.y)) };
}

/** 以視窗內的 (px, py) 為不動點縮放 factor 倍 */
export function zoomAt(z: ZoomState, w: number, h: number, px: number, py: number, factor: number): ZoomState {
  const scale = Math.min(MAX_ZOOM, Math.max(1, z.scale * factor));
  const k = scale / z.scale;
  return clampZoom({ scale, x: px - (px - z.x) * k, y: py - (py - z.y) * k }, w, h);
}

let current: ZoomState = IDENTITY;

export const currentZoom = (): ZoomState => current;
export const resetZoom = (): void => {
  current = IDENTITY;
};

export function applyZoom(stage: HTMLElement, z: ZoomState): void {
  current = z;
  stage.style.transform = z.scale === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.scale})`;
  stage.classList.toggle("zoomed", z.scale > 1);
}

/** 掛上手勢：wrap 是固定大小的視窗，stage 是被縮放的內容。只在手機寬度呼叫。 */
export function attachZoom(wrap: HTMLElement, stage: HTMLElement): void {
  const size = (): { w: number; h: number; left: number; top: number } => {
    const r = wrap.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  };
  const pointers = new Map<number, [number, number]>();
  let pinch = 0;
  let moved = 0;
  let lastTap = { t: 0, x: 0, y: 0 };
  applyZoom(stage, current);
  wrap.addEventListener("pointerdown", (ev) => {
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    wrap.setPointerCapture?.(ev.pointerId);
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  wrap.addEventListener("pointermove", (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const { w, h, left, top } = size();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && dist > 0) {
        applyZoom(stage, zoomAt(current, w, h, (a[0] + b[0]) / 2 - left, (a[1] + b[1]) / 2 - top, dist / pinch));
        moved = 99;
      }
      pinch = dist;
      return;
    }
    if (current.scale <= 1) return;
    moved += Math.abs(ev.clientX - prev[0]) + Math.abs(ev.clientY - prev[1]);
    if (moved > 6) applyZoom(stage, clampZoom({ ...current, x: current.x + (ev.clientX - prev[0]), y: current.y + (ev.clientY - prev[1]) }, w, h));
  });
  const end = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    pinch = 0;
    if (pointers.size > 0 || moved > 6) return;
    const { w, h, left, top } = size();
    if (ev.timeStamp - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 24) {
      applyZoom(stage, zoomAt(current, w, h, ev.clientX - left, ev.clientY - top, current.scale > 2 ? 0.01 : 2));
      lastTap = { t: 0, x: 0, y: 0 };
      moved = 99;
    } else {
      lastTap = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    }
  };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);
  // 拖曳或縮放之後放開手指，不要當成點選地點
  wrap.addEventListener("click", (ev) => {
    if (moved > 6) {
      ev.stopPropagation();
      ev.preventDefault();
      moved = 0;
    }
  }, true);
}
