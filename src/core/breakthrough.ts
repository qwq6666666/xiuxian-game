// 大境界的手動突破。
import { gameData } from "../data/load";
import type { BreakthroughRule, GameData } from "../data/types";
import { breakthroughFailLoss, breakthroughRate, talentBonus } from "./formulas";
import { applyEndingAndContinue, endLife, endsLifeOnEntry } from "./review";
import { nextRandom } from "./rng";
import type { GameState } from "./state";
import { addLog, atBottleneck, nextRealm, realmOf } from "./tick";

export function breakthroughRuleOf(state: GameState, data: GameData = gameData): BreakthroughRule | undefined {
  return realmOf(state, data).breakthroughRule;
}

/** 突破失敗時損失的修為比例，含心性與道心天賦的減免 */
export function currentFailLoss(state: GameState, data: GameData = gameData): number {
  return breakthroughFailLoss(
    data.config,
    state.attributes.mind,
    talentBonus(state.meta, data.talents, "failLoss"),
  );
}

/** 突破還缺的天賦等級（目前等級不足門檻時回傳門檻），沒有缺則回傳 null */
export function missingTalent(state: GameState, data: GameData = gameData): { id: string; level: number } | null {
  const need = breakthroughRuleOf(state, data)?.requiresTalent;
  if (!need) return null;
  return (state.meta.talents[need.id] ?? 0) >= need.level ? null : need;
}

/** 修行中、卡在瓶頸，有下一個境界可進，且滿足天賦門檻 */
export function canBreakthrough(state: GameState, data: GameData = gameData): boolean {
  if (state.phase !== "living" || !atBottleneck(state, data)) return false;
  if (breakthroughRuleOf(state, data) === undefined || nextRealm(realmOf(state, data), data) === undefined) return false;
  return missingTalent(state, data) === null;
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
  return breakthroughRate(rule, state.attributes.insight, usePill && pillAvailable(state, data), state.meta.talents);
}

/**
 * 嘗試突破。成功進入下一境界（依該境界的 endsLife 決定是否通關結束這一世）；
 * 失敗損失部分修為，可再試。丹藥在嘗試時就消耗，成敗皆然。
 */
export function attemptBreakthrough(state: GameState, usePill: boolean, data: GameData = gameData): GameState {
  if (!canBreakthrough(state, data)) return state;
  const realm = realmOf(state, data);
  const next = nextRealm(realm, data)!;
  const rule = realm.breakthroughRule!;
  const pill = usePill && pillAvailable(state, data);
  const rate = breakthroughRate(rule, state.attributes.insight, pill, state.meta.talents);

  let s: GameState = state;
  if (pill) {
    s = { ...s, items: { ...s.items, [rule.pillId!]: s.items[rule.pillId!] - 1 } };
  }
  const [v, seed] = nextRandom(s.rngSeed);
  s = { ...s, rngSeed: seed };
  const limit = data.config.logLimit;

  if (v < rate) {
    const won = addLog(
      { ...s, realmId: next.id, stage: 0, cultivation: 0, breakthroughs: s.breakthroughs + 1 },
      { month: s.ageMonths, kind: "breakthroughSuccess", realmId: next.id, stage: 0 },
      limit,
    );
    if (next.endsLife === "never") return won;
    if (endsLifeOnEntry(next, state)) return endLife(won, next.ending, data);
    // 紀錄過的存檔：記一次通關或元嬰，這一世繼續
    return applyEndingAndContinue(won, next.ending);
  }
  const loss = currentFailLoss(s, data);
  return addLog(
    { ...s, cultivation: s.cultivation * (1 - loss) },
    { month: s.ageMonths, kind: "breakthroughFail", realmId: s.realmId, stage: s.stage },
    limit,
  );
}
