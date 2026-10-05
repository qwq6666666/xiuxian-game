// 數值公式集中處。倍率、機率等參數放在 src/data/，這裡只放算式。
import type { GameConfig, RealmDef } from "../data/types";

/** 現實經過的毫秒數換算成遊戲月數（含小數） */
export function msToMonths(ms: number, speed: number, msPerMonth: number): number {
  return (ms * speed) / msPerMonth;
}

/** 月數拆成 [歲, 月] */
export function splitAge(ageMonths: number): [number, number] {
  return [Math.floor(ageMonths / 12), ageMonths % 12];
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
    (1 + p.reincarnationBonus)
  );
}

/** 某境界第 stage 階段（從 0 起算）升級所需修為，四捨五入取整 */
export function stageNeed(realm: RealmDef, stage: number): number {
  return Math.round(realm.need.base * realm.need.growth ** stage);
}

/** 境界的壽元上限，以月計 */
export function lifespanMonths(realm: RealmDef): number {
  return realm.lifespan * 12;
}
