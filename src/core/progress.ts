// 境界、瓶頸、日誌等 tick 與事件共用的基礎函式。
import { gameData } from "../data/load";
import type { EventDef, GameData, RealmDef, ScheduleDef } from "../data/types";
import { lifespanMonths, stageNeed } from "./formulas";
import type { GameState, LogEntry } from "./state";

export function realmOf(state: GameState, data: GameData = gameData): RealmDef {
  const realm = data.realms.find((r) => r.id === state.realmId);
  if (!realm) throw new Error(`狀態：找不到境界 ${state.realmId}`);
  return realm;
}

export function scheduleOf(state: GameState, data: GameData = gameData): ScheduleDef {
  const sched = data.schedules.find((s) => s.id === state.schedule);
  if (!sched) throw new Error(`狀態：找不到日常安排 ${state.schedule}`);
  return sched;
}

export function eventOf(id: string, data: GameData = gameData): EventDef {
  const ev = data.events.find((e) => e.id === id);
  if (!ev) throw new Error(`事件：找不到事件 ${id}`);
  return ev;
}

export function nextRealm(realm: RealmDef, data: GameData = gameData): RealmDef | undefined {
  return data.realms[data.realms.findIndex((r) => r.id === realm.id) + 1];
}

/** 目前的壽元上限（年），含延壽丹與事件造成的增減 */
export function lifespanYears(state: GameState, data: GameData = gameData): number {
  return lifespanMonths(realmOf(state, data), state.lifespanBonus) / 12;
}

/** 修為已滿、卡在最後一階段的瓶頸（需要手動突破，或後面沒有境界可進） */
export function atBottleneck(state: GameState, data: GameData = gameData): boolean {
  const realm = realmOf(state, data);
  if (state.stage !== realm.stageNames.length - 1) return false;
  if (state.cultivation < stageNeed(realm, state.stage)) return false;
  return realm.breakthrough === "manual" || nextRealm(realm, data) === undefined;
}

export function addLog(state: GameState, entry: LogEntry, limit: number): GameState {
  return { ...state, log: [...state.log, entry].slice(-limit) };
}

/** 修為滿了就升級，直到修為不足或卡在瓶頸 */
export function resolveStages(state: GameState, month: number, data: GameData = gameData): GameState {
  let s = state;
  for (;;) {
    const realm = realmOf(s, data);
    const need = stageNeed(realm, s.stage);
    if (s.cultivation < need) return s;
    if (s.stage < realm.stageNames.length - 1) {
      s = addLog(
        { ...s, cultivation: s.cultivation - need, stage: s.stage + 1 },
        { month, kind: "stageUp", realmId: s.realmId, stage: s.stage + 1 },
        data.config.logLimit,
      );
      continue;
    }
    const next = nextRealm(realm, data);
    if (realm.breakthrough === "auto" && next) {
      s = addLog(
        { ...s, cultivation: s.cultivation - need, realmId: next.id, stage: 0 },
        { month, kind: "realmUp", realmId: next.id, stage: 0 },
        data.config.logLimit,
      );
      continue;
    }
    // 瓶頸：修為停在上限，等玩家手動突破
    return addLog(
      { ...s, cultivation: need },
      { month, kind: "bottleneck", realmId: s.realmId, stage: s.stage },
      data.config.logLimit,
    );
  }
}
