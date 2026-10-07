// 離線進度：離線期間視為閉關，只推進修為與年齡，不觸發事件，也不會死亡。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { lifespanMonths } from "./formulas";
import { addLog, atBottleneck, realmOf } from "./progress";
import type { GameState, OfflineStop } from "./state";
import { advanceStreak } from "./character/fatigue";
import { accrueFocus } from "./character/focus";
import { stepStance } from "./character/stance";
import { addCultivation, monthlyGain } from "./tick";

export type { OfflineStop };

export interface OfflineSummary {
  /** 實際閉關的月數 */
  months: number;
  /** 閉關期間累積的修為總量（含已用於升級的部分） */
  gained: number;
  /** 為何結束：時間用完、卡在瓶頸、壽元將盡 */
  stop: OfflineStop;
}

export interface OfflineOptions {
  /** 少於這麼多秒不算；預設 config.offlineMinSeconds（分頁切到背景再回來用較小的值） */
  minSeconds?: number;
  /** 遊戲速度倍率（M40）；離線重新開啟時為 1，分頁背景回來時傳入當前速度 */
  speed?: number;
}

/** 離線 elapsedMs 毫秒的結果。不是修行中、或正在等待抉擇時原樣回傳（months 為 0）。 */
export function applyOffline(
  state: GameState,
  elapsedMs: number,
  data: GameData = gameData,
  opts: OfflineOptions = {},
): { state: GameState; summary: OfflineSummary } {
  const { config } = data;
  const idle = (stop: OfflineStop): { state: GameState; summary: OfflineSummary } => ({
    state,
    summary: { months: 0, gained: 0, stop },
  });
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null) return idle("elapsed");
  if (!(elapsedMs >= (opts.minSeconds ?? config.offlineMinSeconds) * 1000)) return idle("elapsed");

  const capped = Math.min(elapsedMs, config.offlineMaxHours * 3_600_000);
  const budget = Math.min(Math.floor((capped * (opts.speed ?? 1)) / config.msPerMonth), Math.floor(config.offlineMaxYears * 12));
  const sched = data.schedules.find((s) => s.id === "retreat");
  if (!sched) throw new Error("離線進度：找不到閉關修煉（retreat）安排");

  let s = state;
  let months = 0;
  let stop: OfflineStop = "elapsed";
  let gained = 0;
  while (months < budget) {
    if (atBottleneck(s, data)) {
      stop = "bottleneck";
      break;
    }
    const total = lifespanMonths(realmOf(s, data), s.lifespanBonus);
    // 再走一個月後壽元剩餘不足門檻就停，保證不會在離線時老死
    if (total - (s.ageMonths + 1) < total * config.offlineStopLifespanRatio) {
      stop = "lifespan";
      break;
    }
    gained += monthlyGain(s, sched, data);
    s = advanceStreak(addCultivation(accrueFocus({ ...s, ageMonths: s.ageMonths + 1 }, data), sched, s.ageMonths + 1, data), sched, true, data);
    s = stepStance(s, s.ageMonths, data);
    months++;
  }
  if (months > 0) {
    // 閉關見聞：文字依閉關長短與結束原因由介面挑選，這裡只記事實，不動亂數
    // 序號與世界種子供顯示時挑意象（一世內不重複）；序號取目前日誌裡最大的接下去，日誌被截斷也不會倒退
    const retreatNo = s.log.reduce((m, e) => (e.kind === "retreat" && e.retreatNo !== undefined ? Math.max(m, e.retreatNo + 1) : m), 0);
    s = addLog(
      s,
      { month: s.ageMonths, kind: "retreat", realmId: s.realmId, stage: s.stage, retreatMonths: months, stop, retreatNo, retreatSeed: s.worldSeed },
      config.logLimit,
    );
  }
  return { state: s, summary: { months, gained, stop } };
}
