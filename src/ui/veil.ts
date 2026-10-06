// 全螢幕過場：突破成功或失敗、死亡、轉世時，墨色從中心暈開，文字逐字浮現。
// 點擊、Enter、空白鍵或 Esc 立即跳過；偏好減少動態的人完全不播。不碰遊戲狀態，只是畫面。
export type VeilKind = "success" | "fail" | "death" | "rebirth";

/** 各種過場的總長（毫秒）：失敗最短，因為一世可能有好幾次 */
export const VEIL_MS: Record<VeilKind, number> = { success: 2200, fail: 1300, death: 3200, rebirth: 3000 };

/** 逐字浮現：把文字拆成字，每字的延遲平均分配在總長的 25%–75% 之間，字距不超過 70 毫秒 */
export function charDelays(count: number, totalMs: number): number[] {
  if (count <= 0) return [];
  const start = totalMs * 0.25;
  const span = totalMs * 0.5;
  const step = count > 1 ? Math.min(70, span / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => Math.round(start + step * i));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface Veil {
  play(kind: VeilKind, text: string, title?: string): void;
  /** 立即結束目前的過場 */
  skip(): void;
}

export function createVeil(host: HTMLElement = document.body): Veil {
  let current: { el: HTMLElement; timer: number } | null = null;

  function skip(): void {
    if (!current) return;
    window.clearTimeout(current.timer);
    current.el.remove();
    current = null;
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      skip();
    }
  }

  return {
    skip,
    play(kind, text, title) {
      if (prefersReducedMotion() || text === "") return;
      skip();
      const total = VEIL_MS[kind];
      const el = document.createElement("div");
      el.className = "veil";
      el.dataset.kind = kind;
      el.style.setProperty("--veil-ms", `${total}ms`);
      el.setAttribute("aria-hidden", "true");
      if (title) {
        const h = document.createElement("div");
        h.className = "veil-title";
        h.textContent = title;
        el.append(h);
      }
      const p = document.createElement("p");
      p.className = "veil-text";
      const chars = Array.from(text);
      const delays = charDelays(chars.length, total);
      chars.forEach((ch, i) => {
        const span = document.createElement("span");
        span.textContent = ch;
        span.style.animationDelay = `${delays[i]}ms`;
        p.append(span);
      });
      el.append(p);
      el.addEventListener("click", skip);
      host.append(el);
      document.addEventListener("keydown", onKey, true);
      current = { el, timer: window.setTimeout(skip, total) };
    },
  };
}
