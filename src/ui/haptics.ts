// 觸覺回饋：手機短震動。偏好存在瀏覽器（不進存檔）；不支援或被關閉時什麼都不做。

export type HapticKind = "tap" | "good" | "bad";

/** 各種回饋的震動長度（毫秒）；陣列代表震、停、震 */
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  good: [14, 40, 14],
  bad: 30,
};

const KEY = "xiuxian-haptics";

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* 無法儲存也不影響本次 */
  }
}

/** 減少動態偏好開啟時，也不震動 */
function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function haptic(kind: HapticKind = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!hapticsEnabled() || reducedMotion()) return;
  // 使用者還沒操作過頁面時瀏覽器會擋下震動並報錯（例如開局自動推進後的遇怪）
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(HAPTIC_PATTERNS[kind]);
}
