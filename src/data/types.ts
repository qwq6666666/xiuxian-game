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
  /** 各項修煉加成合計的設計上限（宗門、心法、法寶最大值相乘後須不超過它；由測試守住） */
  cultivationBonusCap: number;
  /** 運功（點擊）的加成：若每次冷卻一到就運功，整體修煉速度增加這個比例 */
  focusBonus: number;
  /** 運功的冷卻（月）。一次運功得到的修為 = 當月修為 × focusBonus × 冷卻月數 */
  focusCooldown: number;
  /** 運功最多積蓄幾次（M40）；一次運功得到的修為 × 積蓄次數，整體加成仍受 focusBonus 限制 */
  focusMaxCharges: number;
  /** 夙願（M44）：被指定的目標有掛鉤的事件，抽事件時的權重倍率 */
  wishWeightMult: number;
  /** 擇身（M44）：備選命盤與目前命盤的修煉功率相差不得超過這個比例（0.15 即 ±15%） */
  chartPowerTolerance: number;
  /** 靈犀（M44）：結果的靈石損失達到這個數字以上才算凶 */
  omenLossStones: number;
  /** 每點心性減少的損失比例 */
  mindLossReduction: number;
  /** 安排資訊面拿來換算「攢多久買得起」的參考物品 id */
  priceRefItemId: string;
  /** 事件觸發的基礎間隔（月），再除以日常安排的事件頻率倍率 */
  eventIntervalMin: number;
  eventIntervalMax: number;
  /** 能重複出現（maxPerLife 大於 1）的事件，兩次之間至少隔幾年；事件可用 cooldownYears 覆寫，0 代表不冷卻 */
  eventCooldownYears: number;
  /** 不在坊市時買東西的運費：到最近坊市或商行的路程每個月加這個比例（M63） */
  freightPerMonth: number;
  /** 運費比例的上限 */
  freightMax: number;
  /** 好事件的權重 ×(1 + 氣運 × 此值) */
  fortuneGoodWeight: number;
  /** 首次達成某階段時，該階段道韻的倍率（2 = 加倍） */
  daoYunFirstTimeMult: number;
  /** 主角姓名的最大字數 */
  nameMaxLength: number;
  /** 離線進度最多計算的現實小時數 */
  offlineMaxHours: number;
  /** 離線一次最多閉關幾年（遊戲內），避免回來時壽元耗掉大半 */
  offlineMaxYears: number;
  /** 離線少於此秒數不算（也不顯示回歸提示） */
  offlineMinSeconds: number;
  /** 分頁在背景或畫面卡住再回來時，少於這麼多秒不補算（M40） */
  backgroundMinSeconds: number;
  /** 兩個影格相隔超過這麼多秒，視為畫面被凍結，改用離線規則補算（M40） */
  frameGapSeconds: number;
  /** 剩餘壽元不到這麼多個月時，時間自動暫停一次，讓玩家來得及做最後的決定 */
  holdLifespanMonths: number;
  /** 天賦升到滿級的總價超過這個值就不顯示（太遠的數字只造成壓迫，沒有決策價值） */
  talentTotalShowMax: number;
  /** 離線時壽元剩餘低於此比例就停止閉關 */
  offlineStopLifespanRatio: number;
  /** 突破心得（M46）：每次失敗累積一點，下次成功率增加這麼多（0–1） */
  breakthroughStudyBonus: number;
  /** 突破心得的加成上限 */
  breakthroughStudyCap: number;
  /** 閉關見聞（M45）：未滿這個年數用簡短句，以上用「意象＋感受＋收尾」拼出的句子 */
  retreatBriefYears: number;
  /** 閉關見聞：收尾用吐槽版的機率 */
  retreatGagChance: number;
  /** 閉關見聞：換成罕見句的機率 */
  retreatRareChance: number;
  /** 閉關見聞：閉關時已用掉的壽元（以該境界基本壽元估）達這個比例以上，語氣偏孤寂 */
  retreatLonelyRatio: number;
}

/** 大境界手動突破的成功率規則 */
export interface BreakthroughRule {
  baseRate: number;
  /** 每點悟性增加的成功率 */
  insightBonus: number;
  /** 可加成的丹藥，突破時消耗 */
  pillId?: string;
  pillBonus?: number;
  /** 要先有這個天賦的等級才能嘗試突破 */
  requiresTalent?: { id: string; level: number };
  /** 天賦等級超過 from 之後，每級增加的成功率 */
  talentRate?: { id: string; from: number; perLevel: number };
  /** 缺少所需天賦時顯示的說明；沒寫則用 text.json 的 breakthroughGate */
  gateText?: string;
  /** 天劫（M28）：成功率不變，但分成這麼多道，每道可做準備；沒寫就是一鍵突破 */
  tribulation?: { waves: number };
}

export type EndsLife = "always" | "untilCleared" | "untilYuanying" | "never";
export const ENDS_LIFE: readonly EndsLife[] = ["always", "untilCleared", "untilYuanying", "never"];

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
  /**
   * 進入這個境界時是否結束這一世（通關）：
   * always 一律結束；untilCleared 沒通關過才結束，通關過就繼續活；
   * untilYuanying 沒元嬰過才結束，元嬰過就繼續活；never（預設）不結束。
   */
  endsLife: EndsLife;
  /** 結束這一世時的結束方式，預設 cleared */
  ending: EndingCause;
  /** 手動突破到下一境界的規則（最後一個境界不需要） */
  breakthroughRule?: BreakthroughRule;
  /** 閉關坐化（M18）：在這個境界可以提前結束這一世，剩餘壽元每年換得這麼多道韻 */
  zuohua?: { daoYunPerYear: number };
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
  /** 每月掉落材料的機率（M29）：用獨立的亂數序列，不消耗存檔的 rngSeed，也不寫日誌 */
  drops?: { itemId: string; chance: number }[];
  /** 每月身亡機率 */
  deathChance: number;
  /** 達到這個境界才開放（預設一開始就能選） */
  realmMin?: string;
  /** 只有入宗者才開放（宗門差事） */
  requiresSect?: boolean;
  /** 世局符合條件時，在這個安排旁顯示的提示，可用名稱欄位 */
  worldHints?: { when: WorldWhen; text: string }[];
  /** 疲勞（M46）：連續選這個安排太久，每月修為遞減；改做別的安排會回復。沒有這個欄位就不會疲勞 */
  fatigue?: FatigueRule;
}

export interface FatigueRule {
  /** 到這個境界（含）才開始疲勞；之前連續月數不累積。省略代表一開始就會 */
  realmMin?: string;
  /** 超過這個境界就不再疲勞（含這個境界本身仍會）。省略代表沒有上限 */
  realmMax?: string;
  /** 連續幾個月內不受影響 */
  graceMonths: number;
  /** 超過寬限之後，每連續一年修為倍率減少多少 */
  perYear: number;
  /** 倍率的下限（0–1） */
  floor: number;
  /** 做別的安排時，每個月連續月數減少多少 */
  recoverPerMonth: number;
}

export type ItemEffect =
  | { kind: "cultivationFraction"; value: number; falloff: number[] }
  | { kind: "lifespan"; years: number; maxPerLife: number }
  | { kind: "breakthrough" }
  /** 天劫中祭出：該道成功率增加 bonus（M28） */
  | { kind: "tribulationWard"; bonus: number }
  /** 戰鬥用符籙：歷練遇怪時祭出（數值在 monsters.json 的 actions.ward），與天劫用的避雷符分開 */
  | { kind: "huntWard" }
  /** 突破失敗時自動服用，該次的修為損失比例減少 value（M29） */
  | { kind: "failLossRelief"; value: number }
  /** 材料：不能服用、不在坊市賣，只用來煉製（M29） */
  | { kind: "material" }
  /** 法寶（M30）：裝備在 slot 上提供被動加成，只能煉製，不在坊市賣 */
  | { kind: "artifact"; slot: ArtifactSlot; tier: number; bonus: ArtifactBonus };

export const ARTIFACT_SLOTS = ["weapon", "ward"] as const;
export type ArtifactSlot = (typeof ARTIFACT_SLOTS)[number];

/** 法寶的加成，省略代表 0：修煉速度、突破失敗損失減免（絕對值）、天劫護體每道加成 */
export interface ArtifactBonus {
  cultivation?: number;
  failLoss?: number;
  guardBonus?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  /** 坊市價格；材料與法寶不賣，價格為 0 */
  price: number;
  effect: ItemEffect;
}

/** 心法（M31）的效果：全是比例，0.06 代表 +6%；省略代表 0 */
export interface MethodEffects {
  /** 修煉速度 */
  cultivation?: number;
  /** 事件頻率 */
  eventRate?: number;
  /** 突破失敗損失的比例減免（絕對值，0.06 代表損失少 6 個百分點） */
  failLoss?: number;
  /** 天劫護體每一道額外增加的成功率 */
  guardBonus?: number;
  /** 殘卷事件的觸發機率增幅（只作用在機率小於 1 的殘卷效果） */
  fragmentChance?: number;
}

export interface MethodDef {
  id: string;
  name: string;
  desc: string;
  effects: MethodEffects;
  /** 殘卷錄集到這麼多份才能選 */
  unlock: { fragments: number };
}

/** 煉丹用的日常安排 id */
export const ALCHEMY_SCHEDULE = "alchemy";

/** 丹方（M29）：閉關煉丹時，每爐先備齊 inputs，經 months 個月出丹，成功率 = baseRate + 悟性 × 每點加成 */
export interface RecipeDef {
  id: string;
  /** brew：閉關煉丹，經 months 個月出爐；forge：煉器，花 stones 靈石加材料，即時完成 */
  kind: "brew" | "forge";
  /** 煉器要付的靈石；煉丹為 0 */
  stones: number;
  /** 產出的物品 id */
  output: string;
  inputs: Record<string, number>;
  months: number;
  baseRate: number;
  /** 達到這個境界才能煉 */
  realmMin: string;
  /** 介面顯示名稱（選填）；同一件產出有多個配方時用來區分，沒寫就用產出物名稱 */
  label?: string;
}

export interface AlchemyRules {
  /** 悟性每一點增加的成功率 */
  insightPerPoint: number;
  /** 成功率上限 */
  maxRate: number;
  /** 煉失敗時退回的材料比例（各材料向下取整） */
  failRefund: number;
}

export interface RecipesData {
  rules: AlchemyRules;
  recipes: RecipeDef[];
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
  /** 宗門貢獻增減（只有入宗者生效） */
  contribution?: number;
  /** 給殘卷：指定一份，或從未持有、已解鎖、非 fixed 且層級不超過 maxTier 的殘卷中抽一份（chance 為觸發機率，預設 1） */
  fragment?: { id: string } | { maxTier: number; chance?: number };
  /** 直接進入下一個大境界（不看修為，成敗由結果權重決定），走一般突破成功的流程 */
  advanceRealm?: boolean;
  /** 套用一次突破失敗的損失（含心性、護心丹減免），走一般突破失敗的流程 */
  breakthroughFail?: boolean;
}

export interface EventConditions {
  realmMin?: string;
  realmMax?: string;
  /** 目前境界的小階段下限（0 起算，練氣七層是 6） */
  stageMin?: number;
  /** 剩餘壽元（年）不超過此值才出現；依目前境界與延壽算出 */
  lifespanLeftMax?: number;
  /** meta.reached 含其中任一項就不出現（例如 "zhuji:0" 表示跨世都沒築基過） */
  reachedNot?: string[];
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
  /** 還抽得到層級不超過此數的殘卷時才出現（1–3） */
  fragmentAvailable?: number;
  /** 當下世局要有的全部效果 id（worldEffects.json，M17）；世局由年齡算出，不進存檔 */
  world?: string[];
  /** 當下世局不能有的任一效果 id */
  worldNot?: string[];
  /** 目前所在地是否正逢國界推移 */
  territoryConflict?: boolean;
  /** 所在地的國家與玩家宗門的關係：互惠或世仇（M53）；沒入宗時一律不成立 */
  territoryRelation?: "ally" | "feud";
  /** 目前所在地是否在開放宗門的靈脈範圍內 */
  sectInfluence?: boolean;
  /** 是否正在宗門中（宗門事件用；寫了同門欄位的事件必須設為 true） */
  sect?: boolean;
  /** 已走完的世數不超過此值（0 表示只在第一世出現；開場引路事件用） */
  livesMax?: number;
  /** 在宗門中且位階不低於此索引（0 外門、1 內門、2 執事、3 長老） */
  sectRankMin?: number;
  /** 限定的出身 id（origins.json）；開場文字依出身分流用 */
  origins?: string[];
  /** 限定的靈根 id（spiritRoots.json） */
  roots?: string[];
  /** 隔世重逢的故人（GDD 第 41 節）：gap 是「這一世與初遇相隔幾世」，沒遇過算 0；每位故人每世最多遇一次 */
  acquaintance?: { id: string; gapMin?: number; gapMax?: number };
}

/** 靈犀窺看到的結局傾向 */
export type Omen = "good" | "neutral" | "bad";
export const OMENS: readonly Omen[] = ["good", "neutral", "bad"];

export interface OutcomeDef {
  weight: number;
  text: string;
  effects: Effects;
  /** 靈犀看到的傾向；沒寫就由效果推出（死亡、損失為凶，有收穫為吉） */
  omen?: Omen;
  /** 每點屬性額外增加的權重 */
  weightPerAttribute?: Partial<Record<AttributeKey, number>>;
}

/** 選項的前提：靈石、物品、屬性下限、持有的殘卷（跨世累積） */
export interface ChoiceRequires {
  spiritStones?: number;
  items?: Record<string, number>;
  attributes?: Partial<Record<AttributeKey, number>>;
  fragments?: string[];
}

export interface ChoiceDef {
  text: string;
  /** 選項的前提，不足時無法選擇 */
  requires?: ChoiceRequires;
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
  /** 兩次出現之間至少隔幾年；沒寫就用 config.eventCooldownYears，0 代表不冷卻。只對能重複出現的事件有意義 */
  cooldownYears?: number;
  /** 一生回顧挑選關鍵事件的分數（預設：抉擇 1、見聞 0.5） */
  highlight?: number;
  conditions: EventConditions;
  /** 依日常安排調整權重的倍率 */
  scheduleWeights?: Record<string, number>;
  /** 為 true 的事件只要條件符合，下一次抽事件時一定先出（開場引路事件用，必須設 ageMax 與 maxPerLife 為 1） */
  guaranteed?: boolean;
  /** 見聞的效果 */
  effects?: Effects;
  choices?: ChoiceDef[];
}

/** 隔世重逢的故人：名字固定；事件寫在 events/ 底下，用 conditions.acquaintance 指向它 */
export interface AcquaintanceDef {
  id: string;
  name: string;
  desc: string;
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

/** breakthroughAid（神光）本身不加數值，只被 breakthroughRule 的 requiresTalent、talentRate 引用 */
export type TalentEffect = "cultivation" | "rerolls" | "fortune" | "stoneCarry" | "failLoss" | "breakthroughAid" | "keepArtifact" | "chartChoice" | "wish" | "omen";

/** 輪迴天賦：每級效果 = perLevel，第 n 級的價格 = ceil(base × growth^(目前等級)) */
export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  effect: TalentEffect;
  perLevel: number;
  cost: { base: number; growth: number };
  /** 推薦：依資料順序，第一個等級還低於 upTo 的天賦會被標為推薦，reason 是推薦的理由 */
  advice?: { upTo: number; reason: string };
}

export type ReviewCause = "lifespan" | "adventure" | "event" | "cleared" | "yuanying" | "huashen" | "zuohua";
export const REVIEW_CAUSES: readonly ReviewCause[] = ["lifespan", "adventure", "event", "cleared", "yuanying", "huashen", "zuohua"];
/** 境界結束這一世時可用的結束方式 */
export type EndingCause = "cleared" | "yuanying" | "huashen";
export const ENDING_CAUSES: readonly EndingCause[] = ["cleared", "yuanying", "huashen"];

/**
 * 一生回顧的收尾句。條件都是選填，有條件的句子要全部符合才可用：
 * ifItem 持有該物品（未用完）；ifFlag 本世有該事件旗標；ifRealmMax 這一世止步於該境界；ifGoalMissed 本世有未完成的目標。
 */
export interface ClosingVariant {
  text: string;
  ifItem?: string;
  ifFlag?: string;
  ifRealmMax?: string;
  ifGoalMissed?: boolean;
}

/** 閉關見聞的語氣：順利、卡在瓶頸、壽元將盡 */
export type RetreatMood = "calm" | "anxious" | "lonely";
export const RETREAT_MOODS: readonly RetreatMood[] = ["calm", "anxious", "lonely"];

/** 閉關見聞的意象：開頭與收尾綁在同一個意象上，孤寂的意象只在孤寂語氣使用 */
export interface RetreatTheme {
  id: string;
  lonely: boolean;
  open: string;
  /** 平常收尾，至少兩句 */
  exit: string[];
  /** 吐槽收尾 */
  gag: string;
}

/** 閉關見聞的感受句，依語氣分池 */
export type RetreatFeel = Record<RetreatMood, string[]>;

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
    /** 不在坊市、由行腳商送來的購買 */
    buyRemote: string[];
    find: string[];
    adventureDeath: string;
    /** 閉關坐化的日誌 */
    zuohua: string;
    /** 小階段升級的里程碑句：鍵是「境界 id:階段索引」，沒有的階段用一般的升級句 */
    stageMilestone: Record<string, string>;
    /** 天劫失敗的日誌；{wave} 是第幾道、{fail} 是該道的失敗描寫 */
    tribulationFail: string;
    /** 煉丹日誌（M29）：{item} 是產出的丹藥，stop 是材料不足而收爐 */
    alchemy: { done: string; fail: string; stop: string };
    /** 煉器日誌（M30）：{item} 是煉成的法寶 */
    forge: { done: string; fail: string };
    /** 宗門日誌（M25）：{sect} 填宗門名稱；promote 以位階 id 為鍵（外門以外的位階都要寫） */
    sect: { join: string; refuse: string; leave: string; promote: Record<string, string> };
    /** 閉關見聞：依閉關長短分檔，結束原因的補句接在後面（時間用完不補） */
    retreat: {
      /** 閉關不滿 retreatBriefYears 年用的簡短句 */
      brief: string[];
      /** 意象：一世內依洗牌後的順序輪流用，不重複 */
      themes: RetreatTheme[];
      /** 感受句：鍵是境界 id，沒有該境界的用 default */
      feel: Record<string, RetreatFeel>;
      /** 罕見句，以 retreatRareChance 的機率取代整句 */
      rare: string[];
      /** 因瓶頸或壽元而收關時，取代收尾的說明句 */
      stop: { bottleneck: string[]; lifespan: string[] };
    };
  };
  /** 年號相關文字：開場日誌（依世數挑）、換世句、回顧的出生句 */
  era: { opening: string[]; transition: string; born: string; origin: Record<string, string[]>; root: Record<string, string[]> };
  /** 金丹卡瓶頸但缺少突破所需的天賦時顯示 */
  breakthroughGate: string;
  /** 擲骰畫面與角色區的說明；# 由介面依 config 填入百分比 */
  guide: { bone: string; insight: string; fortune: string; mind: string; spiritRoot: string };
  /** 天賦頁的推薦與預覽文字；{talent}、{n}、{k}、{realm}、{effect} 由介面填入 */
  talentAdvice: { gate: string; preview: string; shortfall: string; total: string; thresholdMet: string; threshold: string };
  /** 一生回顧「與上一世的差別」的句子；{n} 為數字，{from}、{to} 為進度名稱 */
  versus: {
    ageMore: string;
    ageLess: string;
    ageSame: string;
    progressFar: string;
    progressShort: string;
    progressSame: string;
    originDiff: string;
  };
  /** 收藏畫面的文字 */
  collection: { note: string; empty: string; allCleared: string };
  /** 一生回顧的收尾句，依結束方式分類 */
  review: Record<ReviewCause, ClosingVariant[]>;
}

/** 殘卷：世界內的文獻，跨世保留，只給「知道」不給數值 */
export interface FragmentDef {
  id: string;
  title: string;
  topic: string;
  source: string;
  stance: string;
  era: string;
  /** 1 隨時可得、2 曾達築基後、3 曾達築基後期後 */
  tier: 1 | 2 | 3;
  /** true 表示不進抽取池，只由指定方式取得 */
  fixed?: boolean;
  text: string;
}

export interface FragmentData {
  /** 主題 id → 顯示名稱，殘卷錄依此分組（順序即顯示順序） */
  topics: Record<string, string>;
  /** 立場 id → 顯示名稱 */
  stances: Record<string, string>;
  items: FragmentDef[];
}

/** 隨機姓名：姓 + 名 */
export interface NameData {
  surnames: string[];
  given: string[];
}

/** 每世重抽的名字：每個欄位一個名庫 */
export interface WorldNames {
  countries: string[];
  capitals: string[];
  guards: string[];
  greatSects: string[];
  schools: string[];
  merchants: string[];
  wanderers: string[];
  villages: string[];
  markets: string[];
  mountains: string[];
}

export type Point = [number, number];

/** 地圖的一處地域；land 為 false 的（極北荒原）不屬於任何國家 */
export interface MapRegion {
  id: string;
  name: string;
  land: boolean;
  aura: string;
  desc: string;
  path: string;
  label: Point;
  capital?: Point;
  /** 宗門標記可用的位置 */
  sites?: Point[];
  ferries?: Point[];
  birth?: { village: Point; mountain: Point };
}

/** 顯示座標（橫向版面）與邏輯座標（判定用）的固定線性轉換 */
export interface MapView {
  size: [number, number];
  scale: [number, number];
}

type Rgb = [number, number, number];

/** 地圖繪製用的墨色與標記色，名稱固定，數值在 mapart.json */
export const MAP_INK_KEYS = ["coast", "border", "province", "river", "lake", "shallow", "seaWash", "grid", "symbol", "hill", "forest", "leaf", "jungle", "grass", "reed", "snow", "sand", "land", "gold", "goldLine", "cold", "coldLine", "neutral", "frame", "label", "labelHalo"] as const;
export type MapInkKey = (typeof MAP_INK_KEYS)[number];

/** 地圖的繪製與地形生成參數（只影響顯示） */
export interface MapArtData {
  cells: { count: number; min: number; max: number; jitter: number };
  provinces: { count: number; min: number; max: number; minPerRegion: number };
  edgeMargin: number;
  markerRadius: number;
  coast: { large: number; small: number; islandCutoff: number; islandNear: number; islandFar: number; islandStrength: number; edgePenalty: number; regionJitter: number };
  relief: { inlandRange: number; inlandWeight: number; ridgeWeight: number; ridgeSharp: number; ridgeRamp: number; base: number; slope: number; power: number; north: number; west: number; detail: number; floor: number; smoothPasses: number };
  climate: { base: number; noise: number; coast: number; coastRange: number; south: number; east: number; wetOffset: number; coldGradient: number; coldNoise: number; heightChill: number; chillStart: number };
  river: { minAccumulation: number; lakeFillDelta: number; lakeMinAccumulation: number; jitter: number };
  biome: { peak: number; warmPeak: number; snowTemp: number; coldTemp: number; coldWet: number; mountain: number; hill: number; hotTemp: number; dry: number; wetTemp: number; wet: number; swampHeight: number; forestWet: number; grassWet: number };
  /** 依序對應 12 種生態區 */
  biomes: { name: string; color: Rgb }[];
  parchment: Rgb;
  ink: Record<MapInkKey, Rgb>;
}

/** 世界骨架：每世都一樣 */
export interface MapData {
  viewBox: [number, number];
  /** 天下圖的顯示座標；邏輯座標乘上 scale 得到顯示座標 */
  view: MapView;
  /** 國家顏色，依序分配 */
  palette: string[];
  /** 領（國界格）：邏輯座標上的政治最小單位 */
  fiefRules: { count: number; candidates: number; margin: number; step: number };
  /** 國家數的範圍與預設 */
  nations: { min: number; max: number; default: number };
  territoryRules: { transitionYears: number; travelDelayMonths: number; marketMultiplier: number; greatReach: number; schoolReach: number; prosperReachMultiplier: number; declineReachMultiplier: number; driftPeriodYears: number; driftThreshold: number; strengthWindowYears: number };
  regions: MapRegion[];
  adjacency: Record<string, string[]>;
  stairs: { x: number; y: number; text: string };
  /** 點開地圖標記時的簡介模板，內含 {name}、{region} 等欄位 */
  blurbs: MapBlurbs;
}

export interface MapBlurbs {
  /** 依守梯大宗、大宗、門派 */
  sect: { guard: string; great: string; school: string };
  /** 依宗門狀態接在後面的一句 */
  state: Record<"prosper" | "stable" | "decline" | "closed" | "fallen", string>;
  polity: string;
  tribal: string;
  ferry: string;
  ferryBroken: string;
  merchantHq: string;
  merchantBranch: string;
  village: string;
  market: string;
  mountain: string;
}

/** 歷練遇怪（M34）：怪物與戰鬥規則 */
export type HuntAction = "steady" | "fierce" | "ward";
export const HUNT_ACTIONS: readonly HuntAction[] = ["steady", "fierce", "ward"];

export interface MonsterDef {
  id: string;
  name: string;
  /** 出沒的境界 id */
  realm: string;
  /** 相對於該境界基準戰力的倍數 */
  power: number;
  /** 勝利得到的修為，單位為「閉關一個月的修為」 */
  reward: number;
  stones: { min: number; max: number };
  drops: { itemId: string; chance: number }[];
  appear: string;
  win: string;
  /** 勝三次後解鎖的一句見聞（選填，GDD 16.3） */
  lore?: string;
  /** 各結局自己的文字（選填）；沒寫就用 rules.text 的共用句 */
  loseText?: string;
  fleeOkText?: string;
  fleeFailText?: string;
  drawText?: string;
  /** 特性 id（rules.traits 的鍵）；沒寫就是沒有特性 */
  trait?: string;
}

/** 怪物特性：只改變打法，不直接加減戰力。三個欄位至少寫一個 */
export interface HuntTraitDef {
  name: string;
  desc: string;
  /** 穩打的傷害倍數（厚皮，< 1） */
  steadyDmg?: number;
  /** 每回合反擊傷害倍數（迅捷，> 1） */
  takenMul?: number;
  /** 逃跑成功率扣掉的值（狡詐） */
  fleePenalty?: number;
}

export interface HuntActionDef {
  name: string;
  /** 基礎命中率 */
  hit: number;
  /** 命中時對怪物造成的氣血比例（怪物氣血為 1） */
  dmg: number;
  /** 每回合怪物反擊對玩家造成的氣血比例（玩家氣血為 1） */
  taken: number;
}

export interface HuntRules {
  /** 會遇怪的日常安排 id */
  schedule: string;
  /** 外出歷練時每月遇怪的機率 */
  chance: number;
  /** 最多幾回合，打不死怪物就算平手 */
  rounds: number;
  realmPower: Record<string, number>;
  /** 每個小階段加成的戰力比例 */
  stagePower: number;
  /** 根骨每高於 5 一點加成的戰力比例 */
  bonePower: number;
  /** 戰力比每高於 1，命中率增加多少 */
  ratioHit: number;
  /** 傷害的隨機浮動幅度 */
  variance: number;
  /** 敗北損失目前修為的比例 */
  lossFrac: number;
  /** 打滿回合算平手時，損失目前修為的比例（M39：平手也要付點代價） */
  drawLossFrac: number;
  flee: { base: number; perRatio: number; perFortune: number; min: number; max: number; failLoss: number };
  /** 自動抉擇時，戰力比低於這個值就逃，否則穩打 */
  autoMinRatio: number;
  actions: Record<HuntAction, HuntActionDef>;
  traits: Record<string, HuntTraitDef>;
  text: { lose: string; fleeOk: string; fleeFail: string; draw: string };
}

export interface MonstersData {
  rules: HuntRules;
  monsters: MonsterDef[];
}

/** 秘境試煉通關的一次性獎勵（M47）：修為以「閉關幾個月」計，靈石在範圍內抽，物品是固定數量 */
export interface TrialReward {
  cultivationMonths: number;
  stones: { min: number; max: number };
  items: Record<string, number>;
}

/** 一座秘境（M47）：每層一名怪物，進入時就扣固定月數；每世每座只能入一次 */
export interface TrialDef {
  id: string;
  name: string;
  desc: string;
  /** 必須是目前境界才能入 */
  realm: string;
  months: number;
  /** 每層的怪物 id，依序打；怪物須屬於同一境界 */
  floors: string[];
  reward: TrialReward;
  /** 這座秘境自己的地形規則（M58）；至少寫一項效果 */
  rule: TrialRule;
}

/** 秘境的地形規則：只在這座秘境的戰鬥裡生效 */
export interface TrialRule {
  name: string;
  desc: string;
  /** 每回合額外承受的氣血比例（落石、罡風） */
  extraTaken?: number;
  /** 不能逃跑（狹窄的洞窟） */
  noFlee?: boolean;
  /** 戰鬥符籙的傷害倍數（> 1） */
  wardDmgMul?: number;
  /** 所有招式的命中率扣掉的值 */
  hitPenalty?: number;
}

export interface TrialsData {
  rules: {
    /** 進入後壽元至少還要剩「花費月數 + 這個值」，免得在秘境裡耗盡壽元 */
    lifespanBuffer: number;
    /** 層間休整（M58）：每次調息花 months 個月、回復 heal 氣血，每座最多 max 次 */
    rest: { months: number; heal: number; max: number };
    /** 日誌用句，{trial} 換成秘境名稱 */
    text: { enter: string; clear: string; fail: string; abandon: string };
  };
  trials: TrialDef[];
}

/** 天劫的數值與文字（M28） */
export interface TribulationData {
  /** 運功護體：成功率 + 心性 × perMind（上限 max），這一道失敗時額外損失 extraLoss 的修為 */
  guard: { perMind: number; max: number; extraLoss: number };
  /** 每一道的成功率上限 */
  maxChance: number;
  /** 在光圈收攏時選擇（凝神），這一道的成功率增加多少 */
  focusBonus: number;
  /** 劫波意象，依道數循環使用 */
  images: { name: string; arrive: string; pass: string; fail: string }[];
}

/** 宗門位階（外門到長老）的資料 */
export interface SectRankDef {
  id: string;
  name: string;
  /** 修煉加成（乘上宗門規模與興衰） */
  bonus: number;
  /** 每年月例靈石，入宗滿一年發一次（乘上宗門規模與興衰，四捨五入） */
  stipend: number;
  /** 做宗門差事時每月得到的貢獻 */
  duty: number;
  /** 晉升到這個位階需要的境界與貢獻；外門沒有 */
  promote?: { realm: string; contribution: number };
}

/** 宗門系統的數值（M25）：入宗試煉、位階、加成、庫房 */
export interface SectsData {
  join: {
    minRealm: string;
    minStage: number;
    baseRate: Record<"great" | "school", number>;
    stateMult: Record<"prosper" | "stable" | "decline", number>;
    insightBonus: number;
    boneBonus: number;
    /** 靈根 id → 額外成功率 */
    rootBonus: Record<string, number>;
  };
  scale: Record<"great" | "school", number>;
  /** 各種宗門最高能到的位階索引 */
  maxRank: Record<"great" | "school", number>;
  bonusState: Record<"prosper" | "stable" | "decline", number>;
  ranks: SectRankDef[];
  discount: { itemIds: string[]; mult: number };
  /** 宗門差事對應的日常安排 id */
  dutySchedule: string;
}

export const SECT_STATES = ["prosper", "stable", "decline", "closed", "fallen"] as const;
export type SectState = (typeof SECT_STATES)[number];

export const WORLD_EVENT_KINDS = [
  "merchant",
  "sectState",
  "sectRank",
  "sectNew",
  "merge",
  "split",
  "owner",
  "polityNew",
  "rename",
  "capital",
  "ferry",
] as const;
export type WorldEventKind = (typeof WORLD_EVENT_KINDS)[number];

/** 世局候選池的一條：生成世界時按權重抽出，並綁定到具體對象 */
export interface WorldEventDef {
  id: string;
  kind: WorldEventKind;
  target: string;
  to?: string;
  /** 目標目前的狀態必須在其中，否則這一條在這個世界裡不成立 */
  from?: string[];
  ageMin: number;
  ageMax: number;
  weight: number;
  /** 互斥群，同群至多抽一條 */
  group: string;
  note: string;
}

/** 世局條件：全部成立才算符合 */
export interface WorldWhen {
  /** 守梯宗門目前的狀態 */
  guardState?: SectState[];
  /** 商行已設分號的地域數下限 */
  merchantBranchesMin?: number;
  /** 毀去的渡口數下限 */
  ferriesBrokenMin?: number;
}

/** 世局效果在天下圖上對應的標記類別 */
export const MAP_REFS = ["guard", "ferry", "merchant"] as const;
export type MapRef = (typeof MAP_REFS)[number];

/** 世局效果（M17）：當下世局符合 when 的全部條件時，坊市價格乘上 market 的倍率，事件條件可用它的 id */
export interface WorldEffectDef {
  id: string;
  when: WorldWhen;
  /** 物品 id → 價格倍率 */
  market: Record<string, number>;
  /** 坊市旁顯示的原因，可用名稱欄位 */
  reason: string;
  /** 天下圖上點選這類標記時，一併標出這條效果 */
  mapRef?: MapRef;
}

/** 每世目標的達成條件；全由既有的狀態欄位算出，不新增任何追蹤 */
export type GoalCondition =
  | { kind: "realm"; realmId: string; stage?: number }
  | { kind: "age"; years: number }
  | { kind: "fragments"; count: number }
  | { kind: "flag"; flagId: string }
  | { kind: "events"; count: number };

/** 每世目標：開局抽出，只作收藏，不給道韻、不動數值 */
export interface GoalDef {
  id: string;
  name: string;
  desc: string;
  /** 同一世每個群組至多抽一個，讓目標類型有變化 */
  group: string;
  /** 已走完至少這麼多世才會抽到 */
  minLives: number;
  condition: GoalCondition;
  /** 夙願（M44）：被指定為夙願時，下列事件的權重乘上 wishWeightMult；沒寫就只是標記，不影響事件 */
  tilt?: GoalTilt;
}

/** 夙願偏向的事件：直接點名、要求或設定某旗標、或與某位故人相關，符合任一項即算 */
export interface GoalTilt {
  eventIds?: string[];
  flags?: string[];
  acquaintances?: string[];
}

export interface GameData {
  config: GameConfig;
  realms: RealmDef[];
  schedules: ScheduleDef[];
  items: ItemDef[];
  recipes: RecipesData;
  monsters: MonstersData;
  trials: TrialsData;
  methods: MethodDef[];
  events: EventDef[];
  talents: TalentDef[];
  spiritRoots: SpiritRootDef[];
  origins: OriginDef[];
  text: TextData;
  names: NameData;
  fragments: FragmentData;
  worldNames: WorldNames;
  map: MapData;
  mapart: MapArtData;
  worldEvents: WorldEventDef[];
  worldRelations: WorldRelationsData;
  worldEffects: WorldEffectDef[];
  goals: GoalDef[];
  sects: SectsData;
  tribulation: TribulationData;
  /** 年號清單，依世數循環使用 */
  eras: string[];
  /** 隔世重逢的故人 */
  acquaintances: AcquaintanceDef[];
}

export type WorldRelationType = "ally" | "feud" | "allyEnd" | "feudEnd";

/** 宗門與國家關係的世局變化候選 */
export interface WorldRelationChangeDef {
  id: string;
  type: WorldRelationType;
  ageMin: number;
  ageMax: number;
  weight: number;
  /** 模板欄位只有 {sect}、{polity} */
  note: string;
}

export interface WorldRelationsData {
  initial: { allyChance: number; feudChance: number };
  /** 邏輯座標：山門到國家（最近的領中心）在此距離內才算候選 */
  candidateDistance: number;
  /** S3：入宗者所在宗門與當地國的關係對旅行與物價的影響（上限由驗證守住） */
  effects: { feudTravelMonths: number; feudPriceMult: number; allyPriceMult: number };
  /** S2：關係對世局生成的權重倍率。互惠的兩國較易併、較少互奪領；世仇的兩國較少併、較常奪領。1 是中性 */
  influence: { mergeAlly: number; mergeFeud: number; ownerAlly: number; ownerFeud: number };
  /** 每世的關係變動次數 */
  changeCount: { min: number; max: number };
  changes: WorldRelationChangeDef[];
}
