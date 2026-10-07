import { autoEncounter } from "../../src/core/encounter";
import { canEnterTrial, enterTrial, trialsFor } from "../../src/core/trial";
import { setSchedule } from "../../src/core/actions";
import type { GameState } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { mixedActions } from "./common";

/** 遇怪統計（hunt 策略專用）：各結果的次數 */
export const huntStats = { win: 0, lose: 0, flee: 0, fleeFail: 0, draw: 0, gain: 0 };

/** 把進行中的遇怪用預設打法打完，並統計結果 */
export function settleEncounter(state: GameState): GameState {
  if (state.encounter === null) return state;
  const s = autoEncounter(state, gameData);
  const last = s.log[s.log.length - 1];
  if (last?.kind === "huntWin") { huntStats.win++; huntStats.gain += last.changes?.cultivation ?? 0; }
  else if (last?.kind === "huntLose") huntStats.lose++;
  else if (last?.kind === "huntDraw") huntStats.draw++;
  else if (last?.kind === "huntFlee") { if (last.outcome === 1) huntStats.fleeFail++; else huntStats.flee++; }
  return s;
}

/** 打怪策略的每月操作（上限檢查）：一直外出歷練，其餘照 mixed 買賣丹藥 */
export function huntActions(state: GameState): GameState {
  const s = mixedActions(state);
  return setSchedule(s, "adventure", gameData);
}

/** 秘境統計（trial 策略專用）：入過幾次、通關、敗退、中途抽身 */
export const trialStats = { entered: 0, clear: 0, fail: 0, abandon: 0, months: 0 };

/** 秘境策略的每月操作（上限檢查）：同 mixed，另外一到能入的境界就把這一世能入的秘境都入一次，用預設打法打完 */
export function trialActions(state: GameState): GameState {
  let s = mixedActions(state);
  for (const def of trialsFor(s, gameData)) {
    if (!canEnterTrial(s, def.id, gameData)) continue;
    trialStats.entered++;
    trialStats.months += def.months;
    s = autoEncounter(enterTrial(s, def.id, gameData), gameData);
    const last = [...s.log].reverse().find((e) => e.kind === "trialClear" || e.kind === "trialFail");
    if (last?.kind === "trialClear") trialStats.clear++;
    else if (last?.outcome === 1) trialStats.abandon++;
    else trialStats.fail++;
  }
  return s;
}

/** 最後一次叩關（lianqi_last_push）統計：出現次數、第一世出現次數、衝關成敗與選擇放下的次數 */
export const pushStats = { seen: 0, seenFirst: 0, win: 0, lose: 0, calm: 0 };

