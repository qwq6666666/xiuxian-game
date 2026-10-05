import type { AttributeKey } from "../data/types";

export const SAVE_VERSION = 3;

/** cleared：突破到金丹，第一版通關 */
export type Phase = "rolling" | "living" | "dead" | "cleared";

export type Attributes = Record<AttributeKey, number>;

export const LOG_KINDS = [
  "stageUp",
  "realmUp",
  "bottleneck",
  "death",
  "breakthroughSuccess",
  "breakthroughFail",
  "buy",
  "find",
  "adventureDeath",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** 日誌只存事件類型，文字由介面依資料檔組出 */
export interface LogEntry {
  /** 發生時的年齡（月） */
  month: number;
  kind: LogKind;
  realmId: string;
  stage: number;
  /** 購買、拾得的物品 */
  itemId?: string;
}

export interface GameState {
  version: number;
  rngSeed: number;
  speed: number;
  phase: Phase;
  /** 年齡，以月為單位 */
  ageMonths: number;
  /** 開局剩餘重擲次數 */
  rerolls: number;
  attributes: Attributes;
  spiritRootId: string;
  originId: string;
  /** 出身帶來的修煉加成 */
  cultivationBonus: number;
  spiritStones: number;
  items: Record<string, number>;
  /** 本世各物品已服用的次數 */
  itemsUsed: Record<string, number>;
  /** 延壽丹累積的壽元上限（年） */
  lifespanBonus: number;
  /** 目前的日常安排 */
  schedule: string;
  realmId: string;
  /** 小階段，從 0 起算 */
  stage: number;
  cultivation: number;
  /** 本世成功突破大境界的次數 */
  breakthroughs: number;
  log: LogEntry[];
}
