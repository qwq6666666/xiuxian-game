// 玩家主動的操作：切換日常安排、坊市購買、使用丹藥。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { stageNeed } from "./formulas";
import type { GameState } from "./state";
import { addLog, atBottleneck, realmOf, resolveStages } from "./tick";

export function setSchedule(state: GameState, scheduleId: string, data: GameData = gameData): GameState {
  if (state.phase !== "living" || !data.schedules.some((s) => s.id === scheduleId)) return state;
  return { ...state, schedule: scheduleId };
}

export function canBuyItem(state: GameState, itemId: string, data: GameData = gameData): boolean {
  const item = data.items.find((i) => i.id === itemId);
  if (!item || state.phase !== "living" || state.spiritStones < item.price) return false;
  // 有每世上限的丹藥，買了用不掉就不讓買
  if (item.effect.kind === "lifespan") {
    return (state.items[itemId] ?? 0) + (state.itemsUsed[itemId] ?? 0) < item.effect.maxPerLife;
  }
  return true;
}

export function buyItem(state: GameState, itemId: string, data: GameData = gameData): GameState {
  if (!canBuyItem(state, itemId, data)) return state;
  const item = data.items.find((i) => i.id === itemId)!;
  return addLog(
    {
      ...state,
      spiritStones: state.spiritStones - item.price,
      items: { ...state.items, [itemId]: (state.items[itemId] ?? 0) + 1 },
    },
    { month: state.ageMonths, kind: "buy", realmId: state.realmId, stage: state.stage, itemId },
    data.config.logLimit,
  );
}

/** 背包裡可以直接服用的丹藥（築基丹在突破時才消耗，不能直接服用） */
export function canUseItem(state: GameState, itemId: string, data: GameData = gameData): boolean {
  const item = data.items.find((i) => i.id === itemId);
  if (!item || state.phase !== "living" || (state.items[itemId] ?? 0) <= 0) return false;
  switch (item.effect.kind) {
    case "cultivationFraction":
      return !atBottleneck(state, data);
    case "lifespan":
      return (state.itemsUsed[itemId] ?? 0) < item.effect.maxPerLife;
    case "breakthrough":
      return false;
  }
}

export function useItem(state: GameState, itemId: string, data: GameData = gameData): GameState {
  if (!canUseItem(state, itemId, data)) return state;
  const item = data.items.find((i) => i.id === itemId)!;
  let s: GameState = {
    ...state,
    items: { ...state.items, [itemId]: state.items[itemId] - 1 },
    itemsUsed: { ...state.itemsUsed, [itemId]: (state.itemsUsed[itemId] ?? 0) + 1 },
  };
  if (item.effect.kind === "cultivationFraction") {
    const gain = stageNeed(realmOf(s, data), s.stage) * item.effect.value;
    s = resolveStages({ ...s, cultivation: s.cultivation + gain }, s.ageMonths, data);
  } else if (item.effect.kind === "lifespan") {
    s = { ...s, lifespanBonus: s.lifespanBonus + item.effect.years };
  }
  return s;
}
