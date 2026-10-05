// 玩家主動的操作：切換日常安排、坊市購買、使用丹藥。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { pillPower, stageNeed, talentCost } from "./formulas";
import type { GameState } from "./state";
import { addLog, atBottleneck, realmOf, resolveStages } from "./tick";

export function setSchedule(state: GameState, scheduleId: string, data: GameData = gameData): GameState {
  if (state.phase !== "living" || !data.schedules.some((s) => s.id === scheduleId)) return state;
  return { ...state, schedule: scheduleId };
}

/** 擲骰階段改名：去掉頭尾空白，長度 1 到上限（以字元計）。不合格就原樣回傳。 */
export function renameCharacter(state: GameState, input: string, data: GameData = gameData): GameState {
  if (state.phase !== "rolling") return state;
  const name = input.trim();
  const length = [...name].length;
  if (length < 1 || length > data.config.nameMaxLength) return state;
  return { ...state, name, nameCustom: true };
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

/** 一生結束後（死亡或通關），道韻足夠且未達上限時可以提升輪迴天賦 */
export function canBuyTalent(state: GameState, talentId: string, data: GameData = gameData): boolean {
  const talent = data.talents.find((t) => t.id === talentId);
  if (!talent || (state.phase !== "dead" && state.phase !== "cleared")) return false;
  const level = state.meta.talents[talentId] ?? 0;
  return level < talent.maxLevel && state.meta.daoYun >= talentCost(talent, level);
}

export function buyTalent(state: GameState, talentId: string, data: GameData = gameData): GameState {
  if (!canBuyTalent(state, talentId, data)) return state;
  const talent = data.talents.find((t) => t.id === talentId)!;
  const level = state.meta.talents[talentId] ?? 0;
  return {
    ...state,
    meta: {
      ...state.meta,
      daoYun: state.meta.daoYun - talentCost(talent, level),
      talents: { ...state.meta.talents, [talentId]: level + 1 },
    },
  };
}

/** 目前這個階段已服的聚氣丹數（丹毒）；換了階段就從 0 算 */
export function pillsTaken(state: GameState): number {
  return state.pillStage === `${state.realmId}:${state.stage}` ? state.pillCount : 0;
}

/** 背包裡可以直接服用的丹藥（築基丹在突破時才消耗，不能直接服用） */
export function canUseItem(state: GameState, itemId: string, data: GameData = gameData): boolean {
  const item = data.items.find((i) => i.id === itemId);
  if (!item || state.phase !== "living" || (state.items[itemId] ?? 0) <= 0) return false;
  switch (item.effect.kind) {
    case "cultivationFraction":
      return !atBottleneck(state, data) && pillPower(item.effect.falloff, pillsTaken(state)) > 0;
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
    const power = pillPower(item.effect.falloff, pillsTaken(state));
    const gain = stageNeed(realmOf(s, data), s.stage) * item.effect.value * power;
    s = { ...s, pillStage: `${state.realmId}:${state.stage}`, pillCount: pillsTaken(state) + 1 };
    s = resolveStages({ ...s, cultivation: s.cultivation + gain }, s.ageMonths, data);
  } else if (item.effect.kind === "lifespan") {
    s = { ...s, lifespanBonus: s.lifespanBonus + item.effect.years };
  }
  return s;
}
