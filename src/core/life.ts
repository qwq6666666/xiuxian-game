// 開局擲骰與每一世的開始、重擲、轉世。
import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { lifeIndex } from "./character/era";
import { talentBonus } from "./formulas";
import { nextInt } from "./rng";
import { artifactsToKeep } from "./craft/forge";
import { chartChoiceLevel, drawAlternates, drawChart } from "./character/chart";
import { clamp } from "./util/noise";
import { emptyMeta, SAVE_VERSION, type Attributes, type GameState, type LogEntry, type Meta } from "./state";

/** 重新擲出屬性、靈根、出身，並套用出身效果；有擇身天賦時再多抽備選命盤。夙願跟著目標走，重擲後要重選。 */
export function rollLife(state: GameState, data: GameData = gameData): GameState {
  const chart = drawChart(state.rngSeed, state, data);
  const count = chartChoiceLevel(state, data);
  return {
    ...state,
    ...chart,
    altCharts: count > 0 ? drawAlternates(chart, state, count, data) : [],
    wishId: null,
    cultivationBonus: chart.cultivationBonus,
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
      nationCount: meta.nationCount,
      travel: { locationId: "village", targetId: null, totalMonths: 0, remainingMonths: 0, trail: ["village"] },
      attributes: zero,
      spiritRootId: "",
      originId: "",
      cultivationBonus: 0,
      spiritStones: 0,
      items: {},
      itemsUsed: {},
      methodId: data.methods[0].id,
      focusMonth: data.config.startAgeYears * 12,
      focusStored: 0,
      altCharts: [],
      wishId: null,
      omenLeft: 0,
      omen: [],
      equipment: { weapon: null, ward: null },
      pillStage: "",
      pillCount: 0,
      lifespanBonus: 0,
      schedule: data.schedules[0].id,
      realmId: data.realms[0].id,
      stage: 0,
      cultivation: 0,
      breakthroughs: 0,
      breakthroughStudy: 0,
      retreatStreak: 0,
      stance: null,
      goalIds: [],
      startFragments: meta.fragments.length,
      tribulation: null,
      encounter: null,
      trial: null,
      trialsDone: [],
      alchemy: null,
      sect: null,
      sectsTried: [],
      sectPeak: 0,
      flags: [],
      eventCounts: {},
      eventLastMonth: {},
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
/** 擲骰畫面選國家數：這一世與之後每一世都用它（存在 meta），世界由種子與它重算 */
export function setNationCount(state: GameState, count: number, data: GameData = gameData): GameState {
  if (state.phase !== "rolling") return state;
  const n = clamp(Math.round(count), data.map.nations.min, data.map.nations.max);
  if (n === state.nationCount) return state;
  return { ...state, nationCount: n, meta: { ...state.meta, nationCount: n } };
}

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
    originId: state.originId,
    spiritRootId: state.spiritRootId,
  };
  return { ...state, log: [...state.log, opening].slice(-data.config.logLimit), phase: "living",
    eventThreshold,
    eventClock: 0,
    rngSeed,
    // 備選命盤只在擲骰階段有；靈犀的次數依天賦等級，每世重新給
    altCharts: [],
    omenLeft: Math.max(0, Math.round(talentBonus(state.meta, data.talents, "omen"))),
    omen: [],
  };
}

/**
 * 死亡或通關後轉世，進入下一世的擲骰階段。
 * 跨世資料（道韻、天賦）全數保留；遺澤天賦保留一部分靈石，其餘物品與狀態重來。
 */
export function newLife(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "dead" && state.phase !== "cleared") return state;
  const keep = Math.min(1, talentBonus(state.meta, data.talents, "stoneCarry"));
  const carried = Math.floor(state.spiritStones * keep);
  // 本命天賦：挑出要帶走的法寶，下一世擲骰時放進背包
  const meta = { ...state.meta, keptArtifacts: artifactsToKeep(state, data) };
  return {
    ...createInitialState(state.rngSeed, data, meta, carried),
    speed: state.speed,
    autoChoice: state.autoChoice,
    // 心法沿用上一世的選擇，擲骰時仍可更換
    methodId: state.methodId,
  };
}
