// 離線進度：離線期間視為閉關，只推進修為與年齡，不觸發事件，也不會死亡。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { lifespanMonths } from "./formulas";
import { addLog, atBottleneck, realmOf } from "./progress";
import type { GameState, OfflineStop } from "./state";
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

/** 離線 elapsedMs 毫秒的結果。不是修行中、或正在等待抉擇時原樣回傳（months 為 0）。 */
export function applyOffline(
  state: GameState,
  elapsedMs: number,
  data: GameData = gameData,
): { state: GameState; summary: OfflineSummary } {
  const { config } = data;
  const idle = (stop: OfflineStop): { state: GameState; summary: OfflineSummary } => ({
    state,
    summary: { months: 0, gained: 0, stop },
  });
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null) return idle("elapsed");
  if (!(elapsedMs >= config.offlineMinSeconds * 1000)) return idle("elapsed");

  const capped = Math.min(elapsedMs, config.offlineMaxHours * 3_600_000);
  const budget = Math.min(Math.floor(capped / config.msPerMonth), Math.floor(config.offlineMaxYears * 12));
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
    s = addCultivation({ ...s, ageMonths: s.ageMonths + 1 }, sched, s.ageMonths + 1, data);
    months++;
  }
  if (months > 0) {
    // 閉關見聞：文字依閉關長短與結束原因由介面挑選，這裡只記事實，不動亂數
    s = addLog(
      s,
      { month: s.ageMonths, kind: "retreat", realmId: s.realmId, stage: s.stage, retreatMonths: months, stop },
      config.logLimit,
    );
  }
  return { state: s, summary: { months, gained, stop } };
}
