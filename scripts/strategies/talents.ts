import { canChoose, eventOf } from "../../src/core/events";
import { chartPower, currentChart, pickChart } from "../../src/core/chart";
import { canPeek, peekOmen } from "../../src/core/omen";
import { setWish, wishChoices } from "../../src/core/wish";
import { nextRandom } from "../../src/core/rng";
import type { GameState } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { policy } from "./context";
import { strategy } from "./context";
import { randomChoice } from "./common";

/**
 * 改變玩法的輪迴天賦策略（M44）：同 mixed，道韻先買該天賦到滿級（買不起就存著，宿慧以外的都排在後面），再買其他；最貪的用法：
 * chart 擲骰時挑功率最高的命盤；wish 指定有掛鉤事件的目標；omen 每個抉擇窺看到吉為止再選它，窺看到凶的不選。
 */
export const TALENT_STRATEGIES: Record<string, string> = { chart: "zeshen", wish: "suyuan", omen: "lingxi" };
export const isTalentStrategy = (s: string): boolean => s in TALENT_STRATEGIES;

/** 擲骰階段的選擇：chart 挑功率最高的命盤；wish 指定第一個有掛鉤的目標 */
export function rollChoices(rolling: GameState): GameState {
  let s = rolling;
  if (strategy === "chart" && s.altCharts.length > 0) {
    const powers = [chartPower(currentChart(s), gameData), ...s.altCharts.map((c) => chartPower(c, gameData))];
    const best = powers.indexOf(Math.max(...powers));
    if (best > 0) s = pickChart(s, best - 1);
  }
  if (strategy === "wish") {
    const goal = wishChoices(s, gameData).find((g) => g.tilt !== undefined);
    if (goal) s = setWish(s, goal.id, gameData);
  }
  return s;
}

/** omen 策略的抉擇：依序窺看選項，看到吉就選它；窺看到凶的不選，其餘隨機 */
export function omenPick(state: GameState): [GameState, number] {
  const ev = eventOf(state.pendingEvent!, gameData);
  let s = state;
  for (let c = 0; c < (ev.choices?.length ?? 0) && s.omenLeft > 0; c++) {
    if (!canPeek(s, c, gameData)) continue;
    s = peekOmen(s, c, gameData);
    if (s.omen[s.omen.length - 1].omen === "good") return [s, c];
  }
  const bad = new Set(s.omen.filter((o) => o.omen === "bad").map((o) => o.choice));
  const open = (ev.choices ?? []).map((c, i) => (canChoose(s, c) && !bad.has(i) ? i : -1)).filter((i) => i >= 0);
  if (open.length === 0) return [s, randomChoice(s.pendingEvent!, s)];
  const [v, next] = nextRandom(policy.seed);
  policy.seed = next;
  return [s, open[Math.floor(v * open.length)]];
}

