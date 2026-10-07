// 手勢：滑動方向判斷（純函式）與掛在元素上的監聽。只讀指標事件，不碰遊戲狀態。

export type SwipeDir = "left" | "right";

export interface SwipeRules {
  /** 水平位移至少多少像素才算滑動 */
  minDistance: number;
  /** 水平位移必須是垂直位移的幾倍以上，避免捲動頁面時誤觸 */
  ratio: number;
  /** 最長耗時（毫秒），拖太久視為拖曳而不是滑動 */
  maxMs: number;
}

export const DEFAULT_SWIPE: SwipeRules = { minDistance: 56, ratio: 1.6, maxMs: 600 };

/** 由起點到終點的位移與耗時判斷滑動方向；不夠明確就回傳 null */
export function swipeOf(dx: number, dy: number, ms: number, rules: SwipeRules = DEFAULT_SWIPE): SwipeDir | null {
  if (ms > rules.maxMs) return null;
  if (Math.abs(dx) < rules.minDistance) return null;
  if (Math.abs(dx) < Math.abs(dy) * rules.ratio) return null;
  return dx < 0 ? "left" : "right";
}

/** 起點落在這些元素上時不處理滑動：輸入欄、可橫向捲動的區域、地圖與標示 data-no-swipe 的區塊 */
const SKIP = "input, textarea, select, [data-no-swipe], .map-card, .modal";

/**
 * 在元素上監聽水平滑動；回傳取消函式。
 * 只處理觸控與手寫筆，滑鼠不觸發（桌面用分頁按鈕）。
 */
export function onSwipe(el: HTMLElement, cb: (dir: SwipeDir) => void, rules: SwipeRules = DEFAULT_SWIPE): () => void {
  let start: { x: number; y: number; t: number; id: number } | null = null;
  const down = (ev: PointerEvent): void => {
    if (ev.pointerType === "mouse") return;
    if ((ev.target as Element | null)?.closest(SKIP)) return;
    start = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, id: ev.pointerId };
  };
  const up = (ev: PointerEvent): void => {
    if (!start || ev.pointerId !== start.id) return;
    const dir = swipeOf(ev.clientX - start.x, ev.clientY - start.y, ev.timeStamp - start.t, rules);
    start = null;
    if (dir) cb(dir);
  };
  const cancel = (): void => {
    start = null;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
  };
}

/** 在有序清單裡往左滑看下一個、往右滑看上一個；到頭不循環，回傳 null */
export function neighbourOf<T>(list: readonly T[], current: T, dir: SwipeDir): T | null {
  const i = list.indexOf(current);
  if (i < 0) return null;
  const next = dir === "left" ? i + 1 : i - 1;
  return next >= 0 && next < list.length ? list[next] : null;
}
