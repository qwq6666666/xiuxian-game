// 大境界的手動突破。
import { gameData } from "../data/load";
import type { BreakthroughRule, GameData } from "../data/types";
import { breakthroughFailLoss, breakthroughRate, studyRate, talentBonus } from "./formulas";
import { applyEndingAndContinue, endLife, endsLifeOnEntry } from "./review";
import { artifactBonus } from "./forge";
import { methodEffect } from "./method";
import { nextRandom } from "./rng";
import type { GameState } from "./state";
import { addLog, atBottleneck, nextRealm, realmOf } from "./tick";

export function breakthroughRuleOf(state: GameState, data: GameData = gameData): BreakthroughRule | undefined {
  return realmOf(state, data).breakthroughRule;
}

/** 手上帶著的護心丹（M29）：失敗時自動服用，減免該次的損失比例 */
export function reliefItem(state: GameState, data: GameData = gameData): { id: string; value: number } | null {
  for (const item of data.items) {
    if (item.effect.kind === "failLossRelief" && (state.items[item.id] ?? 0) > 0) return { id: item.id, value: item.effect.value };
  }
  return null;
}

/** 突破失敗時損失的修為比例，含心性與道心天賦的減免，以及手上的護心丹 */
export function currentFailLoss(state: GameState, data: GameData = gameData): number {
  const base = breakthroughFailLoss(
    data.config,
    state.attributes.mind,
    talentBonus(state.meta, data.talents, "failLoss"),
  );
  return Math.max(0, base - (reliefItem(state, data)?.value ?? 0) - methodEffect(state, "failLoss", data) - artifactBonus(state, "failLoss", data));
}

/** 突破還缺的天賦等級（目前等級不足門檻時回傳門檻），沒有缺則回傳 null */
export function missingTalent(state: GameState, data: GameData = gameData): { id: string; level: number } | null {
  const need = breakthroughRuleOf(state, data)?.requiresTalent;
  if (!need) return null;
  return (state.meta.talents[need.id] ?? 0) >= need.level ? null : need;
}

/** 修行中、卡在瓶頸，有下一個境界可進，且滿足天賦門檻 */
export function canBreakthrough(state: GameState, data: GameData = gameData): boolean {
  if (state.phase !== "living" || state.tribulation !== null || state.encounter !== null || !atBottleneck(state, data)) return false;
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
  return breakthroughRate(rule, state.attributes.insight, usePill && pillAvailable(state, data), state.meta.talents, studyRate(data.config, state.breakthroughStudy));
}

/** 目前成功率的各項來源（M46）：基礎、悟性、丹藥、天賦、心得；加總（限制在 0–100%）就是 currentBreakthroughRate */
export interface RateParts {
  base: number;
  insight: number;
  pill: number;
  talent: number;
  study: number;
  total: number;
}

export function breakthroughRateParts(state: GameState, usePill: boolean, data: GameData = gameData): RateParts {
  const rule = breakthroughRuleOf(state, data);
  if (!rule) return { base: 0, insight: 0, pill: 0, talent: 0, study: 0, total: 0 };
  const talentLevels = state.meta.talents;
  return {
    base: rule.baseRate,
    insight: state.attributes.insight * rule.insightBonus,
    pill: usePill && pillAvailable(state, data) ? (rule.pillBonus ?? 0) : 0,
    talent: rule.talentRate ? Math.max(0, (talentLevels[rule.talentRate.id] ?? 0) - rule.talentRate.from) * rule.talentRate.perLevel : 0,
    study: studyRate(data.config, state.breakthroughStudy),
    total: currentBreakthroughRate(state, usePill, data),
  };
}

/** 成功進入下一境界：依該境界的 endsLife 決定是否結束這一世 */
function succeed(s: GameState, data: GameData): GameState {
  const next = nextRealm(realmOf(s, data), data)!;
  const won = addLog(
    { ...s, tribulation: null, realmId: next.id, stage: 0, cultivation: 0, breakthroughs: s.breakthroughs + 1, breakthroughStudy: 0 },
    { month: s.ageMonths, kind: "breakthroughSuccess", realmId: next.id, stage: 0 },
    data.config.logLimit,
  );
  if (next.endsLife === "never") return won;
  if (endsLifeOnEntry(next, s)) return endLife(won, next.ending, data);
  // 紀錄過的存檔：記一次通關或元嬰，這一世繼續
  return applyEndingAndContinue(won, next.ending);
}

/** 突破失敗：損失部分修為（可再試）。wave 是天劫止步的那一道（從 1 起算），extraLoss 是額外損失的比例 */
function fail(s: GameState, data: GameData, wave?: number, extraLoss = 0): GameState {
  const loss = Math.min(1, currentFailLoss(s, data) + extraLoss);
  // 護心丹隨失敗服下，用掉一顆
  const relief = reliefItem(s, data);
  const items = relief ? { ...s.items, [relief.id]: s.items[relief.id] - 1 } : s.items;
  return addLog(
    { ...s, items, tribulation: null, cultivation: s.cultivation * (1 - loss), breakthroughStudy: s.breakthroughStudy + 1 },
    { month: s.ageMonths, kind: "breakthroughFail", realmId: s.realmId, stage: s.stage, ...(wave !== undefined ? { wave } : {}) },
    data.config.logLimit,
  );
}

/** 事件強行衝關（M41）：不看修為直接成功或失敗，沿用一般突破的結算 */
export function forceBreakthrough(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "living" || breakthroughRuleOf(state, data) === undefined || nextRealm(realmOf(state, data), data) === undefined) return state;
  return succeed(state, data);
}

export function forceBreakthroughFail(state: GameState, data: GameData = gameData): GameState {
  if (state.phase !== "living" || breakthroughRuleOf(state, data) === undefined) return state;
  return fail(state, data);
}

/**
 * 嘗試突破。丹藥在嘗試時就消耗，成敗皆然，並抽一次亂數。
 * 沒有天劫的突破立刻出結果；有天劫的突破進入天劫（時間暫停，逐道選擇），整體成功率與一鍵突破相同。
 * 自動抉擇開啟時，天劫每一道都硬抗，結果與一鍵突破完全一致。
 */
export function attemptBreakthrough(state: GameState, usePill: boolean, data: GameData = gameData): GameState {
  if (!canBreakthrough(state, data)) return state;
  const realm = realmOf(state, data);
  const rule = realm.breakthroughRule!;
  const pill = usePill && pillAvailable(state, data);
  const rate = breakthroughRate(rule, state.attributes.insight, pill, state.meta.talents, studyRate(data.config, state.breakthroughStudy));

  let s: GameState = state;
  if (pill) {
    s = { ...s, items: { ...s.items, [rule.pillId!]: s.items[rule.pillId!] - 1 } };
  }
  const [v, seed] = nextRandom(s.rngSeed);
  s = { ...s, rngSeed: seed };

  if (rule.tribulation) {
    const begun: GameState = { ...s, tribulation: { waves: rule.tribulation.waves, wave: 0, rate, roll: v, threshold: 1 } };
    return state.autoChoice ? autoTribulation(begun, data) : begun;
  }
  return v < rate ? succeed(s, data) : fail(s, data);
}

// ---- 天劫（M28）----

export type WaveChoice = "brace" | "guard" | "ward";
export const WAVE_CHOICES: readonly WaveChoice[] = ["brace", "guard", "ward"];

/** 避雷符：資料裡第一個 tribulationWard 效果的物品 */
export function wardItem(data: GameData = gameData): { id: string; bonus: number } | null {
  for (const item of data.items) if (item.effect.kind === "tribulationWard") return { id: item.id, bonus: item.effect.bonus };
  return null;
}

/** 不做準備時每一道的成功率：各道連乘等於整體成功率 */
export function waveBaseChance(state: GameState): number {
  const t = state.tribulation;
  return t ? t.rate ** (1 / t.waves) : 0;
}

/** 這一道選擇該方式的成功率；符籙不夠或不在天劫中為 0 */
export function waveChance(state: GameState, choice: WaveChoice, data: GameData = gameData, focus = false): number {
  if (!state.tribulation) return 0;
  // 凝神：在光圈收攏時選擇，這一道的把握再加一點（不超過上限）
  const cap = data.tribulation.maxChance;
  const plain = waveBaseChance(state);
  const base = focus ? Math.max(plain, Math.min(cap, plain + data.tribulation.focusBonus)) : plain;
  if (choice === "brace") return base;
  if (choice === "guard") {
    const g = data.tribulation.guard;
    return Math.max(base, Math.min(cap, base + Math.min(g.max, state.attributes.mind * g.perMind) + methodEffect(state, "guardBonus", data) + artifactBonus(state, "guardBonus", data)));
  }
  const ward = wardItem(data);
  if (!ward || (state.items[ward.id] ?? 0) <= 0) return 0;
  return Math.max(base, Math.min(cap, base + ward.bonus));
}

export function canChooseWave(state: GameState, choice: WaveChoice, data: GameData = gameData): boolean {
  return state.tribulation !== null && state.phase === "living" && (choice !== "ward" || waveChance(state, "ward", data) > 0);
}

/** 目前這一道的劫波意象（依道數循環） */
export function waveImage(state: GameState, data: GameData = gameData) {
  const images = data.tribulation.images;
  return images[(state.tribulation?.wave ?? 0) % images.length];
}

/**
 * 面對這一道劫波：用累積門檻判定，不再抽亂數（亂數在天劫開始時抽定）。
 * 通過最後一道即突破成功；任何一道失敗即突破失敗（不致死）。
 */
export function faceWave(state: GameState, choice: WaveChoice, data: GameData = gameData, focus = false): GameState {
  const t = state.tribulation;
  if (!t || !canChooseWave(state, choice, data)) return state;
  const threshold = t.threshold * waveChance(state, choice, data, focus);
  let s = state;
  if (choice === "ward") {
    const ward = wardItem(data)!;
    s = { ...s, items: { ...s.items, [ward.id]: s.items[ward.id] - 1 } };
  }
  if (t.roll >= threshold) return fail(s, data, t.wave + 1, choice === "guard" ? data.tribulation.guard.extraLoss : 0);
  if (t.wave + 1 >= t.waves) return succeed(s, data);
  return { ...s, tribulation: { ...t, wave: t.wave + 1, threshold } };
}

/** 每一道都硬抗直到結束（自動抉擇與模擬用） */
export function autoTribulation(state: GameState, data: GameData = gameData): GameState {
  let s = state;
  while (s.tribulation !== null) s = faceWave(s, "brace", data);
  return s;
}
