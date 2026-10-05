import type { AttributeKey } from "../data/types";

export const SAVE_VERSION = 2;

export type Phase = "rolling" | "living" | "dead";

export type Attributes = Record<AttributeKey, number>;

export type LogKind = "stageUp" | "realmUp" | "bottleneck" | "death";

/** 日誌只存事件類型，文字由介面依資料檔組出 */
export interface LogEntry {
  /** 發生時的年齡（月） */
  month: number;
  kind: LogKind;
  realmId: string;
  stage: number;
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
  realmId: string;
  /** 小階段，從 0 起算 */
  stage: number;
  cultivation: number;
  log: LogEntry[];
}
