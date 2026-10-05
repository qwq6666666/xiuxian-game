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

export interface TextData {
  log: {
    stageUp: string[];
    realmUp: Record<string, string>;
    bottleneck: string;
    death: string;
  };
}

export interface GameData {
  config: GameConfig;
  realms: RealmDef[];
  spiritRoots: SpiritRootDef[];
  origins: OriginDef[];
  text: TextData;
}
