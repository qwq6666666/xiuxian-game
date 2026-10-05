// 大境界的手動突破。
import { gameData } from "../data/load";
import type { BreakthroughRule, GameData } from "../data/types";
import { breakthroughFailLoss, breakthroughRate } from "./formulas";
import { nextRandom } from "./rng";
import type { GameState } from "./state";
import { addLog, atBottleneck, nextRealm, realmOf } from "./tick";

export function breakthroughRuleOf(state: GameState, data: GameData = gameData): BreakthroughRule | undefined {
  return realmOf(state, data).breakthroughRule;
}

/** 修行中、卡在瓶頸，且有下一個境界可進 */
export function canBreakthrough(state: GameState, data: GameData = gameData): boolean {
  if (state.phase !== "living" || !atBottleneck(state, data)) return false;
  return breakthroughRuleOf(state, data) !== undefined && nextRealm(realmOf(state, data), data) !== undefined;
}

/** 手上有這次突破可用的丹藥 */
export function pillAvailable(state: GameState, data: GameData = gameData): boolean {
  const pillId = breakthroughRuleOf(state, data)?.pillId;
  return pillId !== undefined && (state.items[pillId] ?? 0) > 0;
}

/** 目前的成功率；usePill 只有在手上真的有丹藥時才算數 */
export function currentBreakthroughRate(state: GameState, usePill: boolean, data: GameData = gameData): number {
  const rule = breakthroughRuleOf(state, data);
  if (!rule) return 0;
  return breakthroughRate(rule, state.attributes.insight, usePill && pillAvailable(state, data));
}

/**
 * 嘗試突破。成功進入下一境界（到最後一個境界即通關）；
 * 失敗損失部分修為，可再試。丹藥在嘗試時就消耗，成敗皆然。
 */
export function attemptBreakthrough(state: GameState, usePill: boolean, data: GameData = gameData): GameState {
  if (!canBreakthrough(state, data)) return state;
  const realm = realmOf(state, data);
  const next = nextRealm(realm, data)!;
  const rule = realm.breakthroughRule!;
  const pill = usePill && pillAvailable(state, data);
  const rate = breakthroughRate(rule, state.attributes.insight, pill);

  let s: GameState = state;
  if (pill) {
    s = { ...s, items: { ...s.items, [rule.pillId!]: s.items[rule.pillId!] - 1 } };
  }
  const [v, seed] = nextRandom(s.rngSeed);
  s = { ...s, rngSeed: seed };
  const limit = data.config.logLimit;

  if (v < rate) {
    const cleared = data.realms[data.realms.length - 1].id === next.id;
    return addLog(
      {
        ...s,
        realmId: next.id,
        stage: 0,
        cultivation: 0,
        breakthroughs: s.breakthroughs + 1,
        phase: cleared ? "cleared" : s.phase,
      },
      { month: s.ageMonths, kind: "breakthroughSuccess", realmId: next.id, stage: 0 },
      limit,
    );
  }
  const loss = breakthroughFailLoss(data.config, s.attributes.mind);
  return addLog(
    { ...s, cultivation: s.cultivation * (1 - loss) },
    { month: s.ageMonths, kind: "breakthroughFail", realmId: s.realmId, stage: s.stage },
    limit,
  );
}
