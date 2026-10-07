// 年度行止（M64）：每年選一次的取捨。沒選就是順其自然，倍率全是 1，不結算、不寫日誌。
import { gameData } from "../data/load";
import type { GameData, StanceDef } from "../data/types";
import { addLog } from "./progress";
import { deriveSeed, nextRandom } from "./rng";
import type { Changes, GameState } from "./state";

const STANCE_SALT = 10_000_000;

/** 目前生效的行止；沒選為 null */
export function stanceOf(state: GameState, data: GameData = gameData): StanceDef | null {
  return state.stance === null ? null : (data.stances.stances.find((s) => s.id === state.stance!.id) ?? null);
}

/** 行止對修為增量與事件計時的倍率；沒選為 1 */
export function stanceMult(state: GameState, key: "cultivationMult" | "eventRateMult", data: GameData = gameData): number {
  return stanceOf(state, data)?.[key] ?? 1;
}

/** 還能選行止：修行中、目前沒有行止在身 */
export function canSetStance(state: GameState, id: string, data: GameData = gameData): boolean {
  return state.phase === "living" && state.stance === null && data.stances.stances.some((s) => s.id === id);
}

/** 選今年的行止：從現在起算滿一年（由 intervalYears 決定）才結算，期間不能改 */
export function setStance(state: GameState, id: string, data: GameData = gameData): GameState {
  if (!canSetStance(state, id, data)) return state;
  return { ...state, stance: { id, since: state.ageMonths } };
}

/** 行止還剩幾個月（沒選為 0） */
export function stanceMonthsLeft(state: GameState, data: GameData = gameData): number {
  return state.stance === null ? 0 : Math.max(0, state.stance.since + data.stances.rules.intervalYears * 12 - state.ageMonths);
}

/** 每月呼叫：滿期就結算（給靈石、或抽一次風險），寫日誌並清掉行止。亂數用衍生種子，不動 rngSeed */
export function stepStance(state: GameState, month: number, data: GameData = gameData): GameState {
  const def = stanceOf(state, data);
  if (state.stance === null) return state;
  if (def === null) return { ...state, stance: null }; // 資料改版後找不到的行止，當作沒選
  if (month - state.stance.since < data.stances.rules.intervalYears * 12) return state;
  let s: GameState = { ...state, stance: null };
  const changes: Changes = {};
  let hit = false;
  const end = def.yearEnd;
  if (end?.stones) {
    s = { ...s, spiritStones: s.spiritStones + end.stones };
    changes.spiritStones = end.stones;
  }
  if (end?.risk && nextRandom(deriveSeed(state.rngSeed, STANCE_SALT + month))[0] < end.risk.chance) {
    const loss = s.cultivation * end.risk.lossFrac;
    hit = true;
    if (loss > 0) {
      s = { ...s, cultivation: s.cultivation - loss };
      changes.cultivation = -loss;
    }
  }
  const index = data.stances.stances.indexOf(def);
  return addLog(
    s,
    { month, kind: "stance", realmId: s.realmId, stage: s.stage, choice: index, ...(hit ? { outcome: 1 } : {}), ...(Object.keys(changes).length > 0 ? { changes } : {}) },
    data.config.logLimit,
  );
}
