// 擇身（M44）：擲骰時除了目前命盤，再給一份（或兩份）功率相近的備選命盤，玩家擇一開始這一世。
// 備選命盤用衍生種子抽，不消耗 rngSeed；沒有擇身天賦時，目前命盤與之前逐位元相同。
import { gameData } from "../../data/load";
import { ATTRIBUTE_KEYS, type GameData } from "../../data/types";
import { talentBonus } from "../formulas";
import { pickGoals } from "./goals";
import { deriveSeed, nextInt, pickWeighted } from "../rng";
import type { Attributes, Chart, GameState } from "../state";

/** 備選命盤的抽取次數上限：超過就取功率最接近的 */
const MAX_ATTEMPTS = 50;
/** 備選命盤衍生種子的鹽值，與世界、目標用的編號錯開 */
const ALT_SALT = 100;

/** 出身的物品加上帶來的法寶 */
function keptItems(kept: string[], base: Record<string, number>): Record<string, number> {
  const items = { ...base };
  for (const id of kept) items[id] = (items[id] ?? 0) + 1;
  return items;
}

type ChartSource = Pick<GameState, "name" | "nameCustom" | "meta" | "carriedStones">;

/** 從 seed 起抽出一份命盤（屬性、靈根、出身、姓名、世界、目標）。消耗亂數的順序與歷來的擲骰完全相同。 */
export function drawChart(seed: number, src: ChartSource, data: GameData = gameData): Chart {
  const { attributeMin, attributeMax } = data.config;
  let s = seed;
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const [v, next] = nextInt(s, attributeMin, attributeMax);
    attributes[key] = v;
    s = next;
  }
  const [rootIdx, s1] = pickWeighted(s, data.spiritRoots);
  const [originIdx, s2] = pickWeighted(s1, data.origins);
  let seed2 = s2;
  const origin = data.origins[originIdx];
  for (const key of ATTRIBUTE_KEYS) attributes[key] += origin.attributes[key] ?? 0;
  // 姓名：玩家沒改過就跟著命盤重新抽
  let name = src.name;
  if (!src.nameCustom) {
    const [si, s3] = nextInt(s2, 0, data.names.surnames.length - 1);
    const [gi, s4] = nextInt(s3, 0, data.names.given.length - 1);
    name = data.names.surnames[si] + data.names.given[gi];
    seed2 = s4;
  }
  // 福緣天賦：氣運加成
  attributes.fortune += talentBonus(src.meta, data.talents, "fortune");
  return {
    rngSeed: seed2,
    // 世界種子由最後的亂數狀態雜湊而來，不消耗亂數；重擲會得到另一個世界
    worldSeed: deriveSeed(seed2, 1),
    // 目標跟著命盤抽：由最後的亂數狀態雜湊而來，不消耗亂數
    goalIds: pickGoals(seed2, src.meta.lives, data),
    name,
    attributes,
    spiritRootId: data.spiritRoots[rootIdx].id,
    originId: origin.id,
    cultivationBonus: origin.cultivationBonus,
    // 遺澤天賦帶來的靈石一併算進初始靈石
    spiritStones: origin.spiritStones + src.carriedStones,
    // 轉世帶來的法寶（本命天賦）一併放進背包，重擲也不會丟
    items: keptItems(src.meta.keptArtifacts, origin.items),
  };
}

/** 命盤的修煉功率：靈根 × 根骨 × 出身加成，與每月修為公式裡由命盤決定的部分一致 */
export function chartPower(chart: Chart, data: GameData = gameData): number {
  const root = data.spiritRoots.find((r) => r.id === chart.spiritRootId);
  if (!root) throw new Error(`命盤：找不到靈根 ${chart.spiritRootId}`);
  return root.mult * (1 + chart.attributes.bone * data.config.bonePerPoint) * (1 + chart.cultivationBonus);
}

/** 擇身的等級：備選命盤的份數 */
export function chartChoiceLevel(state: Pick<GameState, "meta">, data: GameData = gameData): number {
  return Math.max(0, Math.round(talentBonus(state.meta, data.talents, "chartChoice")));
}

/**
 * 為目前命盤抽備選命盤：功率與目前命盤相差不超過 chartPowerTolerance，且靈根或出身至少一項與已有的不同。
 * 抽不到就取功率最接近的。只看命盤本身，不碰 rngSeed。
 */
export function drawAlternates(chart: Chart, src: ChartSource, count: number, data: GameData = gameData): Chart[] {
  const base = chartPower(chart, data);
  const taken: Chart[] = [chart];
  const alts: Chart[] = [];
  for (let k = 0; k < count; k++) {
    let best: Chart | null = null;
    let bestGap = Infinity;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const cand = drawChart(deriveSeed(chart.rngSeed, ALT_SALT + k * MAX_ATTEMPTS + attempt), src, data);
      if (taken.some((t) => t.spiritRootId === cand.spiritRootId && t.originId === cand.originId)) continue;
      const gap = Math.abs(chartPower(cand, data) / base - 1);
      if (gap < bestGap) {
        best = cand;
        bestGap = gap;
      }
      if (gap <= data.config.chartPowerTolerance) break;
    }
    // 50 次裡一份都沒有不同的（幾乎不可能）：直接用最後一次抽的
    const pick = best ?? drawChart(deriveSeed(chart.rngSeed, ALT_SALT + (k + 1) * MAX_ATTEMPTS), src, data);
    alts.push(pick);
    taken.push(pick);
  }
  return alts;
}

/** 目前命盤（GameState 上的欄位） */
export function currentChart(state: GameState): Chart {
  return {
    rngSeed: state.rngSeed,
    worldSeed: state.worldSeed,
    goalIds: state.goalIds,
    name: state.name,
    attributes: state.attributes,
    spiritRootId: state.spiritRootId,
    originId: state.originId,
    cultivationBonus: state.cultivationBonus,
    spiritStones: state.spiritStones,
    items: state.items,
  };
}

/** 擲骰階段改選第 index 份備選命盤；目前的命盤換進備選位置。夙願跟著目標走，換盤後要重選。 */
export function pickChart(state: GameState, index: number): GameState {
  if (state.phase !== "rolling" || !Number.isInteger(index) || index < 0 || index >= state.altCharts.length) return state;
  const chosen = state.altCharts[index];
  const altCharts = state.altCharts.map((c, i) => (i === index ? currentChart(state) : c));
  // 玩家改過的姓名兩份命盤共用
  const name = state.nameCustom ? state.name : chosen.name;
  return {
    ...state,
    ...chosen,
    name,
    altCharts: altCharts.map((c) => (state.nameCustom ? { ...c, name: state.name } : c)),
    wishId: null,
  };
}
