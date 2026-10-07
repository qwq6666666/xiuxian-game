// 洞府第一人稱視角的判斷：四個朝向、每個朝向有哪些可點的物件。純函式，與 DOM 無關。
import { canUseItem } from "../../core/actions";
import { canFocus } from "../../core/character/focus";
import type { GameState } from "../../core/state";
import type { GameData } from "../../data/types";
import { sceneSetting, type SceneSetting } from "./sceneLogic";

/** 順時針：面壁、石案（右）、洞口（後）、丹爐（左） */
export const FACINGS = ["front", "right", "back", "left"] as const;
export type Facing = (typeof FACINGS)[number];

export const FACING_NAME: Record<Facing, string> = { front: "面壁靜坐", right: "石案", back: "洞口", left: "丹爐" };

/** 各場景四個朝向的名字（洞府以外的場景也有第一人稱視角） */
const SETTING_FACING: Record<SceneSetting, Record<Facing, string>> = {
  cave: FACING_NAME,
  road: { front: "歇腳", right: "路邊", back: "來路", left: "石碑" },
  market: { front: "市口", right: "藥鋪", back: "街口", left: "布告牆" },
  ferry: { front: "渡頭", right: "茶棚", back: "來路", left: "渡船" },
};

export function facingName(setting: SceneSetting, facing: Facing): string {
  return SETTING_FACING[setting][facing];
}

/** 往左滑、按左箭頭是向左轉身（逆時針），往右則順時針 */
export function turn(from: Facing, dir: "left" | "right"): Facing {
  const i = FACINGS.indexOf(from);
  return FACINGS[(i + (dir === "right" ? 1 : FACINGS.length - 1)) % FACINGS.length];
}

/** 第一人稱場景是否顯示：遊戲介面一律顯示（各背景有各自的四視角）；經典介面只在靜室背景（閉關、煉丹）顯示，其餘背景仍用薄帶 */
export function caveActive(state: GameState, always = false): boolean {
  return always || sceneSetting(state) === "cave";
}

export type CaveAction = "focus" | "brew" | "pill" | "scrolls" | "bag" | "schedule" | "map" | "market";

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

/** 洞府以外的場景：各朝向的熱點。位置是 450×600 視圖的百分比，要與 outdoor.ts 的圖對齊 */
function outdoorSpots(setting: Exclude<SceneSetting, "cave">, state: GameState, data: GameData, facing: Facing): Hotspot[] {
  const pillItem = data.items.find((i) => i.id === QUICK_PILL);
  const n = state.items[QUICK_PILL] ?? 0;
  const pill = (rect: Hotspot["rect"]): Hotspot => ({ id: "pill", action: "pill", label: pillItem?.name ?? "丹瓶", hint: n > 0 ? `服一顆，還剩 ${n}` : "瓶中已空", enabled: canUseItem(state, QUICK_PILL, data), rect });
  const bag = (rect: Hotspot["rect"], label = "行囊"): Hotspot => ({ id: "bag", action: "bag", label, hint: "打開行囊", enabled: true, rect });
  const focus: Hotspot = { id: "focus", action: "focus", label: "運功", hint: canFocus(state, data) ? "雙手結印，引氣一轉" : "氣機尚未平復", enabled: canFocus(state, data), rect: [14, 78, 72, 22] };
  const schedule = (label: string, rect: Hotspot["rect"]): Hotspot => ({ id: "mouth", action: "schedule", label, hint: "走去別處，換個營生", enabled: state.phase === "living", rect });
  const mountain = (rect: Hotspot["rect"]): Hotspot => ({ id: "mountain", action: "map", label: "遠山", hint: "看天下圖", enabled: true, rect });
  switch (setting) {
    case "road":
      return {
        front: [focus],
        right: [pill([16, 49, 22, 21]), bag([54, 44, 34, 24], "背囊")],
        back: [schedule("路口", [70, 64, 24, 15]), mountain([2, 28, 60, 12])],
        left: [{ id: "scrolls", action: "scrolls" as const, label: "石碑", hint: "翻看殘卷錄", enabled: true, rect: [33, 41, 35, 56] as Hotspot["rect"] }],
      }[facing];
    case "market":
      return {
        front: [{ id: "market", action: "market" as const, label: "坊市", hint: "逛逛攤位，買賣東西", enabled: true, rect: [0, 38, 44, 45] as Hotspot["rect"] }],
        right: [pill([14, 49, 34, 21]), bag([60, 49, 30, 23])],
        back: [schedule("街口", [6, 30, 88, 56]), mountain([62, 14, 32, 12])],
        left: [{ id: "scrolls", action: "scrolls" as const, label: "布告", hint: "翻看殘卷錄", enabled: true, rect: [5, 28, 90, 53] as Hotspot["rect"] }],
      }[facing];
    case "ferry":
      return {
        front: [focus],
        right: [pill([15, 52, 19, 21]), bag([58, 52, 30, 22])],
        back: [schedule("路口", [70, 64, 24, 15]), mountain([2, 28, 60, 12])],
        left: [{ id: "boat", action: "map" as const, label: "渡船", hint: "看天下圖，選個去處", enabled: true, rect: [9, 45, 86, 43] as Hotspot["rect"] }],
      }[facing];
  }
}

/** 這個朝向看得到、點得到的物件 */
export function hotspotsFor(state: GameState, data: GameData, facing: Facing): Hotspot[] {
  const setting = sceneSetting(state);
  if (setting !== "cave") return outdoorSpots(setting, state, data, facing);
  switch (facing) {
    case "front":
      return [{ id: "focus", action: "focus", label: "運功", hint: canFocus(state, data) ? "雙手結印，引氣一轉" : "氣機尚未平復", enabled: canFocus(state, data), rect: [14, 78, 72, 22] }];
    case "left":
      return [{ id: "furnace", action: "brew", label: "丹爐", hint: state.alchemy !== null ? "爐火正旺，看煉製進度" : "爐中無火，去煉製頁開爐", enabled: true, rect: [24, 58, 52, 40] }];
    case "right": {
      const pill = data.items.find((i) => i.id === QUICK_PILL);
      const n = state.items[QUICK_PILL] ?? 0;
      return [
        { id: "pill", action: "pill", label: pill?.name ?? "丹瓶", hint: n > 0 ? `服一顆，還剩 ${n}` : "瓶中已空", enabled: canUseItem(state, QUICK_PILL, data), rect: [9, 60, 27, 16] },
        { id: "scrolls", action: "scrolls", label: "殘卷", hint: "翻看殘卷錄", enabled: true, rect: [22, 78, 48, 12] },
        { id: "bag", action: "bag", label: "行囊", hint: "打開行囊", enabled: true, rect: [64, 58, 22, 16] },
      ];
    }
    case "back":
      return [
        { id: "mouth", action: "schedule", label: "洞口", hint: "走出去，換個營生", enabled: state.phase === "living", rect: [6, 46, 88, 50] },
        { id: "mountain", action: "map", label: "遠山", hint: "看天下圖", enabled: true, rect: [62, 38, 34, 14] },
      ];
  }
}
