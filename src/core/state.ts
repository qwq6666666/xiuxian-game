import type { AttributeKey, ReviewCause } from "../data/types";

export const SAVE_VERSION = 11;

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
  /** 已得的殘卷 id，依取得順序 */
  fragments: string[];
  /** 各出身通關的次數（出身 id → 次數），只收藏，不影響任何數值 */
  clears: Record<string, number>;
  /** 各出身結成元嬰的次數（出身 id → 次數），只收藏，不影響任何數值 */
  yuanying: Record<string, number>;
}

export function emptyMeta(): Meta {
  return { daoYun: 0, talents: {}, reached: [], lives: 0, fragments: [], clears: {}, yuanying: {} };
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

/** cleared：這一世以通關或元嬰大成結束（死亡為 dead） */
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
  "zuohua",
  "event",
  "retreat",
  "era",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** 離線閉關為何結束：時間用完、卡在瓶頸、壽元將盡 */
export type OfflineStop = "elapsed" | "bottleneck" | "lifespan";
export const OFFLINE_STOPS: readonly OfflineStop[] = ["elapsed", "bottleneck", "lifespan"];

/** 事件結果實際造成的變化，由介面另外顯示 */
export interface Changes {
  /** 修為變化量（已換算成實際數值） */
  cultivation?: number;
  spiritStones?: number;
  /** 壽元上限變化（年） */
  lifespan?: number;
  attributes?: Partial<Attributes>;
  items?: Record<string, number>;
  /** 得到的殘卷 id */
  fragment?: string;
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
  /** 閉關見聞：實際閉關的月數與結束原因 */
  retreatMonths?: number;
  stop?: OfflineStop;
  /** 開場日誌：這一世是第幾世（從 0 起算），年號由它算出 */
  eraIndex?: number;
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
  /** 世界種子：每世擲骰時定下，世界由它重算，不存進存檔 */
  worldSeed: number;
  attributes: Attributes;
  spiritRootId: string;
  originId: string;
  /** 出身帶來的修煉加成 */
  cultivationBonus: number;
  spiritStones: number;
  items: Record<string, number>;
  /** 本世各物品已服用的次數 */
  itemsUsed: Record<string, number>;
  /** 丹毒：本世最近一次服聚氣丹時所在的階段（"境界id:階段"），換階段後計數作廢 */
  pillStage: string;
  /** 丹毒：在 pillStage 這個階段已服的聚氣丹數 */
  pillCount: number;
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
