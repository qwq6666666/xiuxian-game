import { gameData } from "../data/load";
import type { GameData, RealmDef } from "../data/types";
import { cultivationPerMonth, lifespanMonths, stageNeed } from "./formulas";
import type { GameState, LogEntry } from "./state";

export function realmOf(state: GameState, data: GameData = gameData): RealmDef {
  const realm = data.realms.find((r) => r.id === state.realmId);
  if (!realm) throw new Error(`狀態：找不到境界 ${state.realmId}`);
  return realm;
}

function nextRealm(realm: RealmDef, data: GameData): RealmDef | undefined {
  return data.realms[data.realms.findIndex((r) => r.id === realm.id) + 1];
}

/** 修為已滿、卡在最後一階段的瓶頸（需要手動突破，或後面沒有境界可進） */
export function atBottleneck(state: GameState, data: GameData = gameData): boolean {
  const realm = realmOf(state, data);
  if (state.stage !== realm.stageNames.length - 1) return false;
  if (state.cultivation < stageNeed(realm, state.stage)) return false;
  return realm.breakthrough === "manual" || nextRealm(realm, data) === undefined;
}

function addLog(state: GameState, entry: LogEntry, limit: number): GameState {
  return { ...state, log: [...state.log, entry].slice(-limit) };
}

/** 修為滿了就升級，直到修為不足或卡在瓶頸 */
function resolveStages(state: GameState, month: number, data: GameData): GameState {
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
    // 瓶頸：修為停在上限，等玩家手動突破（M2）
    return addLog(
      { ...s, cultivation: need },
      { month, kind: "bottleneck", realmId: s.realmId, stage: s.stage },
      data.config.logLimit,
    );
  }
}

function stepMonth(state: GameState, data: GameData): GameState {
  const month = state.ageMonths + 1;
  let s: GameState = { ...state, ageMonths: month };
  // 已卡在瓶頸就不再累積修為
  if (!atBottleneck(state, data)) {
    const realm = realmOf(s, data);
    const root = data.spiritRoots.find((r) => r.id === s.spiritRootId);
    if (!root) throw new Error(`狀態：找不到靈根 ${s.spiritRootId}`);
    const gain = cultivationPerMonth({
      config: data.config,
      rootMult: root.mult,
      bone: s.attributes.bone,
      realmMult: realm.cultivationMult,
      scheduleMult: 1,
      originBonus: s.cultivationBonus,
      reincarnationBonus: 0,
    });
    s = resolveStages({ ...s, cultivation: s.cultivation + gain }, month, data);
  }
  if (month >= lifespanMonths(realmOf(s, data))) {
    s = addLog({ ...s, phase: "dead" }, { month, kind: "death", realmId: s.realmId, stage: s.stage }, data.config.logLimit);
  }
  return s;
}

/** 推進 months 個月，回傳新狀態，不修改輸入。只有修行中才會推進，死亡時停止。 */
export function tick(state: GameState, months = 1, data: GameData = gameData): GameState {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`tick：months 必須是非負整數，目前為 ${months}`);
  }
  let s = state;
  for (let i = 0; i < months && s.phase === "living"; i++) s = stepMonth(s, data);
  return s;
}
