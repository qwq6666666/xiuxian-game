// 存檔槽（M68）：三個槽各存一份進度，只活在瀏覽器的 localStorage，存檔本體不變、不升版。
// 第 1 槽沿用原本的鍵，既有玩家的進度不用搬。目前使用的槽記在 xiuxian-slot，換槽後重新載入頁面。
import { deserialize } from "./core/save";
import { splitAge } from "./core/formulas";
import type { GameState } from "./core/state";
import type { GameData } from "./data/types";

export const SLOT_COUNT = 3;
const ACTIVE_KEY = "xiuxian-slot";

export interface SlotKeys {
  save: string;
  seen: string;
}

export function slotKeys(slot: number): SlotKeys {
  return slot === 1 ? { save: "xiuxian-save", seen: "xiuxian-last-seen" } : { save: `xiuxian-save-${slot}`, seen: `xiuxian-last-seen-${slot}` };
}

/** 一個槽的顯示資訊；empty 沒有存檔，broken 有存檔但讀不出來 */
export interface SlotInfo {
  slot: number;
  active: boolean;
  status: "empty" | "ok" | "broken";
  /** status 為 ok 時的一行摘要 */
  summary: string;
}

export function readActiveSlot(): number {
  try {
    const n = Number(localStorage.getItem(ACTIVE_KEY));
    return Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT ? n : 1;
  } catch {
    return 1;
  }
}

export function writeActiveSlot(slot: number): void {
  try {
    localStorage.setItem(ACTIVE_KEY, String(slot));
  } catch {
    // 寫不進去就留在原本的槽
  }
}

/** 逐槽讀出摘要；目前使用中的槽用記憶體裡的 liveSummary（比儲存的新） */
export function slotInfos(data: GameData, active: number, liveSummary: string): SlotInfo[] {
  return Array.from({ length: SLOT_COUNT }, (_, i): SlotInfo => {
    const slot = i + 1;
    if (slot === active) return { slot, active: true, status: "ok", summary: liveSummary };
    let text: string | null = null;
    try {
      text = localStorage.getItem(slotKeys(slot).save);
    } catch {
      text = null;
    }
    if (text === null) return { slot, active: false, status: "empty", summary: "" };
    try {
      return { slot, active: false, status: "ok", summary: describeState(deserialize(text, data), data) };
    } catch {
      return { slot, active: false, status: "broken", summary: "" };
    }
  });
}

/** 一行摘要：姓名、境界、年齡、第幾世 */
export function describeState(state: GameState, data: GameData): string {
  const realm = data.realms.find((r) => r.id === state.realmId);
  const stage = realm?.stageNames[state.stage] ?? "";
  const [years] = splitAge(state.ageMonths);
  return `${state.name}　${realm?.name ?? state.realmId}${stage}　${years} 歲　第 ${state.meta.lives + 1} 世`;
}

export function clearSlot(slot: number): void {
  try {
    const keys = slotKeys(slot);
    localStorage.removeItem(keys.save);
    localStorage.removeItem(keys.seen);
  } catch {
    // 忽略
  }
}
