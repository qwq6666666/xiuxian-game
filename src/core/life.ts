// 開局擲骰與每一世的開始、重擲、轉世。
import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { lifeIndex } from "./era";
import { talentBonus } from "./formulas";
import { deriveSeed, nextInt, pickWeighted } from "./rng";
import { emptyMeta, SAVE_VERSION, type Attributes, type GameState, type LogEntry, type Meta } from "./state";

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
  let seed2 = s2;
  const origin = data.origins[originIdx];
  for (const key of ATTRIBUTE_KEYS) attributes[key] += origin.attributes[key] ?? 0;
  // 姓名：玩家沒改過就跟著命盤重新抽
  let name = state.name;
  if (!state.nameCustom) {
    const [si, s3] = nextInt(s2, 0, data.names.surnames.length - 1);
    const [gi, s4] = nextInt(s3, 0, data.names.given.length - 1);
    name = data.names.surnames[si] + data.names.given[gi];
    seed2 = s4;
  }
  // 福緣天賦：氣運加成
  attributes.fortune += talentBonus(state.meta, data.talents, "fortune");
  return {
    ...state,
    rngSeed: seed2,
    // 世界種子由最後的亂數狀態雜湊而來，不消耗亂數；重擲會得到另一個世界
    worldSeed: deriveSeed(seed2, 1),
    name,
    attributes,
    spiritRootId: data.spiritRoots[rootIdx].id,
    originId: origin.id,
    cultivationBonus: origin.cultivationBonus,
    // 遺澤天賦帶來的靈石一併算進初始靈石
    spiritStones: origin.spiritStones + state.carriedStones,
    items: { ...origin.items },
  };
}

/**
 * 建立新的一世，停在擲骰階段。
 * meta 是前幾世累積的跨世資料，carriedStones 是遺澤天賦帶來的靈石。
 */
export function createInitialState(
  seed: number,
  data: GameData = gameData,
  meta: Meta = emptyMeta(),
  carriedStones = 0,
): GameState {
  const zero = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) zero[key] = 0;
  return rollLife(
    {
      version: SAVE_VERSION,
      rngSeed: seed >>> 0,
      speed: 1,
      phase: "rolling",
      ageMonths: data.config.startAgeYears * 12,
      // 天眷天賦：開局重擲次數
      rerolls: data.config.startRerolls + Math.round(talentBonus(meta, data.talents, "rerolls")),
      name: "",
      nameCustom: false,
      worldSeed: 0,
      attributes: zero,
      spiritRootId: "",
      originId: "",
      cultivationBonus: 0,
      spiritStones: 0,
      items: {},
      itemsUsed: {},
      pillStage: "",
      pillCount: 0,
      lifespanBonus: 0,
      schedule: data.schedules[0].id,
      realmId: data.realms[0].id,
      stage: 0,
      cultivation: 0,
      breakthroughs: 0,
      flags: [],
      eventCounts: {},
      eventClock: 0,
      eventThreshold: 0,
      pendingEvent: null,
      autoChoice: false,
      carriedStones,
      meta,
      review: null,
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

/** 確定命盤，開始修行，並抽出第一次事件的門檻 */
export function startLife(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "rolling") return state;
  const [eventThreshold, rngSeed] = nextInt(state.rngSeed, data.config.eventIntervalMin, data.config.eventIntervalMax);
  const opening: LogEntry = {
    month: state.ageMonths,
    kind: "era",
    realmId: state.realmId,
    stage: state.stage,
    eraIndex: lifeIndex(state),
  };
  return { ...state, log: [...state.log, opening].slice(-data.config.logLimit), phase: "living", eventThreshold, eventClock: 0, rngSeed };
}

/**
 * 死亡或通關後轉世，進入下一世的擲骰階段。
 * 跨世資料（道韻、天賦）全數保留；遺澤天賦保留一部分靈石，其餘物品與狀態重來。
 */
export function newLife(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "dead" && state.phase !== "cleared") return state;
  const keep = Math.min(1, talentBonus(state.meta, data.talents, "stoneCarry"));
  const carried = Math.floor(state.spiritStones * keep);
  return {
    ...createInitialState(state.rngSeed, data, state.meta, carried),
    speed: state.speed,
    autoChoice: state.autoChoice,
  };
}
