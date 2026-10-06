// 一生的結束：回顧、道韻結算。死亡、通關與元嬰大成的每個出口都從 endLife 進來，確保只結算一次。
import { gameData } from "../data/load";
import type { EndingCause, GameData, RealmDef, ReviewCause } from "../data/types";
import { CLEAR_FRAGMENT_ID, grantFragment } from "./fragments";
import { goalStatuses, lifeBrief } from "./goals";
import { eventOf, realmOf } from "./progress";
import type { GameState, LifeReview, LogEntry } from "./state";

/** 通關後仍繼續活著的那一世，用旗標標示（只在介面顯示「已通關」） */
export const CLEARED_FLAG = "cleared";

/** 各出身通關次數的總和 */
export function totalClears(state: GameState): number {
  return Object.values(state.meta.clears).reduce((sum, n) => sum + n, 0);
}

/** 結嬰後仍繼續活著的那一世，用旗標標示（只在介面顯示「已結嬰」） */
export const YUANYING_FLAG = "yuanying";

/** 各出身元嬰次數的總和 */
export function totalYuanying(state: GameState): number {
  return Object.values(state.meta.yuanying).reduce((sum, n) => sum + n, 0);
}

/** 進入這個境界是否結束這一世。untilCleared、untilYuanying 看的是進入之前的紀錄。 */
export function endsLifeOnEntry(realm: RealmDef, state: GameState): boolean {
  if (realm.endsLife === "always") return true;
  if (realm.endsLife === "untilCleared") return totalClears(state) === 0;
  return realm.endsLife === "untilYuanying" && totalYuanying(state) === 0;
}

/** 記一次元嬰：該出身次數加一。結束這一世與繼續活著的元嬰都走這裡。 */
export function applyYuanying(state: GameState): GameState {
  return {
    ...state,
    meta: {
      ...state.meta,
      yuanying: { ...state.meta.yuanying, [state.originId]: (state.meta.yuanying[state.originId] ?? 0) + 1 },
    },
  };
}

/** 記一次化神大成：該出身次數加一。化神是終局，只走結束這一世的路。 */
export function applyHuashen(state: GameState): GameState {
  return {
    ...state,
    meta: {
      ...state.meta,
      huashen: { ...state.meta.huashen, [state.originId]: (state.meta.huashen[state.originId] ?? 0) + 1 },
    },
  };
}

/** 繼續活著的突破：依這個境界的結束方式記一次紀錄並加上旗標，這一世不結束 */
export function applyEndingAndContinue(state: GameState, ending: EndingCause): GameState {
  const flag = ending === "yuanying" ? YUANYING_FLAG : CLEARED_FLAG;
  const recorded = ending === "yuanying" ? applyYuanying(state) : applyClear(state);
  return { ...recorded, flags: recorded.flags.includes(flag) ? recorded.flags : [...recorded.flags, flag] };
}

/** 記一次通關：該出身次數加一，首次通關得固定殘卷。結束這一世與繼續活著的通關都走這裡。 */
export function applyClear(state: GameState): GameState {
  const withFragment = grantFragment(state, CLEAR_FRAGMENT_ID);
  return {
    ...withFragment,
    meta: {
      ...withFragment.meta,
      clears: { ...state.meta.clears, [state.originId]: (state.meta.clears[state.originId] ?? 0) + 1 },
    },
  };
}

/** 回顧要挑出的關鍵事件數量 */
export const HIGHLIGHT_COUNT = 5;

/** 日誌條目的關鍵度分數；0 代表不列入。事件用資料裡的 highlight，沒寫則抉擇 1、見聞 0.5。 */
export function highlightScore(entry: LogEntry, data: GameData = gameData): number {
  switch (entry.kind) {
    case "breakthroughSuccess":
      return 5;
    case "realmUp":
      return 2;
    case "find":
      return 0.8;
    case "event": {
      const ev = eventOf(entry.eventId!, data);
      return ev.highlight ?? (ev.type === "choice" ? 1 : 0.5);
    }
    default:
      return 0;
  }
}

/** 挑出分數最高的幾條（同分取較近的），再依時間排序 */
export function selectHighlights(log: LogEntry[], data: GameData = gameData, count = HIGHLIGHT_COUNT): LogEntry[] {
  return log
    .map((entry, index) => ({ entry, index, score: highlightScore(entry, data) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.entry);
}

export interface DaoYunResult {
  base: number;
  bonus: number;
  /** 本世新達成的階段，要記進 meta.reached */
  newlyReached: string[];
}

/**
 * 道韻結算：每個到達過的階段依境界設定給點數，凡人不給。
 * 第一次達成的階段（跨世只算一次）額外再得 (倍率 − 1) 倍。
 */
export function settleDaoYun(state: GameState, data: GameData = gameData): DaoYunResult {
  let base = 0;
  let bonus = 0;
  const newlyReached: string[] = [];
  for (const realm of data.realms) {
    if (realm.daoYun <= 0) {
      if (realm.id === state.realmId) break;
      continue;
    }
    const lastStage = realm.id === state.realmId ? state.stage : realm.stageNames.length - 1;
    for (let stage = 0; stage <= lastStage; stage++) {
      base += realm.daoYun;
      const key = `${realm.id}:${stage}`;
      if (!state.meta.reached.includes(key)) {
        bonus += realm.daoYun * (data.config.daoYunFirstTimeMult - 1);
        newlyReached.push(key);
      }
    }
    if (realm.id === state.realmId) break;
  }
  return { base, bonus, newlyReached };
}

/** 挑收尾句：持有對應物品的優先，否則在不限物品的句子中輪流選 */
export function pickClosing(state: GameState, cause: ReviewCause, data: GameData = gameData): number {
  const variants = data.text.review[cause];
  const byItem = variants.findIndex((v) => v.ifItem !== undefined && (state.items[v.ifItem] ?? 0) > 0);
  if (byItem !== -1) return byItem;
  const plain = variants.map((v, i) => (v.ifItem === undefined ? i : -1)).filter((i) => i >= 0);
  return plain[state.ageMonths % plain.length];
}

/**
 * 結束這一世：產生一生回顧、結算道韻、更新跨世資料，並進入死亡（或通關）階段。
 * 呼叫前，死亡或通關的日誌應已寫好。已結算過的狀態原樣回傳。extraBase 是額外的基本道韻（坐化用）。
 */
export function endLife(state: GameState, cause: ReviewCause, data: GameData = gameData, extraBase = 0): GameState {
  if (state.review !== null) return state;
  const settled = settleDaoYun(state, data);
  const { bonus, newlyReached } = settled;
  // extraBase：坐化把剩餘壽元折成的道韻，算進基本道韻
  const base = settled.base + extraBase;
  const review: LifeReview = {
    cause,
    closing: pickClosing(state, cause, data),
    ageMonths: state.ageMonths,
    originId: state.originId,
    spiritRootId: state.spiritRootId,
    realmId: realmOf(state, data).id,
    stage: state.stage,
    breakthroughs: state.breakthroughs,
    daoYunBase: base,
    daoYunBonus: bonus,
    highlights: selectHighlights(state.log, data),
    goals: goalStatuses(state, data).map((g) => ({ id: g.def.id, done: g.done })),
    prev: state.meta.lastLife,
  };
  // 目標達成次數：只收藏
  const goals = { ...state.meta.goals };
  for (const g of review.goals) if (g.done) goals[g.id] = (goals[g.id] ?? 0) + 1;
  // 通關：記一次通關，首次得到最後一份殘卷
  const earned = cause === "cleared" ? applyClear(state) : state;
  // 元嬰大成：記一次元嬰，不另算通關
  const yuanying = cause === "yuanying" ? applyYuanying(state).meta.yuanying : state.meta.yuanying;
  // 化神大成：記一次化神，不另算通關與元嬰
  const huashen = cause === "huashen" ? applyHuashen(state).meta.huashen : state.meta.huashen;
  return {
    ...state,
    phase: cause === "cleared" || cause === "yuanying" || cause === "huashen" ? "cleared" : "dead",
    pendingEvent: null,
    review,
    meta: {
      ...state.meta,
      daoYun: state.meta.daoYun + base + bonus,
      reached: [...state.meta.reached, ...newlyReached],
      lives: state.meta.lives + 1,
      fragments: earned.meta.fragments,
      clears: earned.meta.clears,
      yuanying,
      huashen,
      goals,
      lastLife: lifeBrief(state),
    },
  };
}
