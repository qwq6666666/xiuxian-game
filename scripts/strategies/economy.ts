import { canStartBrew, startBrew } from "../../src/core/alchemy";
import { ALCHEMY_SCHEDULE } from "../../src/data/types";
import { beginTravel, placesAt, routeTo } from "../../src/core/travel";
import { canJoinSect, canPromoteSect, joinSect, nextRank, promoteSect } from "../../src/core/sect";
import { buyItem, canBuyItem, canUseItem, setSchedule, useItem } from "../../src/core/actions";
import { attemptBreakthrough, autoTribulation, canChooseWave, faceWave } from "../../src/core/breakthrough";
import type { GameState } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { strategy } from "./context";
import { mixedActions } from "./common";

/** 採藥丹修策略的每月操作：一直採藥，凡人以外有錢就買聚氣丹、能服就服 */
export function herbActions(state: GameState): GameState {
  let s = setSchedule(state, "herb", gameData);
  while (s.realmId !== "mortal" && canBuyItem(s, "juqi_dan", gameData)) s = buyItem(s, "juqi_dan", gameData);
  while (canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
  return s;
}

/** 煉丹策略的統計：開爐數與出爐結果 */
export const alchemyStats = { brews: 0, done: 0, failed: 0, halts: 0, lives: 0, brewLives: 0, brewedThisLife: false };

/** 煉丹策略的每月操作（最壞情況）：永遠採藥、有錢就買丹，同時有材料就開爐煉丹；煉丹中只服丹，不動安排 */
export function alchemyActions(state: GameState): GameState {
  let s = state;
  const last = s.log[s.log.length - 1];
  if (last && last.month === s.ageMonths) {
    if (last.kind === "alchemyDone") alchemyStats.done++;
    else if (last.kind === "alchemyFail") alchemyStats.failed++;
    else if (last.kind === "alchemyStop") alchemyStats.halts++;
  }
  if (s.schedule === ALCHEMY_SCHEDULE) {
    while (canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
    return s;
  }
  s = herbActions(s);
  if (s.realmId !== "mortal") {
    const first = s.realmId === "lianqi" && s.stage >= 6 && (s.items.huxin_dan ?? 0) === 0 ? "huxin_dan" : "juqi_dan";
    for (const id of [first, "juqi_dan"]) {
      if (canStartBrew(s, id, gameData)) {
        s = startBrew(s, id, gameData);
        alchemyStats.brews++;
        alchemyStats.brewedThisLife = true;
        break;
      }
    }
  }
  return s;
}

/** 入宗策略的每月操作：練氣三層起去最近的開放宗門求入宗；入宗後境界夠了但貢獻不足就做差事，條件滿足就晉升 */
export const sectStats = { tries: 0, joins: 0, lives: 0, peaks: [0, 0, 0, 0, 0] };
export function sectActions(state: GameState): GameState {
  let s = state;
  if (s.sect === null) {
    if (canJoinSect(s, gameData)) {
      const before = s.sectsTried.length;
      s = joinSect(s, gameData);
      if (s.sectsTried.length > before) sectStats.tries++;
      if (s.sect !== null) sectStats.joins++;
      return s;
    }
    const ready = s.realmId !== "mortal" && (s.realmId !== "lianqi" || s.stage >= gameData.sects.join.minStage);
    if (ready && s.travel.targetId === null && s.pendingEvent === null) {
      const options = placesAt(s, gameData)
        .filter((p) => p.kind === "sect" && !s.sectsTried.includes(p.id.slice(5)) && !p.status.includes("閉山") && !p.status.includes("覆滅"))
        .map((p) => ({ p, months: routeTo(s, p.id, gameData)?.months ?? Infinity }))
        .sort((a, b) => a.months - b.months);
      if (options.length > 0 && Number.isFinite(options[0].months)) s = beginTravel(s, options[0].p.id, gameData);
    }
    return s;
  }
  if (canPromoteSect(s, gameData)) s = promoteSect(s, gameData);
  const next = nextRank(s, gameData);
  const idx = (id: string): number => gameData.realms.findIndex((r) => r.id === id);
  const wantDuty = next?.def.promote !== undefined && idx(s.realmId) >= idx(next.def.promote.realm) - 0 && s.sect!.contribution < next.def.promote.contribution;
  s = setSchedule(s, wantDuty ? gameData.sects.dutySchedule : "retreat", gameData);
  return s;
}

/** 天劫統計：各境界（離開的境界）的嘗試次數與成功次數 */
export const tribStats: Record<string, { attempts: number; wins: number }> = {};

/** 嘗試突破並走完天劫：tribulation 策略先備好符籙、每一道用符籙或護體，其他策略每一道硬抗 */
export function breakthroughWithTribulation(state: GameState): GameState {
  const from = state.realmId;
  const rule = gameData.realms.find((r) => r.id === from)?.breakthroughRule;
  let s = state;
  if (strategy === "tribulation" && rule?.tribulation) {
    while ((s.items.bilei_fu ?? 0) < rule.tribulation.waves && canBuyItem(s, "bilei_fu", gameData)) s = buyItem(s, "bilei_fu", gameData);
  }
  s = attemptBreakthrough(s, true, gameData);
  if (strategy === "tribulation") {
    while (s.tribulation !== null) s = faceWave(s, canChooseWave(s, "ward", gameData) ? "ward" : "guard", gameData);
  } else s = autoTribulation(s, gameData);
  if (rule?.tribulation) {
    const row = (tribStats[from] ??= { attempts: 0, wins: 0 });
    row.attempts++;
    if (s.realmId !== from) row.wins++;
  }
  return s;
}

/** 走訪渡口策略的每月操作：練氣之後一直走訪，其餘照 mixed 買賣丹藥 */
export function wanderActions(state: GameState): GameState {
  const s = mixedActions(state);
  return s.realmId === "mortal" ? s : setSchedule(s, "wander", gameData);
}

