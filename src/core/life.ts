// 開局擲骰與每一世的開始、重擲、轉世。
import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { nextInt, pickWeighted } from "./rng";
import { SAVE_VERSION, type Attributes, type GameState } from "./state";

/** 重新擲出屬性、靈根、出身，並套用出身效果 */
export function rollLife(state: GameState, data: GameData = gameData): GameState {
  const { attributeMin, attributeMax } = data.config;
  let seed = state.rngSeed;
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const [v, s] = nextInt(seed, attributeMin, attributeMax);
    attributes[key] = v;
    seed = s;
  }
  const [rootIdx, s1] = pickWeighted(seed, data.spiritRoots);
  const [originIdx, s2] = pickWeighted(s1, data.origins);
  const origin = data.origins[originIdx];
  for (const key of ATTRIBUTE_KEYS) attributes[key] += origin.attributes[key] ?? 0;
  return {
    ...state,
    rngSeed: s2,
    attributes,
    spiritRootId: data.spiritRoots[rootIdx].id,
    originId: origin.id,
    cultivationBonus: origin.cultivationBonus,
    spiritStones: origin.spiritStones,
    items: { ...origin.items },
  };
}

/** 建立新的一世，停在擲骰階段 */
export function createInitialState(seed: number, data: GameData = gameData): GameState {
  const zero = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) zero[key] = 0;
  return rollLife(
    {
      version: SAVE_VERSION,
      rngSeed: seed >>> 0,
      speed: 1,
      phase: "rolling",
      ageMonths: data.config.startAgeYears * 12,
      rerolls: data.config.startRerolls,
      attributes: zero,
      spiritRootId: "",
      originId: "",
      cultivationBonus: 0,
      spiritStones: 0,
      items: {},
      realmId: data.realms[0].id,
      stage: 0,
      cultivation: 0,
      log: [],
    },
    data,
  );
}

/** 擲骰階段消耗一次重擲，次數用完則原樣回傳 */
export function reroll(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "rolling" || state.rerolls <= 0) return state;
  return { ...rollLife(state, data), rerolls: state.rerolls - 1 };
}

/** 確定命盤，開始修行 */
export function startLife(state: GameState): GameState {
  if (state.phase !== "rolling") return state;
  return { ...state, phase: "living" };
}

/** 死亡後轉世，進入下一世的擲骰階段（道韻與天賦是 M4 的事） */
export function newLife(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "dead") return state;
  return { ...createInitialState(state.rngSeed, data), speed: state.speed };
}
