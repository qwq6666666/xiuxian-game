import type { AttributeKey, ReviewCause } from "../data/types";

export const SAVE_VERSION = 6;

/** 跨世保留的資料 */
export interface Meta {
  /** 道韻餘額 */
  daoYun: number;
  /** 各輪迴天賦的等級 */
  talents: Record<string, number>;
  /** 已首次達成的階段（"境界id:階段"），首次達成的道韻加倍只算一次 */
  reached: string[];
  /** 已走完的世數 */
  lives: number;
}

export function emptyMeta(): Meta {
  return { daoYun: 0, talents: {}, reached: [], lives: 0 };
}

/** 一生回顧：死亡或通關時結算一次 */
export interface LifeReview {
  cause: ReviewCause;
  /** 收尾句在該結束方式的句子清單中的索引 */
  closing: number;
  /** 死亡或通關時的年齡（月） */
  ageMonths: number;
  originId: string;
  spiritRootId: string;
  /** 最高境界（境界只升不降，即結束時的境界） */
  realmId: string;
  stage: number;
  breakthroughs: number;
  /** 各階段的基本道韻 */
  daoYunBase: number;
  /** 首次達成階段的額外道韻 */
  daoYunBonus: number;
  /** 挑出的關鍵事件，依時間排序 */
  highlights: LogEntry[];
}

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
  "event",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** 事件結果實際造成的變化，由介面另外顯示 */
export interface Changes {
  /** 修為變化量（已換算成實際數值） */
  cultivation?: number;
  spiritStones?: number;
  /** 壽元上限變化（年） */
  lifespan?: number;
  attributes?: Partial<Attributes>;
  items?: Record<string, number>;
}

/** 日誌只存事件類型，文字由介面依資料檔組出 */
export interface LogEntry {
  /** 發生時的年齡（月） */
  month: number;
  kind: LogKind;
  realmId: string;
  stage: number;
  /** 購買、拾得的物品 */
  itemId?: string;
  /** 事件 id；choice 與 outcome 是選項與結果的索引（見聞沒有） */
  eventId?: string;
  choice?: number;
  outcome?: number;
  changes?: Changes;
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
  /** 主角姓名；玩家改過名之後擲骰不再更換 */
  name: string;
  nameCustom: boolean;
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
  /** 本世累積的事件旗標 */
  flags: string[];
  /** 本世各事件已出現的次數 */
  eventCounts: Record<string, number>;
  /** 事件計時：每月累加日常安排的頻率倍率，達到門檻就觸發 */
  eventClock: number;
  eventThreshold: number;
  /** 等待玩家抉擇的事件（時間暫停） */
  pendingEvent: string | null;
  /** 設定：自動選第一個可選的選項 */
  autoChoice: boolean;
  /** 遺澤天賦從上一世帶來的靈石，擲骰時加進初始靈石 */
  carriedStones: number;
  /** 跨世資料 */
  meta: Meta;
  /** 本世結束後的回顧；進行中為 null */
  review: LifeReview | null;
  log: LogEntry[];
}
