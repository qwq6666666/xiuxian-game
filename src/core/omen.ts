// 靈犀（M44）：抉擇時消耗一次，窺看某個選項「這一次實際會落到」的結局傾向（吉、平、凶），不顯示內容與數值。
// 結果由目前的 rngSeed 決定，窺看不消耗亂數、也不改變結局。
import { gameData } from "../data/load";
import type { GameData, Omen, OutcomeDef } from "../data/types";
import { canChoose, eventOf, outcomeIndexOf } from "./events";
import type { GameState } from "./state";

/** 結果的傾向：個別結果有寫 omen 就用它，否則由效果推出。有收穫又有損失算平。 */
export function omenOf(outcome: OutcomeDef, data: GameData = gameData): Omen {
  if (outcome.omen) return outcome.omen;
  const e = outcome.effects;
  if (e.death) return "bad";
  const attrs = Object.values(e.attributes ?? {});
  const loss =
    (e.lifespan ?? 0) < 0 ||
    (e.cultivation ?? 0) < 0 ||
    (e.spiritStones ?? 0) <= -data.config.omenLossStones ||
    (e.contribution ?? 0) < 0 ||
    attrs.some((v) => (v ?? 0) < 0);
  const gain =
    (e.lifespan ?? 0) > 0 ||
    (e.cultivation ?? 0) > 0 ||
    (e.spiritStones ?? 0) > 0 ||
    (e.contribution ?? 0) > 0 ||
    attrs.some((v) => (v ?? 0) > 0) ||
    Object.values(e.items ?? {}).some((n) => n > 0) ||
    e.fragment !== undefined;
  if (loss && !gain) return "bad";
  if (gain && !loss) return "good";
  return "neutral";
}

/** 現在能不能窺看這個選項 */
export function canPeek(state: GameState, choiceIndex: number, data: GameData = gameData): boolean {
  if (state.phase !== "living" || state.pendingEvent === null || state.omenLeft <= 0) return false;
  if (state.omen.some((o) => o.choice === choiceIndex)) return false;
  const choice = eventOf(state.pendingEvent, data).choices?.[choiceIndex];
  return choice !== undefined && canChoose(state, choice);
}

/** 窺看一個選項：記下傾向、扣一次。不能窺看時原樣回傳。 */
export function peekOmen(state: GameState, choiceIndex: number, data: GameData = gameData): GameState {
  if (!canPeek(state, choiceIndex, data)) return state;
  const choice = eventOf(state.pendingEvent!, data).choices![choiceIndex];
  const outcome = choice.outcomes[outcomeIndexOf(state, choice)];
  return { ...state, omenLeft: state.omenLeft - 1, omen: [...state.omen, { choice: choiceIndex, omen: omenOf(outcome, data) }] };
}
