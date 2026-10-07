// 殘卷：判斷解鎖、抽取、入帳。殘卷存在跨世資料裡，不給任何數值好處。
import { gameData } from "../../data/load";
import type { FragmentDef, GameData } from "../../data/types";
import { nextRandom } from "../rng";
import type { GameState } from "../state";

/** 殘卷在首次通關時固定取得 */
export const CLEAR_FRAGMENT_ID = "f14";

/** 二層需曾達築基，三層需曾達築基後期；本世目前的進度也算，不必等到這一世結算 */
export function fragmentUnlocked(tier: number, state: GameState, data: GameData = gameData): boolean {
  if (tier <= 1) return true;
  const reached = new Set(state.meta.reached);
  const zhujiIdx = data.realms.findIndex((r) => r.id === "zhuji");
  const idx = data.realms.findIndex((r) => r.id === state.realmId);
  if (idx > zhujiIdx) {
    reached.add("zhuji:0");
    reached.add("zhuji:2");
  } else if (idx === zhujiIdx) {
    for (let s = 0; s <= state.stage; s++) reached.add(`zhuji:${s}`);
  }
  return tier === 2 ? reached.has("zhuji:0") : reached.has("zhuji:2");
}

/** 目前抽得到的殘卷：未持有、已解鎖、非 fixed、層級不超過 maxTier */
export function availableFragments(state: GameState, maxTier: number, data: GameData = gameData): FragmentDef[] {
  return data.fragments.items.filter(
    (f) =>
      !f.fixed && f.tier <= maxTier && !state.meta.fragments.includes(f.id) && fragmentUnlocked(f.tier, state, data),
  );
}

/** 把殘卷記入跨世資料；已持有則原樣回傳 */
export function grantFragment(state: GameState, id: string): GameState {
  if (state.meta.fragments.includes(id)) return state;
  return { ...state, meta: { ...state.meta, fragments: [...state.meta.fragments, id] } };
}

/** 從可得的殘卷中等機率抽一份；沒有可抽的就回傳 null，亂數不動 */
export function drawFragment(state: GameState, maxTier: number, data: GameData = gameData): [string | null, number] {
  const pool = availableFragments(state, maxTier, data);
  if (pool.length === 0) return [null, state.rngSeed];
  const [v, seed] = nextRandom(state.rngSeed);
  return [pool[Math.floor(v * pool.length)].id, seed];
}
