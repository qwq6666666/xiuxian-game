import type { ArtifactSlot, AttributeKey, Omen, ReviewCause } from "../data/types";

export const SAVE_VERSION = 32;

/** 沒有選擇過時的國家數（與 map.json 的 nations.default 相同，由載入檢查守住） */
export const DEFAULT_NATIONS = 5;

/** 當世旅行：地點 id 由世界種子重建；行程期間照常推進修行與事件。 */
export interface TravelState {
  locationId: string;
  targetId: string | null;
  totalMonths: number;
  remainingMonths: number;
  /** 依到訪順序記錄地點，供地圖繪製軌跡。 */
  trail: string[];
}

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
  /** 各出身化神大成的次數（出身 id → 次數），只收藏，不影響任何數值 */
  huashen: Record<string, number>;
  /** 各出身最快達成各終局的年齡（月）；鍵是「終局:出身 id」，終局為 cleared、yuanying、huashen，只收藏 */
  fastest: Record<string, number>;
  /** 轉世時帶來的法寶 id（本命天賦決定件數）；下一世擲骰時放進背包 */
  keptArtifacts: string[];
  /** 歷代在宗門裡到過的最高位階（1 外門到 4 長老，0 沒入過宗），只收藏 */
  sectBest: number;
  /** 各目標達成的次數（目標 id → 次數），只收藏，不影響任何數值 */
  goals: Record<string, number>;
  /** 歷練遇過的怪物（怪物 id → 各結局次數），只收藏，不影響任何數值（GDD 16.3） */
  bestiary: Record<string, BestiaryEntry>;
  /** 遇過的故人（故人 id → 初遇與最近一次遇見的世數），只收藏，不影響任何數值（GDD 第 41 節） */
  met: Record<string, MetEntry>;
  /** 玩家在擲骰畫面選的國家數，之後每一世沿用（M51） */
  nationCount: number;
  /** 上一世的簡要結果，供一生回顧比較；還沒走完過一世為 null */
  lastLife: LifeBrief | null;
}

/** 一位故人的相遇紀錄：世數是「已走完的世數」，第一世為 0 */
export interface MetEntry {
  firstLife: number;
  lastLife: number;
}

/** 一種怪物的遭遇紀錄：勝、敗、逃（成功與失敗都算）、平手 */
export interface BestiaryEntry {
  win: number;
  lose: number;
  flee: number;
  draw: number;
}

/** 一世的簡要結果，用來和下一世比較 */
export interface LifeBrief {
  ageMonths: number;
  realmId: string;
  stage: number;
  originId: string;
}

export function emptyMeta(): Meta {
  return { daoYun: 0, talents: {}, reached: [], lives: 0, fragments: [], clears: {}, yuanying: {}, huashen: {}, sectBest: 0, fastest: {}, keptArtifacts: [], goals: {}, bestiary: {}, met: {}, nationCount: DEFAULT_NATIONS, lastLife: null };
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
  /** 這一世目標的結果 */
  goals: { id: string; done: boolean }[];
  /** 上一世的簡要結果（第一世為 null），一生回顧用它列出差別 */
  prev: LifeBrief | null;
  /** 這一世在宗門裡到過的最高位階（1 外門到 4 長老，0 沒入過宗） */
  sectPeak: number;
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
  "sectJoin",
  "sectRefuse",
  "sectLeave",
  "sectPromote",
  "alchemyDone",
  "alchemyFail",
  "alchemyStop",
  "forgeDone",
  "forgeFail",
  "huntWin",
  "huntLose",
  "huntFlee",
  "huntDraw",
  "trialEnter",
  "trialClear",
  "trialFail",
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
  /** 宗門貢獻變化 */
  contribution?: number;
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
  /** 閉關見聞（M45）：這一世的第幾次閉關見聞（從 0 起算），以及當時的世界種子；意象用它們洗牌，一世內不重複。舊檔沒有 */
  retreatNo?: number;
  retreatSeed?: number;
  /** 開場日誌：這一世是第幾世（從 0 起算），年號由它算出 */
  eraIndex?: number;
  /** 開場日誌：這一世的出身與靈根（M38；舊檔沒有，顯示時退回通用開場句） */
  originId?: string;
  spiritRootId?: string;
  /** 宗門日誌：當時的宗門名稱（日誌存名字，之後世局再變也不影響）與位階索引 */
  sectName?: string;
  rank?: number;
  /** 天劫失敗的日誌：止步於第幾道（從 1 起算） */
  wave?: number;
  /** 歷練遇怪的日誌：怪物 id */
  monsterId?: string;
  /** 秘境試煉的日誌：秘境 id */
  trialId?: string;
}

/** 天劫進行中的狀態 */
export interface TribulationState {
  waves: number;
  wave: number;
  /** 這次突破的整體成功率（不做準備時各道連乘等於它） */
  rate: number;
  roll: number;
  threshold: number;
}

/** 進行中的遇怪（M34）：氣血以 0–1 計；seed 是遇怪開始時抽定的亂數種子，每回合再由它衍生 */
/** 進行中的秘境試煉（M47）：floor 是目前這一層的索引（從 0 起算），seed 是進入時抽定的種子，各層遇怪的亂數由它衍生 */
export interface TrialState {
  id: string;
  floor: number;
  seed: number;
  /** 本座已用掉幾次層間調息（M58） */
  rests: number;
}

export interface EncounterState {
  monsterId: string;
  round: number;
  monsterHp: number;
  myHp: number;
  seed: number;
  /** 秘境層間休整中（M58）：這份遇怪是「下一層」，還沒開打；時間照遇怪一樣暫停 */
  rest?: boolean;
}

/** 進行中的煉丹（M29）：paid 表示這一爐的材料已經投進爐裡，progress 是已煉的月數 */
export interface AlchemyState {
  recipeId: string;
  progress: number;
  paid: boolean;
}

/** 入宗後的身分 */
export interface SectMembership {
  id: string;
  rank: number;
  contribution: number;
  joinedAge: number;
}

/** 擲骰時的一份命盤（M44 擇身）：目前命盤的欄位就在 GameState 上，備選命盤存在 altCharts */
export interface Chart {
  rngSeed: number;
  worldSeed: number;
  goalIds: string[];
  name: string;
  attributes: Attributes;
  spiritRootId: string;
  originId: string;
  cultivationBonus: number;
  spiritStones: number;
  items: Record<string, number>;
}

/** 靈犀（M44）：目前抉擇裡某個選項被窺看到的傾向 */
export interface OmenEntry {
  choice: number;
  omen: Omen;
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
  /** 這一世的國家數（開局時取自 meta.nationCount），世界由種子與它重算 */
  nationCount: number;
  travel: TravelState;
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
  /** 身上裝備的法寶（M30）：每格最多一件，裝備中的不在背包裡 */
  equipment: Record<ArtifactSlot, string | null>;
  /** 擇身（M44）：擲骰階段的備選命盤，修行中為空 */
  altCharts: Chart[];
  /** 夙願（M44）：這一世指定的目標 id（goalIds 之一），沒指定為 null */
  wishId: string | null;
  /** 靈犀（M44）：這一世還能窺看幾次抉擇的傾向 */
  omenLeft: number;
  /** 靈犀（M44）：目前等待中的抉擇裡已窺看的選項；抉擇結算後清空 */
  omen: OmenEntry[];
  /** 運功積蓄的計時起點（ageMonths）：每滿 focusCooldown 個月存一次，起點隨之前進；-1 表示從出生起算 */
  focusMonth: number;
  /** 已積蓄的運功次數（M40）；玩家一次用掉全部，上限 config.focusMaxCharges */
  focusStored: number;
  /** 這一世選的心法（M31）；只能在擲骰階段更換 */
  methodId: string;
  /** 目前的日常安排 */
  schedule: string;
  realmId: string;
  /** 小階段，從 0 起算 */
  stage: number;
  cultivation: number;
  /** 本世成功突破大境界的次數 */
  breakthroughs: number;
  /** 突破心得（M46）：目前境界連續失敗的次數，成功突破或轉世歸零；每次讓下次成功率增加一點 */
  breakthroughStudy: number;
  /** 疲勞（M46）：連續從事會疲勞的安排（閉關）的月數，做別的安排時逐月回復，轉世歸零 */
  retreatStreak: number;
  /** 這一世抽出的目標 id */
  goalIds: string[];
  /** 這一世開始時已有的殘卷數，用來算「本世取得」 */
  startFragments: number;
  /** 進行中的天劫（M28）；時間暫停，等玩家逐道選擇。wave 是下一道的索引（從 0 起算），roll 是開始時抽定的亂數，threshold 是已通過各道的累積成功率 */
  tribulation: TribulationState | null;
  /** 進行中的歷練遇怪（M34）；時間暫停，等玩家選擇戰或逃 */
  encounter: EncounterState | null;
  /** 進行中的秘境試煉（M47）；進行中時 encounter 一定不是 null（每一層就是一場遇怪） */
  trial: TrialState | null;
  /** 本世已入過的秘境 id（通關、敗退、中途退出都算），每世每座只能入一次 */
  trialsDone: string[];
  /** 進行中的煉丹（M29）；換了日常安排也保留，換回來就接著煉 */
  alchemy: AlchemyState | null;
  /** 目前所屬宗門（M25）；rank 是位階索引（0 外門），joinedAge 是入宗年齡（月） */
  sect: SectMembership | null;
  /** 本世試過或離開的宗門 id，不能再入 */
  sectsTried: string[];
  /** 這一世到過的最高位階（1 外門到 4 長老） */
  sectPeak: number;
  /** 本世累積的事件旗標 */
  flags: string[];
  /** 本世各事件已出現的次數 */
  eventCounts: Record<string, number>;
  /** 本世各事件上次出現的月份（M61：冷卻用，只記出現過的） */
  eventLastMonth: Record<string, number>;
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
