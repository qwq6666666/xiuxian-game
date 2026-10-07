// 成就達成提示：成就由 meta 算出，沒有存檔欄位，所以「看過哪些」只記在瀏覽器（不進存檔）。
// 第一次執行時把已達成的全部記成看過，避免舊存檔一次噴出一串提示。
import { achievementStatuses } from "../core/character/achievements";
import type { Meta } from "../core/state";
import type { GameData } from "../data/types";

const KEY = "xiuxian-ach-seen";

function readSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // 無法記住也沒關係，下次載入會再提示一次
  }
}

/**
 * 回傳檢查函式：meta 換了才重算；有新達成的就呼叫 notify（多則用頓號串起）。
 * notify 回傳 false 表示提示列正忙、這次沒顯示：不記成看過，下次畫面更新再試。
 */
export function createAchievementWatch(data: GameData, notify: (message: string) => boolean): (meta: Meta) => void {
  let lastMeta: Meta | null = null;
  let seen: Set<string> | null | undefined;
  return (meta) => {
    if (meta === lastMeta) return;
    lastMeta = meta;
    const done = achievementStatuses(meta, data).filter((s) => s.done);
    if (seen === undefined) seen = readSeen();
    if (seen === null) {
      seen = new Set(done.map((s) => s.def.id));
      writeSeen(seen);
      return;
    }
    const fresh = done.filter((s) => !seen!.has(s.def.id));
    if (fresh.length === 0) return;
    if (!notify(`成就達成：${fresh.map((s) => s.def.name).join("、")}`)) {
      lastMeta = null;
      return;
    }
    for (const s of fresh) seen.add(s.def.id);
    writeSeen(seen);
  };
}
