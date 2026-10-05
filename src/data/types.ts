export const ATTRIBUTE_KEYS = ["bone", "insight", "fortune", "mind"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export interface GameConfig {
  /** 速度 ×1 時，現實多少毫秒等於遊戲 1 個月 */
  msPerMonth: number;
  speeds: number[];
  /** 單次更新最多補算幾個月，避免分頁回到前景時一次衝太多 */
  maxCatchUpMonths: number;
  startAgeYears: number;
  /** 修煉公式的基礎值 */
  baseCultivation: number;
  /** 每點根骨提供的修煉速度加成 */
  bonePerPoint: number;
  attributeMin: number;
  attributeMax: number;
  startRerolls: number;
  logLimit: number;
  /** 突破失敗損失的修為比例（未計心性） */
  breakthroughFailLoss: number;
  /** 每點心性減少的損失比例 */
  mindLossReduction: number;
  /** 事件觸發的基礎間隔（月），再除以日常安排的事件頻率倍率 */
  eventIntervalMin: number;
  eventIntervalMax: number;
  /** 好事件的權重 ×(1 + 氣運 × 此值) */
  fortuneGoodWeight: number;
  /** 首次達成某階段時，該階段道韻的倍率（2 = 加倍） */
  daoYunFirstTimeMult: number;
  /** 離線進度最多計算的現實小時數 */
  offlineMaxHours: number;
  /** 離線少於此秒數不算（也不顯示回歸提示） */
  offlineMinSeconds: number;
  /** 離線時壽元剩餘低於此比例就停止閉關 */
  offlineStopLifespanRatio: number;
}

/** 大境界手動突破的成功率規則 */
export interface BreakthroughRule {
  baseRate: number;
  /** 每點悟性增加的成功率 */
  insightBonus: number;
  /** 可加成的丹藥，突破時消耗 */
  pillId?: string;
  pillBonus?: number;
}

export interface RealmDef {
  id: string;
  name: string;
  /** 壽元上限（年） */
  lifespan: number;
  cultivationMult: number;
  /** 各小階段名稱，凡人只有一個空字串 */
  stageNames: string[];
  /** 第 n 階段（從 0 起算）所需修為 = base × growth^n */
  need: { base: number; growth: number };
  /** 最後一階段圓滿後的進入方式 */
  breakthrough: "auto" | "manual";
  /** 每達成一個階段可得的道韻 */
  daoYun: number;
  /** 手動突破到下一境界的規則（最後一個境界不需要） */
  breakthroughRule?: BreakthroughRule;
}

export interface ScheduleDef {
  id: string;
  name: string;
  desc: string;
  cultivationMult: number;
  /** 事件頻率倍率（M3 事件系統使用） */
  eventRateMult: number;
  /** 每月獲得靈石的機率與數量範圍 */
  stones: { chance: number; min: number; max: number };
  /** 每月拾得物品的機率 */
  finds: { itemId: string; chance: number }[];
  /** 每月身亡機率 */
  deathChance: number;
}

export type ItemEffect =
  | { kind: "cultivationFraction"; value: number }
  | { kind: "lifespan"; years: number; maxPerLife: number }
  | { kind: "breakthrough" };

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  effect: ItemEffect;
}

/** 事件結果的效果。cultivation 是當前階段所需修為的比例（0.2 = +20%）；lifespan 增減壽元上限（年） */
export interface Effects {
  cultivation?: number;
  spiritStones?: number;
  lifespan?: number;
  attributes?: Partial<Record<AttributeKey, number>>;
  items?: Record<string, number>;
  flags?: string[];
  death?: boolean;
}

export interface EventConditions {
  realmMin?: string;
  realmMax?: string;
  /** 年齡（歲） */
  ageMin?: number;
  ageMax?: number;
  /** 需要全部具備的旗標 */
  flags?: string[];
  /** 不能具備任一旗標 */
  flagsNot?: string[];
  /** 限定的日常安排 */
  schedules?: string[];
  /** true 表示只在卡在瓶頸時出現 */
  bottleneck?: boolean;
}

export interface OutcomeDef {
  weight: number;
  text: string;
  effects: Effects;
  /** 每點屬性額外增加的權重 */
  weightPerAttribute?: Partial<Record<AttributeKey, number>>;
}

export interface ChoiceDef {
  text: string;
  /** 選項的前提，不足時無法選擇 */
  requires?: { spiritStones?: number; items?: Record<string, number> };
  outcomes: OutcomeDef[];
}

export interface EventDef {
  id: string;
  /** anecdote 見聞（無選項）／choice 抉擇 */
  type: "anecdote" | "choice";
  title: string;
  text: string;
  weight: number;
  tone: "good" | "bad" | "neutral";
  /** 每世最多出現幾次 */
  maxPerLife: number;
  /** 一生回顧挑選關鍵事件的分數（預設：抉擇 1、見聞 0.5） */
  highlight?: number;
  conditions: EventConditions;
  /** 依日常安排調整權重的倍率 */
  scheduleWeights?: Record<string, number>;
  /** 見聞的效果 */
  effects?: Effects;
  choices?: ChoiceDef[];
}

export interface SpiritRootDef {
  id: string;
  name: string;
  mult: number;
  weight: number;
}

export interface OriginDef {
  id: string;
  name: string;
  desc: string;
  weight: number;
  spiritStones: number;
  items: Record<string, number>;
  /** 修煉速度加成，0.1 代表 +10% */
  cultivationBonus: number;
  attributes: Partial<Record<AttributeKey, number>>;
}

export type TalentEffect = "cultivation" | "rerolls" | "fortune" | "stoneCarry" | "failLoss";

/** 輪迴天賦：每級效果 = perLevel，第 n 級的價格 = ceil(base × growth^(目前等級)) */
export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  effect: TalentEffect;
  perLevel: number;
  cost: { base: number; growth: number };
}

export type ReviewCause = "lifespan" | "adventure" | "event" | "cleared";
export const REVIEW_CAUSES: readonly ReviewCause[] = ["lifespan", "adventure", "event", "cleared"];

/** 一生回顧的收尾句；有 ifItem 的只在持有該物品（未用完）時使用 */
export interface ClosingVariant {
  text: string;
  ifItem?: string;
}

export interface TextData {
  log: {
    stageUp: string[];
    realmUp: Record<string, string>;
    bottleneck: string;
    death: string;
    /** 以突破後進入的境界 id 為鍵 */
    breakthroughSuccess: Record<string, string>;
    breakthroughFail: string[];
    buy: string[];
    find: string[];
    adventureDeath: string;
  };
  /** 一生回顧的收尾句，依結束方式分類 */
  review: Record<ReviewCause, ClosingVariant[]>;
}

export interface GameData {
  config: GameConfig;
  realms: RealmDef[];
  schedules: ScheduleDef[];
  items: ItemDef[];
  events: EventDef[];
  talents: TalentDef[];
  spiritRoots: SpiritRootDef[];
  origins: OriginDef[];
  text: TextData;
}
