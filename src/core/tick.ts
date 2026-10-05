import { gameData } from "../data/load";
import type { GameData, ScheduleDef } from "../data/types";
import { advanceEvents } from "./events";
import { cultivationPerMonth, lifespanMonths, talentBonus } from "./formulas";
import { addLog, atBottleneck, realmOf, resolveStages, scheduleOf } from "./progress";
import { endLife } from "./review";
import { nextInt, nextRandom } from "./rng";
import type { GameState } from "./state";

// 其他模組一直從 tick 取用這些函式，維持原本的匯入路徑
export { addLog, atBottleneck, lifespanYears, nextRealm, realmOf, resolveStages, scheduleOf, scheduleOpen } from "./progress";

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
    const died = addLog(
      { ...state, rngSeed: seed },
      { month, kind: "adventureDeath", realmId: state.realmId, stage: state.stage },
      limit,
    );
    return endLife(died, "adventure", data);
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

/** 依日常安排計算一個月的修為增量 */
export function monthlyGain(state: GameState, sched: ScheduleDef, data: GameData): number {
  const realm = realmOf(state, data);
  const root = data.spiritRoots.find((r) => r.id === state.spiritRootId);
  if (!root) throw new Error(`狀態：找不到靈根 ${state.spiritRootId}`);
  return cultivationPerMonth({
    config: data.config,
    rootMult: root.mult,
    bone: state.attributes.bone,
    realmMult: realm.cultivationMult,
    scheduleMult: sched.cultivationMult,
    originBonus: state.cultivationBonus,
    reincarnationBonus: talentBonus(state.meta, data.talents, "cultivation"),
  });
}

/** 累積一個月的修為並處理升級（呼叫前須確認未卡瓶頸） */
export function addCultivation(state: GameState, sched: ScheduleDef, month: number, data: GameData): GameState {
  return resolveStages({ ...state, cultivation: state.cultivation + monthlyGain(state, sched, data) }, month, data);
}

function stepMonth(state: GameState, data: GameData): GameState {
  const month = state.ageMonths + 1;
  let s: GameState = { ...state, ageMonths: month };
  const sched = scheduleOf(s, data);
  // 已卡在瓶頸就不再累積修為
  if (!atBottleneck(state, data)) s = addCultivation(s, sched, month, data);
  s = applySchedule(s, sched, month, data);
  if (s.phase !== "living") return s;
  if (month >= lifespanMonths(realmOf(s, data), s.lifespanBonus)) {
    const died = addLog(s, { month, kind: "death", realmId: s.realmId, stage: s.stage }, data.config.logLimit);
    return endLife(died, "lifespan", data);
  }
  return advanceEvents(s, month, data);
}

/**
 * 推進 months 個月，回傳新狀態，不修改輸入。
 * 只有修行中才會推進；死亡或等待抉擇時停止。
 */
export function tick(state: GameState, months = 1, data: GameData = gameData): GameState {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`tick：months 必須是非負整數，目前為 ${months}`);
  }
  let s = state;
  for (let i = 0; i < months && s.phase === "living" && s.pendingEvent === null; i++) s = stepMonth(s, data);
  return s;
}
