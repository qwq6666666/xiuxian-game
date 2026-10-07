// 數字滾動：讓修為與靈石順著進度條「爬」到新值，而不是直接跳。
// tweenValue 是純函式；rollNumber 負責逐格重畫，同一個 key 的前一段動畫會被接手而不是疊加。

/** 起點到終點的線性內插，elapsed 超過 duration 就停在終點 */
export function tweenValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return from + (to - from) * (elapsed / duration);
}

interface Roll {
  raf: number;
  shown: number;
}
const rolls = new Map<string, Roll>();

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 把 key 對應的數字從目前顯示的值滾到 to，每一格呼叫 paint(整數)。
 * 頁面在背景、要求減少動態、或時間太短時直接跳到終點。
 */
export function rollNumber(key: string, to: number, ms: number, paint: (value: number) => void): void {
  const prev = rolls.get(key);
  if (prev) cancelAnimationFrame(prev.raf);
  const from = prev ? prev.shown : to;
  if (from === to || ms < 50 || document.hidden || reducedMotion()) {
    rolls.set(key, { raf: 0, shown: to });
    paint(to);
    return;
  }
  const start = performance.now();
  const state: Roll = { raf: 0, shown: from };
  rolls.set(key, state);
  const step = (now: number): void => {
    const v = tweenValue(from, to, now - start, ms);
    state.shown = v;
    paint(Math.floor(v));
    if (v !== to) state.raf = requestAnimationFrame(step);
    else paint(to);
  };
  state.raf = requestAnimationFrame(step);
}

/** 清掉所有進行中的滾動（轉世、重建畫面時用，避免舊數字寫進新畫面） */
export function resetRolls(): void {
  for (const r of rolls.values()) cancelAnimationFrame(r.raf);
  rolls.clear();
}
