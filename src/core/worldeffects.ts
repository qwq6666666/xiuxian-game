// 世局效果（M17）：世局隨年齡變化，坊市價格與部分事件的條件跟著變。
// 全由世界種子與年齡算出，不進存檔、不動亂數。
import { gameData } from "../data/load";
import type { GameData, WorldEffectDef, WorldWhen } from "../data/types";
import type { GameState } from "./state";
import { marketTerritory } from "./travel";
import { worldAt, worldFor, type WorldSnapshot } from "./world";

/** 世局是否符合效果的全部條件 */
export function effectApplies(snap: WorldSnapshot, effect: WorldEffectDef): boolean {
  return whenApplies(snap, effect.when);
}

/** 世局是否符合一組條件（世局效果與安排提示共用） */
export function whenApplies(snap: WorldSnapshot, w: WorldWhen): boolean {
  if (w.guardState) {
    const guard = snap.sects.find((s) => s.kind === "guard");
    if (!guard || !w.guardState.includes(guard.state)) return false;
  }
  if (w.merchantBranchesMin !== undefined && snap.merchantBranches.length < w.merchantBranchesMin) return false;
  if (w.ferriesBrokenMin !== undefined && snap.ferries.filter((f) => f.broken).length < w.ferriesBrokenMin) return false;
  return true;
}

let memo: { seed: number; age: number; data: GameData; snap: WorldSnapshot; effects: WorldEffectDef[] } | null = null;

function memoOf(state: GameState, data: GameData): NonNullable<typeof memo> {
  const age = Math.floor(state.ageMonths / 12);
  if (memo && memo.seed === state.worldSeed && memo.age === age && memo.data === data) return memo;
  const snap = worldAt(worldFor(state.worldSeed, data), age);
  memo = { seed: state.worldSeed, age, data, snap, effects: data.worldEffects.filter((e) => effectApplies(snap, e)) };
  return memo;
}

/** 這個狀態此刻的世局快照（同一世同一歲只算一次） */
export function snapshotOf(state: GameState, data: GameData = gameData): WorldSnapshot {
  return memoOf(state, data).snap;
}

/** 這個狀態此刻生效的世局效果（同一世同一歲只算一次，買丹與抽事件每月都會問） */
export function activeWorldEffects(state: GameState, data: GameData = gameData): WorldEffectDef[] {
  if (data.worldEffects.length === 0) return [];
  return memoOf(state, data).effects;
}

/** 事件條件 world / worldNot 用的旗標：就是生效中的效果 id */
export function worldFlagsOf(state: GameState, data: GameData = gameData): string[] {
  return activeWorldEffects(state, data).map((e) => e.id);
}

/** 物品此刻的價格：基本價乘上所有生效效果的倍率，四捨五入，至少 1 */
export function itemPrice(state: GameState, itemId: string, data: GameData = gameData): number {
  const item = data.items.find((i) => i.id === itemId);
  if (!item || item.price === 0) return 0;
  let mult = 1;
  for (const e of activeWorldEffects(state, data)) mult *= e.market[itemId] ?? 1;
  if (marketTerritory(state, data)?.contested) mult *= data.map.territoryRules.marketMultiplier;
  // 入宗者在庫房買部分丹藥打折（M25）
  if (state.sect && data.sects.discount.itemIds.includes(itemId)) mult *= data.sects.discount.mult;
  return Math.max(1, Math.round(item.price * mult));
}
