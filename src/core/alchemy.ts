// 煉丹（M29）：開爐備齊材料，經數個月出丹。材料靠日常安排掉落，丹方在 recipes.json。
import { gameData } from "../data/load";
import { ALCHEMY_SCHEDULE } from "../data/types";
import type { GameData, RecipeDef } from "../data/types";
import { nextRandom } from "./rng";
import type { GameState } from "./state";
import { addLog } from "./progress";

export function recipeOf(id: string, data: GameData = gameData): RecipeDef | undefined {
  return data.recipes.recipes.find((r) => r.id === id);
}

/** 這個丹方的成功率：基礎加悟性，不超過上限 */
export function recipeRate(state: GameState, recipe: RecipeDef, data: GameData = gameData): number {
  const { insightPerPoint, maxRate } = data.recipes.rules;
  return Math.min(maxRate, recipe.baseRate + state.attributes.insight * insightPerPoint);
}

/** 境界夠了才能煉 */
export function recipeOpen(state: GameState, recipe: RecipeDef, data: GameData = gameData): boolean {
  const idx = (id: string): number => data.realms.findIndex((r) => r.id === id);
  return idx(state.realmId) >= idx(recipe.realmMin);
}

/** 背包裡的材料夠煉一爐 */
export function hasMaterials(state: GameState, recipe: RecipeDef): boolean {
  return Object.entries(recipe.inputs).every(([id, n]) => (state.items[id] ?? 0) >= n);
}

/** 目前能開爐：修行中、沒有進行到一半的爐、境界與材料都夠 */
export function canStartBrew(state: GameState, recipeId: string, data: GameData = gameData): boolean {
  const recipe = recipeOf(recipeId, data);
  const sched = data.schedules.find((s) => s.id === ALCHEMY_SCHEDULE);
  if (!recipe || !sched || state.phase !== "living" || state.alchemy !== null) return false;
  return recipeOpen(state, recipe, data) && hasMaterials(state, recipe);
}

/** 開爐：選定丹方並把日常安排切到煉丹，材料在下一個月投入 */
export function startBrew(state: GameState, recipeId: string, data: GameData = gameData): GameState {
  if (!canStartBrew(state, recipeId, data)) return state;
  return { ...state, alchemy: { recipeId, progress: 0, paid: false }, schedule: ALCHEMY_SCHEDULE };
}

/** 熄爐：已投入的材料全數退回，並回到預設的日常安排 */
export function cancelBrew(state: GameState, data: GameData = gameData): GameState {
  const a = state.alchemy;
  if (!a || state.phase !== "living") return state;
  const recipe = recipeOf(a.recipeId, data);
  const items = { ...state.items };
  if (a.paid && recipe) for (const [id, n] of Object.entries(recipe.inputs)) items[id] = (items[id] ?? 0) + n;
  return { ...state, alchemy: null, items, schedule: state.schedule === ALCHEMY_SCHEDULE ? data.schedules[0].id : state.schedule };
}

/** 收爐：材料不夠下一爐，熄爐並回到預設的日常安排（這時沒有投入的材料，可以直接清掉，備齊後重新開爐） */
function halt(state: GameState, month: number, data: GameData): GameState {
  return addLog(
    { ...state, alchemy: null, schedule: data.schedules[0].id },
    { month, kind: "alchemyStop", realmId: state.realmId, stage: state.stage },
    data.config.logLimit,
  );
}

/** 每月推進：只有目前的日常安排是煉丹時才動作，其餘策略完全不受影響 */
export function stepAlchemy(state: GameState, data: GameData = gameData): GameState {
  const a = state.alchemy;
  const month = state.ageMonths;
  if (state.schedule !== ALCHEMY_SCHEDULE) return state;
  const recipe = a ? recipeOf(a.recipeId, data) : undefined;
  if (!a || !recipe) return { ...state, schedule: data.schedules[0].id };

  let s = state;
  let cur = a;
  if (!cur.paid) {
    if (!hasMaterials(s, recipe)) return halt(s, month, data);
    const items = { ...s.items };
    for (const [id, n] of Object.entries(recipe.inputs)) items[id] -= n;
    s = { ...s, items };
    cur = { ...cur, paid: true, progress: 0 };
  }
  cur = { ...cur, progress: cur.progress + 1 };
  if (cur.progress < recipe.months) return { ...s, alchemy: cur };

  // 出爐：一次抽籤；成功得丹，失敗退回部分材料
  const [v, seed] = nextRandom(s.rngSeed);
  const items = { ...s.items };
  const limit = data.config.logLimit;
  const base = { month, realmId: s.realmId, stage: s.stage };
  s = { ...s, rngSeed: seed, alchemy: { recipeId: recipe.id, progress: 0, paid: false } };
  if (v < recipeRate(state, recipe, data)) {
    items[recipe.output] = (items[recipe.output] ?? 0) + 1;
    return addLog({ ...s, items }, { ...base, kind: "alchemyDone", itemId: recipe.output }, limit);
  }
  for (const [id, n] of Object.entries(recipe.inputs)) {
    const back = Math.floor(n * data.recipes.rules.failRefund);
    if (back > 0) items[id] = (items[id] ?? 0) + back;
  }
  return addLog({ ...s, items }, { ...base, kind: "alchemyFail" }, limit);
}
