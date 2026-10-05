// 一生的結束：回顧、道韻結算。死亡與通關的每個出口都從 endLife 進來，確保只結算一次。
import { gameData } from "../data/load";
import type { GameData, ReviewCause } from "../data/types";
import { CLEAR_FRAGMENT_ID, grantFragment } from "./fragments";
import { eventOf, realmOf } from "./progress";
import type { GameState, LifeReview, LogEntry } from "./state";

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
 * 呼叫前，死亡或通關的日誌應已寫好。已結算過的狀態原樣回傳。
 */
export function endLife(state: GameState, cause: ReviewCause, data: GameData = gameData): GameState {
  if (state.review !== null) return state;
  const { base, bonus, newlyReached } = settleDaoYun(state, data);
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
  };
  // 首次通關固定得到最後一份殘卷
  const earned = cause === "cleared" ? grantFragment(state, CLEAR_FRAGMENT_ID) : state;
  return {
    ...state,
    phase: cause === "cleared" ? "cleared" : "dead",
    pendingEvent: null,
    review,
    meta: {
      ...state.meta,
      daoYun: state.meta.daoYun + base + bonus,
      reached: [...state.meta.reached, ...newlyReached],
      lives: state.meta.lives + 1,
      fragments: earned.meta.fragments,
    },
  };
}
