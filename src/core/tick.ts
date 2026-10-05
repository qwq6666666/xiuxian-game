import { gameData } from "../data/load";
import type { GameData, RealmDef, ScheduleDef } from "../data/types";
import { cultivationPerMonth, lifespanMonths, stageNeed } from "./formulas";
import { nextInt, nextRandom } from "./rng";
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

export function nextRealm(realm: RealmDef, data: GameData = gameData): RealmDef | undefined {
  return data.realms[data.realms.findIndex((r) => r.id === realm.id) + 1];
}

/** 目前的壽元上限（年），含延壽丹 */
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

/** 日常安排的每月收穫與風險：靈石、拾得物品、歷練身亡 */
function applySchedule(state: GameState, sched: ScheduleDef, month: number, data: GameData): GameState {
  const limit = data.config.logLimit;
  let seed = state.rngSeed;
  const draw = (): number => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };

  if (sched.deathChance > 0 && draw() < sched.deathChance) {
    return addLog(
      { ...state, rngSeed: seed, phase: "dead" },
      { month, kind: "adventureDeath", realmId: state.realmId, stage: state.stage },
      limit,
    );
  }

  let stones = state.spiritStones;
  const { chance, min, max } = sched.stones;
  if (chance >= 1 || (chance > 0 && draw() < chance)) {
    if (max > min) {
      const [v, n] = nextInt(seed, min, max);
      seed = n;
      stones += v;
    } else {
      stones += min;
    }
  }

  const items = { ...state.items };
  const found: string[] = [];
  for (const f of sched.finds) {
    if (draw() < f.chance) {
      items[f.itemId] = (items[f.itemId] ?? 0) + 1;
      found.push(f.itemId);
    }
  }

  let s: GameState = { ...state, rngSeed: seed, spiritStones: stones, items };
  for (const itemId of found) {
    s = addLog(s, { month, kind: "find", realmId: s.realmId, stage: s.stage, itemId }, limit);
  }
  return s;
}

function stepMonth(state: GameState, data: GameData): GameState {
  const month = state.ageMonths + 1;
  let s: GameState = { ...state, ageMonths: month };
  const sched = scheduleOf(s, data);
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
      scheduleMult: sched.cultivationMult,
      originBonus: s.cultivationBonus,
      reincarnationBonus: 0,
    });
    s = resolveStages({ ...s, cultivation: s.cultivation + gain }, month, data);
  }
  s = applySchedule(s, sched, month, data);
  if (s.phase !== "living") return s;
  if (month >= lifespanMonths(realmOf(s, data), s.lifespanBonus)) {
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
