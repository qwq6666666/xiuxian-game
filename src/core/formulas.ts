// 數值公式集中處。倍率、機率等參數放在 src/data/，這裡只放算式。
import type { AttributeKey, BreakthroughRule, GameConfig, RealmDef, TalentDef, TalentEffect } from "../data/types";
import type { Meta } from "./state";

/** 現實經過的毫秒數換算成遊戲月數（含小數） */
export function msToMonths(ms: number, speed: number, msPerMonth: number): number {
  return (ms * speed) / msPerMonth;
}

/** 月數拆成 [歲, 月] */
export function splitAge(ageMonths: number): [number, number] {
  return [Math.floor(ageMonths / 12), ageMonths % 12];
}

/** 旅行月數：同域二個月，每跨一處地域再加四個月。 */
export function travelMonths(regionHops: number): number {
  return 2 + Math.max(0, regionHops) * 4;
}

export interface CultivationParams {
  config: GameConfig;
  rootMult: number;
  bone: number;
  realmMult: number;
  /** 日常安排倍率（M2 才有安排，目前固定 1） */
  scheduleMult: number;
  /** 出身加成，0.1 代表 +10% */
  originBonus: number;
  /** 輪迴加成（M4 才有，目前固定 0） */
  reincarnationBonus: number;
  /** 宗門加成（M25），0.1 代表 +10%；沒入宗為 0 */
  sectBonus?: number;
  /** 心法加成（M31），-0.04 代表 -4%；預設為 0 */
  methodBonus?: number;
}

/** 每月修為 = 基礎 × 靈根 × (1 + 根骨 × 係數) × 境界 × 安排 × (1 + 出身) × (1 + 輪迴) */
export function cultivationPerMonth(p: CultivationParams): number {
  return (
    p.config.baseCultivation *
    p.rootMult *
    (1 + p.bone * p.config.bonePerPoint) *
    p.realmMult *
    p.scheduleMult *
    (1 + p.originBonus) *
    (1 + p.reincarnationBonus) *
    (1 + (p.sectBonus ?? 0)) *
    (1 + (p.methodBonus ?? 0))
  );
}

/** 某境界第 stage 階段（從 0 起算）升級所需修為，四捨五入取整 */
export function stageNeed(realm: RealmDef, stage: number): number {
  return Math.round(realm.need.base * realm.need.growth ** stage);
}

/** 同一階段已服 count 顆聚氣丹時，下一顆的藥力倍率（丹毒）：依 falloff 逐顆遞減，超過清單為 0 */
export function pillPower(falloff: number[], count: number): number {
  return falloff[count] ?? 0;
}

/** 事件的抽取權重：基礎 × 日常安排倍率 ×（好事件再乘以 1 + 氣運 × 係數） */
export function eventWeight(
  baseWeight: number,
  tone: "good" | "bad" | "neutral",
  fortune: number,
  scheduleMult: number,
  config: GameConfig,
): number {
  const luck = tone === "good" ? 1 + fortune * config.fortuneGoodWeight : 1;
  return baseWeight * scheduleMult * luck;
}

/** 結果的抽取權重：基礎加上各屬性每點的加成，最低 0 */
export function outcomeWeight(
  baseWeight: number,
  perAttribute: Partial<Record<AttributeKey, number>> | undefined,
  attributes: Record<AttributeKey, number>,
): number {
  let w = baseWeight;
  for (const [k, per] of Object.entries(perAttribute ?? {})) w += attributes[k as AttributeKey] * per;
  return Math.max(0, w);
}

/** 境界的壽元上限，以月計；bonusYears 是延壽丹累積的年數 */
export function lifespanMonths(realm: RealmDef, bonusYears = 0): number {
  return (realm.lifespan + bonusYears) * 12;
}

/** 大境界突破成功率 = 基礎 + 悟性 × 每點加成 + 丹藥加成 + 天賦超過門檻的加成，限制在 0–100% */
export function breakthroughRate(
  rule: BreakthroughRule,
  insight: number,
  usePill: boolean,
  talentLevels: Record<string, number> = {},
): number {
  const aid = rule.talentRate
    ? Math.max(0, (talentLevels[rule.talentRate.id] ?? 0) - rule.talentRate.from) * rule.talentRate.perLevel
    : 0;
  const rate = rule.baseRate + insight * rule.insightBonus + (usePill ? (rule.pillBonus ?? 0) : 0) + aid;
  return Math.min(1, Math.max(0, rate));
}

/** 突破失敗損失的修為比例 = 基礎損失 − 心性 × 每點減免 − 道心天賦減免，最低 0 */
export function breakthroughFailLoss(config: GameConfig, mind: number, talentReduction = 0): number {
  return Math.max(0, config.breakthroughFailLoss - mind * config.mindLossReduction - talentReduction);
}

/** 某類輪迴天賦目前的總效果 = Σ 等級 × 每級效果 */
export function talentBonus(meta: Meta, talents: TalentDef[], effect: TalentEffect): number {
  let total = 0;
  for (const t of talents) if (t.effect === effect) total += (meta.talents[t.id] ?? 0) * t.perLevel;
  return total;
}

/** 天賦從目前等級升一級的價格，無條件進位 */
export function talentCost(talent: TalentDef, currentLevel: number): number {
  return Math.ceil(talent.cost.base * talent.cost.growth ** currentLevel);
}
