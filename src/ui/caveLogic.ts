// 洞府第一人稱視角的判斷：四個朝向、每個朝向有哪些可點的物件。純函式，與 DOM 無關。
import { canUseItem } from "../core/actions";
import { canFocus } from "../core/focus";
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";
import { sceneSetting } from "./sceneLogic";

/** 順時針：面壁、石案（右）、洞口（後）、丹爐（左） */
export const FACINGS = ["front", "right", "back", "left"] as const;
export type Facing = (typeof FACINGS)[number];

export const FACING_NAME: Record<Facing, string> = { front: "面壁靜坐", right: "石案", back: "洞口", left: "丹爐" };

/** 往左滑、按左箭頭是向左轉身（逆時針），往右則順時針 */
export function turn(from: Facing, dir: "left" | "right"): Facing {
  const i = FACINGS.indexOf(from);
  return FACINGS[(i + (dir === "right" ? 1 : FACINGS.length - 1)) % FACINGS.length];
}

/** 洞府只在靜室背景（閉關、煉丹）時顯示；其餘背景仍用原本的薄帶場景 */
export function caveActive(state: GameState): boolean {
  return sceneSetting(state) === "cave";
}

export type CaveAction = "focus" | "brew" | "pill" | "scrolls" | "bag" | "schedule" | "map";

export interface Hotspot {
  id: string;
  action: CaveAction;
  label: string;
  /** 一句說明，給螢幕閱讀器與小字提示；不含會變動的數值以外的劇情 */
  hint: string;
  enabled: boolean;
  /** 在視圖中的位置：左、上、寬、高，百分比 */
  rect: [number, number, number, number];
}

/** 快速服用的丹藥 */
export const QUICK_PILL = "juqi_dan";

/** 這個朝向看得到、點得到的物件 */
export function hotspotsFor(state: GameState, data: GameData, facing: Facing): Hotspot[] {
  switch (facing) {
    case "front":
      return [{ id: "focus", action: "focus", label: "運功", hint: canFocus(state, data) ? "雙手結印，引氣一轉" : "氣機尚未平復", enabled: canFocus(state, data), rect: [32, 50, 36, 44] }];
    case "left":
      return [{ id: "furnace", action: "brew", label: "丹爐", hint: state.alchemy !== null ? "爐火正旺，看煉製進度" : "爐中無火，去煉製頁開爐", enabled: true, rect: [24, 26, 44, 62] }];
    case "right": {
      const pill = data.items.find((i) => i.id === QUICK_PILL);
      const n = state.items[QUICK_PILL] ?? 0;
      return [
        { id: "pill", action: "pill", label: pill?.name ?? "丹瓶", hint: n > 0 ? `服一顆，還剩 ${n}` : "瓶中已空", enabled: canUseItem(state, QUICK_PILL, data), rect: [9, 48, 24, 36] },
        { id: "scrolls", action: "scrolls", label: "殘卷", hint: "翻看殘卷錄", enabled: true, rect: [37, 54, 26, 26] },
        { id: "bag", action: "bag", label: "行囊", hint: "打開行囊", enabled: true, rect: [66, 44, 26, 40] },
      ];
    }
    case "back":
      return [
        { id: "mouth", action: "schedule", label: "洞口", hint: "走出去，換個營生", enabled: state.phase === "living", rect: [28, 20, 44, 72] },
        { id: "mountain", action: "map", label: "遠山", hint: "看天下圖", enabled: true, rect: [74, 14, 20, 26] },
      ];
  }
}
